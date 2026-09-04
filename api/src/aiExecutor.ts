// Tool execution: tenancy enforcement (`assertOwned`) plus the direct
// org-scoped SQL dispatch for the 5 read tools (Slice 1), the loopback HTTP
// write dispatch (`callInternal`) for the 8 write tools (Slice 3, design.md
// D2), and Slice 4's navigate_to / delete_entity (two-phase confirmation via
// aiPending.ts; see executeConfirmedDeletion() near the bottom of this file).
//
// SECURITY: `assertOwned()` is the tenancy backstop for every by-id path.
// `apiRouter.ts`'s by-id GET/DELETE routes are NOT organization-scoped
// (confirmed IDOR, out of scope to fix here) — a pre-flight GET through those
// routes is therefore never a valid ownership check on its own. Several write
// routes used by the loopback dispatch below (`POST /comments`,
// `POST /stages/:id/tags`, `DELETE /stages/:stageId/tags/:tagId`,
// `PUT /stages/:id/uncomplete`) also do not scope the stage/comment id by
// organization on their own — `assertOwned()` here is the only tenancy check
// standing in front of them for assistant-driven calls.

import { db } from './apiRouter';
import type { NormalizedCall } from './aiParse';
import {
  findTool,
  LOOPBACK_PATHS,
  REFERENCE_DATA_ENTITY_TYPES,
  validateToolCallArgs,
  type ReferenceDataEntityType,
  type DeleteEntityType,
} from './aiTools';
import { resolveNavigation } from './aiNavigation';
import { issuePendingAction, type PendingActionRecord, type PendingActionView } from './aiPending';

export interface ToolContext {
  userId: number;
  organizationId: number;
  cookie: string;
  ip?: string;
}

export type ToolResult =
  | {
      ok: true;
      data: unknown;
      resources: string[];
      navigate?: string;
      pending?: { token: string; view: PendingActionView };
    }
  | { ok: false; error: string };

const ROW_CAP = 10;
const STRING_FIELD_CAP = 200;
// Discovered defect (fix batch, not one of Defects A/B/C but directly
// blocking their live verification of the required "change responsible"
// chain): SQLite's LIKE is ASCII case-insensitive only, never accent/diacritic
// -insensitive, so a plain `p.name LIKE '%panaderia%'` never matches
// "Panadería" — forcing the model to guess the exact accented spelling
// before search_projects can succeed at all, i.e. relying on model
// intelligence rather than deterministic scaffolding (the project's stated
// core premise). SEARCH_SCAN_CAP bounds the pre-filter row fetch when a
// free-text `name` is supplied; org-scoped data is small in practice.
const SEARCH_SCAN_CAP = 500;

/** Strips diacritics and case for accent/case-insensitive substring matching. Zero dependencies (native `String.prototype.normalize`). */
function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function dbAll<T = any>(sql: string, params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet<T = any>(sql: string, params: unknown[]): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: T | undefined) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function cap(value: unknown): unknown {
  if (typeof value === 'string' && value.length > STRING_FIELD_CAP) {
    return `${value.slice(0, STRING_FIELD_CAP)}...`;
  }
  return value;
}

function projectRow(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    out[field] = cap(row[field]);
  }
  return out;
}

function capRows<T extends Record<string, unknown>>(rows: T[], fields: string[]): Record<string, unknown>[] {
  return rows.slice(0, ROW_CAP).map((row) => projectRow(row, fields));
}

/**
 * Tenancy invariant: `organizationId` is always `req.user!.organizationId`,
 * never model-supplied. `stages` has no `organization_id` column, so `stage`
 * and `comment` ownership is transitive through `projects`.
 */
export async function assertOwned(
  kind: 'project' | 'stage' | 'client' | 'comment' | 'tag' | 'user' | 'stage_template',
  id: number,
  organizationId: number
): Promise<boolean> {
  let sql: string;
  switch (kind) {
    case 'project':
      sql = 'SELECT 1 FROM projects WHERE id = ? AND organization_id = ?';
      break;
    case 'stage':
      sql =
        'SELECT 1 FROM stages s JOIN projects p ON s.project_id = p.id WHERE s.id = ? AND p.organization_id = ?';
      break;
    case 'comment':
      sql =
        'SELECT 1 FROM comments c JOIN stages s ON c.stage_id = s.id JOIN projects p ON s.project_id = p.id WHERE c.id = ? AND p.organization_id = ?';
      break;
    case 'client':
      sql = 'SELECT 1 FROM clients WHERE id = ? AND organization_id = ?';
      break;
    case 'tag':
      sql = 'SELECT 1 FROM tags WHERE id = ? AND organization_id = ?';
      break;
    case 'user':
      sql = 'SELECT 1 FROM users WHERE id = ? AND organization_id = ?';
      break;
    case 'stage_template':
      sql = 'SELECT 1 FROM stage_templates WHERE id = ? AND organization_id = ?';
      break;
    default:
      return false;
  }
  const row = await dbGet(sql, [id, organizationId]);
  return Boolean(row);
}

function toolError(message: string): ToolResult {
  return { ok: false, error: message };
}

/**
 * Looks up the current user's display name and organization name for the
 * system prompt (Defect C fix) so first-person requests ("poné a mí como
 * responsable") resolve without the model interrogating the user for an id
 * it already effectively has via `ToolContext`. `ctx.userId`/`organizationId`
 * come only from `req.user` (never model-supplied) — see the tenancy note at
 * the top of this file.
 */
export async function getCurrentUserIdentity(
  ctx: ToolContext
): Promise<{ userName: string; organizationName: string } | null> {
  const row = await dbGet<{ user_name: string; organization_name: string }>(
    `SELECT u.name as user_name, o.name as organization_name
     FROM users u
     JOIN organizations o ON u.organization_id = o.id
     WHERE u.id = ? AND u.organization_id = ?`,
    [ctx.userId, ctx.organizationId]
  );
  return row ? { userName: row.user_name, organizationName: row.organization_name } : null;
}

async function execSearchProjects(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { organizationId } = ctx;
  const name = typeof args.name === 'string' ? args.name : undefined;
  const status = typeof args.status === 'string' ? args.status : undefined;
  const clientId = typeof args.client_id === 'number' ? args.client_id : undefined;
  const responsibleId = typeof args.responsible_id === 'number' ? args.responsible_id : undefined;

  let sql = `
    SELECT p.id, p.name, p.status, p.deadline, c.name as client_name
    FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE p.organization_id = ?
  `;
  const params: unknown[] = [organizationId];

  // The `name` filter is applied in JS below (accent/case-insensitive), not
  // in SQL — see normalizeForSearch()'s comment above.
  if (status) {
    sql += ' AND p.status = ?';
    params.push(status);
  } else {
    sql += " AND p.status = 'active'";
  }
  if (clientId !== undefined) {
    sql += ' AND p.client_id = ?';
    params.push(clientId);
  }
  if (responsibleId !== undefined) {
    sql += ' AND p.responsible_id = ?';
    params.push(responsibleId);
  }
  sql += ' ORDER BY p.name LIMIT ?';
  params.push(name ? SEARCH_SCAN_CAP : ROW_CAP);

  const rows = await dbAll<{ id: number; name: string; status: string; deadline: string | null; client_name: string | null }>(
    sql,
    params
  );
  const matched = name
    ? rows.filter((row) => normalizeForSearch(row.name).includes(normalizeForSearch(name)))
    : rows;

  return {
    ok: true,
    data: capRows(matched, ['id', 'name', 'status', 'deadline', 'client_name']),
    resources: [],
  };
}

async function execGetProject(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = args.project_id as number;
  const owned = await assertOwned('project', projectId, ctx.organizationId);
  if (!owned) {
    return toolError('project not found or not owned by your organization');
  }

  const project = await dbGet(
    `SELECT p.id, p.name, p.description, p.status, p.deadline, p.completed_date, c.name as client_name, u.name as responsible_name
     FROM projects p
     LEFT JOIN clients c ON p.client_id = c.id
     LEFT JOIN users u ON p.responsible_id = u.id
     WHERE p.id = ?`,
    [projectId]
  );
  if (!project) {
    return toolError('project not found or not owned by your organization');
  }

  const stages = await dbAll(
    `SELECT s.id, s.name, s.is_completed, s.order_number, s.start_date, s.estimated_end_date, s.completed_date, u.name as responsible_name
     FROM stages s
     LEFT JOIN users u ON s.responsible_id = u.id
     WHERE s.project_id = ?
     ORDER BY s.order_number
     LIMIT ?`,
    [projectId, ROW_CAP]
  );

  return {
    ok: true,
    data: {
      ...projectRow(project, [
        'id',
        'name',
        'description',
        'status',
        'deadline',
        'completed_date',
        'client_name',
        'responsible_name',
      ]),
      stages: capRows(stages, [
        'id',
        'name',
        'is_completed',
        'order_number',
        'start_date',
        'estimated_end_date',
        'completed_date',
        'responsible_name',
      ]),
    },
    resources: [],
  };
}

async function execSearchStages(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { organizationId } = ctx;
  const projectId = typeof args.project_id === 'number' ? args.project_id : undefined;
  const name = typeof args.name === 'string' ? args.name : undefined;
  const responsibleId = typeof args.responsible_id === 'number' ? args.responsible_id : undefined;
  const isCompleted = typeof args.is_completed === 'boolean' ? args.is_completed : undefined;

  // Mirrors GET /stages's hard filter (p.status = 'active') — stages of
  // paused/completed projects are not reachable here. Documented limitation,
  // not lifted (design.md D2 / Out of Scope).
  let sql = `
    SELECT s.id, s.project_id, p.name as project_name, s.name, s.is_completed, s.order_number,
           s.start_date, s.estimated_end_date, u.name as responsible_name
    FROM stages s
    INNER JOIN projects p ON s.project_id = p.id
    LEFT JOIN users u ON s.responsible_id = u.id
    WHERE p.organization_id = ? AND p.status = 'active'
  `;
  const params: unknown[] = [organizationId];

  if (projectId !== undefined) {
    sql += ' AND s.project_id = ?';
    params.push(projectId);
  }
  if (name) {
    sql += ' AND s.name LIKE ?';
    params.push(`%${name}%`);
  }
  if (responsibleId !== undefined) {
    sql += ' AND s.responsible_id = ?';
    params.push(responsibleId);
  }
  if (isCompleted !== undefined) {
    sql += ' AND s.is_completed = ?';
    params.push(isCompleted ? 1 : 0);
  }
  sql += ' ORDER BY s.project_id, s.order_number LIMIT ?';
  params.push(ROW_CAP);

  const rows = await dbAll(sql, params);
  return {
    ok: true,
    data: capRows(rows, [
      'id',
      'project_id',
      'project_name',
      'name',
      'is_completed',
      'order_number',
      'start_date',
      'estimated_end_date',
      'responsible_name',
    ]),
    resources: [],
  };
}

async function execListReferenceData(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { organizationId } = ctx;

  // entity_types is validated ad hoc here (array<enum>) — see aiTools.ts's
  // REFERENCE_DATA_ENTITY_TYPES comment for why it bypasses aiSchema.ts's
  // FieldSpec union.
  const raw = args.entity_types;
  let requested: ReferenceDataEntityType[];
  if (raw === undefined) {
    requested = [...REFERENCE_DATA_ENTITY_TYPES];
  } else if (
    Array.isArray(raw) &&
    raw.every((item) => typeof item === 'string' && (REFERENCE_DATA_ENTITY_TYPES as readonly string[]).includes(item))
  ) {
    requested = raw as ReferenceDataEntityType[];
  } else {
    return toolError(
      `entity_types must be an array of: ${REFERENCE_DATA_ENTITY_TYPES.join('|')}`
    );
  }

  // Optional partial-name filter (accent/case-insensitive), same strategy as
  // search_projects: rows are pre-fetched without the tight ROW_CAP and the
  // substring match runs in JS via normalizeForSearch().
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : undefined;
  const nameFilter = (value: string) => normalizeForSearch(value).includes(normalizeForSearch(name!));

  const data: Record<string, unknown[]> = {};

  if (requested.includes('clients')) {
    const rows = await dbAll(
      'SELECT id, name, email FROM clients WHERE organization_id = ? ORDER BY name LIMIT ?',
      [organizationId, name ? SEARCH_SCAN_CAP : ROW_CAP]
    );
    data.clients = capRows(name ? rows.filter((row) => nameFilter(row.name)) : rows, ['id', 'name', 'email']);
  }
  if (requested.includes('users')) {
    // Users are listed in FULL (no ROW_CAP): organizations have a handful of
    // users and the assistant must be able to resolve any of them by name.
    const rows = await dbAll(
      'SELECT id, name, role FROM users WHERE organization_id = ? ORDER BY name',
      [organizationId]
    );
    data.users = name
      ? capRows(rows.filter((row) => nameFilter(row.name)), ['id', 'name', 'role'])
      : rows.map((row) => projectRow(row, ['id', 'name', 'role']));
  }
  if (requested.includes('tags')) {
    const rows = await dbAll(
      'SELECT id, name, color FROM tags WHERE organization_id = ? ORDER BY name LIMIT ?',
      [organizationId, name ? SEARCH_SCAN_CAP : ROW_CAP]
    );
    data.tags = capRows(name ? rows.filter((row) => nameFilter(row.name)) : rows, ['id', 'name', 'color']);
  }
  if (requested.includes('stage_templates')) {
    const rows = await dbAll(
      'SELECT id, name, order_number FROM stage_templates WHERE organization_id = ? ORDER BY order_number LIMIT ?',
      [organizationId, name ? SEARCH_SCAN_CAP : ROW_CAP]
    );
    data.stage_templates = name
      ? capRows(rows.filter((row) => nameFilter(row.name)), ['id', 'name', 'order_number'])
      : rows;
  }

  return { ok: true, data, resources: [] };
}

async function execGetSummary(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { organizationId } = ctx;
  const currentYear = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric' }).format(
      new Date()
    )
  );
  const year = typeof args.year === 'number' ? args.year : currentYear;
  const yearExpr = (column: string) =>
    `CASE WHEN length(${column}) = 10 THEN substr(${column}, 1, 4) ELSE strftime('%Y', datetime(${column}, '-3 hours')) END`;

  const counts = await dbGet<{ created_count: number; completed_count: number }>(
    `SELECT
       SUM(CASE WHEN ${yearExpr('p.created_at')} = ? THEN 1 ELSE 0 END) as created_count,
       SUM(CASE WHEN ${yearExpr('p.completed_date')} = ? THEN 1 ELSE 0 END) as completed_count
     FROM projects p WHERE p.organization_id = ?`,
    [String(year), String(year), organizationId]
  );

  const stages = await dbAll(
    `SELECT s.name as stage_name,
            COALESCE(SUM(CASE WHEN sc.started_at IS NULL THEN 0 ELSE MAX(0, CAST(ROUND(
              julianday(date(COALESCE(sc.ended_at, CURRENT_TIMESTAMP), '-3 hours'))
              - julianday(date(sc.started_at, '-3 hours'))
            ) AS INTEGER)) END), 0) as total_days,
            COALESCE(SUM(CASE
              WHEN sc.ended_at IS NOT NULL AND sc.started_at IS NOT NULL AND sc.deadline_used IS NOT NULL
                AND date(sc.ended_at, '-3 hours') > date(sc.deadline_used, '-3 hours')
              THEN 1 ELSE 0 END), 0) as delayed_cycles
     FROM projects p
     INNER JOIN stages s ON s.project_id = p.id
     LEFT JOIN stage_cycles sc ON sc.stage_id = s.id AND sc.project_id = p.id
     WHERE p.organization_id = ? AND ${yearExpr('p.completed_date')} = ?
     GROUP BY s.name
     ORDER BY MIN(s.order_number), s.name
     LIMIT ?`,
    [organizationId, String(year), ROW_CAP]
  );

  return {
    ok: true,
    data: {
      year,
      projects_created: Number(counts?.created_count || 0),
      projects_completed: Number(counts?.completed_count || 0),
      stages: capRows(stages as Record<string, unknown>[], ['stage_name', 'total_days', 'delayed_cycles']),
    },
    resources: [],
  };
}

// ---------------------------------------------------------------------------
// Write tool dispatch: loopback HTTP (design.md D2). One local hop to the
// same Express process, carrying the caller's own `auth_token` cookie so
// `authMiddleware`, existing route validation, cascade semantics and
// `logAudit` all stay single-sourced in `apiRouter.ts`, which this file
// never imports beyond the pre-existing `db` handle.
// ---------------------------------------------------------------------------

const LOOPBACK_PORT = Number(process.env.PORT) || 3000;
// Defect fix (fix batch): raised from 10_000ms. The loopback target is this
// same single-threaded Node process, which is simultaneously (a) still
// running the assistant turn's own request handler (JSON parsing/response
// building for THIS fetch) and (b) doing synchronous-ish sqlite3 driver work
// for the write itself — self-call contention, not real network latency.
// 10s was tight enough that a normal write under ordinary load could abort
// client-side while the write still committed server-side (see the
// `clients`/`projects` duplicate rows this fix batch cleaned up: the log
// showed "loopback request failed ... timeout" immediately followed by a
// second identical row). 25_000ms gives ~2.5x headroom for that contention
// while staying well inside the turn's wall-clock budget: with the default
// AiConfig, `requestTimeoutMs` is 60_000ms and aiLoop.ts's `deadline` is
// `requestTimeoutMs * 3` = 180_000ms for the whole turn — one 25s loopback
// stall is a small fraction of that budget, so raising it here cannot by
// itself push a turn past `turn_deadline`. Fix 2's single-turn idempotency
// guard (aiLoop.ts) also means a slow-but-eventually-successful loopback can
// no longer produce a duplicate write even if the model tries again.
const LOOPBACK_TIMEOUT_MS = 25_000;

type LoopbackResult = { ok: true; status: number; json: unknown } | { ok: false; error: string };

/** Every current `callInternal()` caller uses a state-changing method — all 5
 * read tools go straight to SQLite (see the exec* functions above), never
 * through this loopback. `'GET'` is included here only so a future read tool
 * routed through this same loopback inherits the correct "safe to retry"
 * semantics automatically instead of the UNKNOWN-outcome one below. */
type LoopbackMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Identifies which tool triggered a `callInternal()` failure, so the shared
 * sanitizer below (`sanitizeToolError`) can map a known raw driver/SQL
 * signature to a deterministic Spanish message without `callInternal` itself
 * needing to know anything about individual routes.
 */
interface ToolErrorContext {
  toolName: string;
  entityType?: string;
}

// Detects a raw driver/SQL error leaking through apiRouter.ts's own error
// handling (out of scope to fix there — see file header). Reliability must
// not depend on a weak model paraphrasing an opaque string before showing it
// to the user (design.md core premise), so every tool-execution error path
// that goes through `callInternal()` — not only `delete_entity` confirmations
// — is routed through this single shared sanitizer before it ever reaches
// model context or the client.
const RAW_DRIVER_ERROR_PATTERN = /sqlite_constraint|constraint failed/i;

function sanitizeToolError(rawError: string, context: ToolErrorContext): string {
  if (!RAW_DRIVER_ERROR_PATTERN.test(rawError)) return rawError;

  // Known bug: comments.author is TEXT NOT NULL with no default, and
  // POST /comments's INSERT never supplies it (apiRouter.ts:2259, out of
  // scope to fix here) — every add_comment call currently fails this way.
  if (context.toolName === 'add_comment') {
    return 'No se pueden crear comentarios en este momento debido a un problema de configuración de la base de datos. Contactá a un administrador.';
  }

  // Known bug: audit_logs.user_id is NOT NULL while its own FK declares
  // ON DELETE SET NULL — a genuine schema self-contradiction (apiRouter.ts,
  // out of scope to fix here) — surfaces when deleting a user with audit
  // history.
  if (context.toolName === 'delete_entity' && context.entityType === 'user') {
    return 'No se puede eliminar el usuario porque tiene etapas asignadas o actividad registrada en el sistema. Reasigná sus etapas a otra persona y volvé a intentarlo.';
  }

  if (context.toolName === 'delete_entity') {
    return 'No se pudo completar la eliminación porque el registro tiene datos relacionados que lo impiden.';
  }

  return 'No se pudo completar la operación porque los datos no cumplen con una restricción del sistema.';
}

/**
 * Dispatches one write to the app's own HTTP surface at 127.0.0.1. `path`
 * MUST come from aiTools.ts's LOOPBACK_PATHS table with only validated
 * integers interpolated — never a model-supplied string. `/api/assistant/*`
 * is intentionally absent from that table; the guard below is defense in
 * depth against a future path-table mistake, not the primary control.
 *
 * `errorContext` is used only to sanitize a non-2xx response through
 * `sanitizeToolError()` — it never affects the request itself.
 */
async function callInternal(
  method: LoopbackMethod,
  path: string,
  ctx: ToolContext,
  body: Record<string, unknown> | undefined,
  errorContext: ToolErrorContext
): Promise<LoopbackResult> {
  if (path.startsWith('/assistant')) {
    console.error(`[aiExecutor] refused recursive loopback path: ${path}`);
    return { ok: false, error: 'internal error: recursive loopback path rejected' };
  }

  const url = `http://127.0.0.1:${LOOPBACK_PORT}/api${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ctx.cookie) headers.Cookie = ctx.cookie;
  if (ctx.ip) headers['X-Forwarded-For'] = ctx.ip;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(LOOPBACK_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    console.error(`[aiExecutor] loopback request failed for ${method} ${path}:`, detail);

    // Fix 1 (defect-fix batch): a GET is read-only and has no side effect, so
    // an abort here really is safe to retry. Every other method dispatched
    // through this loopback (POST/PUT/DELETE — the only ones any current
    // tool actually uses) is state-changing: this loopback hop targets the
    // SAME process, so a client-side abort/timeout does NOT mean the write
    // failed — it very likely already committed server-side before the
    // AbortSignal fired. Telling the model "try again" here previously
    // caused an at-least-once duplicate write. The wording below is
    // deliberately blunt ("UNKNOWN", "Do NOT repeat") so a weak model cannot
    // misread it as permission to resend the identical call, and steers it
    // toward the one genuinely safe move: verify via a read/search tool
    // before doing anything else. Fix 2's single-turn idempotency guard in
    // aiLoop.ts is the deterministic backstop in case the model retries
    // anyway.
    if (method === 'GET') {
      return { ok: false, error: 'internal read request failed; this is safe to retry' };
    }
    return {
      ok: false,
      error:
        'internal write request timed out — outcome UNKNOWN, it may already have been applied server-side. ' +
        'Do NOT repeat this exact call. Call a read/search tool first to check the current state, ' +
        'then decide what (if anything) still needs to be done.',
    };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message =
      json && typeof json === 'object' && typeof (json as Record<string, unknown>).error === 'string'
        ? ((json as Record<string, unknown>).error as string)
        : `request failed with status ${response.status}`;
    return { ok: false, error: sanitizeToolError(message, errorContext) };
  }

  return { ok: true, status: response.status, json };
}

async function execCreateProject(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { name, description, deadline } = args;
  const clientId = typeof args.client_id === 'number' ? args.client_id : undefined;
  const responsibleId = typeof args.responsible_id === 'number' ? args.responsible_id : undefined;

  if (clientId !== undefined && !(await assertOwned('client', clientId, ctx.organizationId))) {
    return toolError('client not found or not owned by your organization');
  }
  if (responsibleId !== undefined && !(await assertOwned('user', responsibleId, ctx.organizationId))) {
    return toolError('responsible user not found or not owned by your organization');
  }

  const result = await callInternal(
    'POST',
    LOOPBACK_PATHS.createProject,
    ctx,
    {
      name,
      description,
      client_id: clientId,
      responsible_id: responsibleId,
      deadline,
    },
    { toolName: 'create_project' }
  );
  if (!result.ok) return toolError(result.error);
  return { ok: true, data: result.json, resources: ['projects'] };
}

async function execUpdateProject(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = args.project_id as number;
  const owned = await assertOwned('project', projectId, ctx.organizationId);
  if (!owned) return toolError('project not found or not owned by your organization');

  const { name, description, deadline } = args;
  const clientId = typeof args.client_id === 'number' ? args.client_id : undefined;
  const responsibleId = typeof args.responsible_id === 'number' ? args.responsible_id : undefined;

  if (
    name === undefined &&
    description === undefined &&
    deadline === undefined &&
    clientId === undefined &&
    responsibleId === undefined
  ) {
    return toolError(
      'at least one field to update is required: name, description, deadline, client_id, responsible_id'
    );
  }
  if (clientId !== undefined && !(await assertOwned('client', clientId, ctx.organizationId))) {
    return toolError('client not found or not owned by your organization');
  }
  if (responsibleId !== undefined && !(await assertOwned('user', responsibleId, ctx.organizationId))) {
    return toolError('responsible user not found or not owned by your organization');
  }

  const result = await callInternal(
    'PUT',
    LOOPBACK_PATHS.project(projectId),
    ctx,
    {
      name,
      description,
      deadline,
      client_id: clientId,
      responsible_id: responsibleId,
    },
    { toolName: 'update_project' }
  );
  if (!result.ok) return toolError(result.error);
  return { ok: true, data: result.json, resources: ['projects', `project:${projectId}`] };
}

async function execSetProjectStatus(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = args.project_id as number;
  const status = args.status as string;

  const owned = await assertOwned('project', projectId, ctx.organizationId);
  if (!owned) return toolError('project not found or not owned by your organization');

  const result = await callInternal('PUT', LOOPBACK_PATHS.project(projectId), ctx, { status }, {
    toolName: 'set_project_status',
  });
  if (!result.ok) return toolError(result.error);
  return { ok: true, data: result.json, resources: ['projects', `project:${projectId}`] };
}

const STAGE_ACTION_PATHS: Record<string, (id: number) => string> = {
  start: LOOPBACK_PATHS.stageStart,
  unstart: LOOPBACK_PATHS.stageUnstart,
  complete: LOOPBACK_PATHS.stageComplete,
  uncomplete: LOOPBACK_PATHS.stageUncomplete,
};

async function execSetStageState(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const stageId = args.stage_id as number;
  const action = args.action as string;

  const owned = await assertOwned('stage', stageId, ctx.organizationId);
  if (!owned) return toolError('stage not found or not owned by your organization');

  const pathBuilder = STAGE_ACTION_PATHS[action];
  if (!pathBuilder) return toolError(`unrecognized action: ${action}`);

  const result = await callInternal('PUT', pathBuilder(stageId), ctx, undefined, {
    toolName: 'set_stage_state',
  });
  if (!result.ok) return toolError(result.error);
  return { ok: true, data: result.json, resources: ['stages', `stage:${stageId}`] };
}

async function execManageStageCycle(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const stageId = args.stage_id as number;
  const action = args.action as string;

  const owned = await assertOwned('stage', stageId, ctx.organizationId);
  if (!owned) return toolError('stage not found or not owned by your organization');

  if (action === 'start') {
    const result = await callInternal('POST', LOOPBACK_PATHS.stageCycles(stageId), ctx, undefined, {
      toolName: 'manage_stage_cycle',
    });
    if (!result.ok) return toolError(result.error);
    return { ok: true, data: result.json, resources: ['stages', `stage:${stageId}`] };
  }

  // action === 'finish'
  const cycleId = typeof args.cycle_id === 'number' ? args.cycle_id : undefined;
  if (cycleId === undefined) {
    return toolError('cycle_id is required when action is finish');
  }
  const result = await callInternal('PUT', LOOPBACK_PATHS.stageCycleFinish(stageId, cycleId), ctx, undefined, {
    toolName: 'manage_stage_cycle',
  });
  if (!result.ok) return toolError(result.error);
  return { ok: true, data: result.json, resources: ['stages', `stage:${stageId}`] };
}

async function execAddComment(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const stageId = args.stage_id as number;
  const content = args.content as string;

  const owned = await assertOwned('stage', stageId, ctx.organizationId);
  if (!owned) return toolError('stage not found or not owned by your organization');

  const result = await callInternal(
    'POST',
    LOOPBACK_PATHS.comments,
    ctx,
    { stage_id: stageId, content },
    { toolName: 'add_comment' }
  );
  if (!result.ok) return toolError(result.error);
  return { ok: true, data: result.json, resources: ['comments', `stage:${stageId}`] };
}

async function execSetStageTag(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const stageId = args.stage_id as number;
  const tagId = args.tag_id as number;
  const action = args.action as string;

  const stageOwned = await assertOwned('stage', stageId, ctx.organizationId);
  if (!stageOwned) return toolError('stage not found or not owned by your organization');
  const tagOwned = await assertOwned('tag', tagId, ctx.organizationId);
  if (!tagOwned) return toolError('tag not found or not owned by your organization');

  if (action === 'add') {
    const result = await callInternal(
      'POST',
      LOOPBACK_PATHS.stageTags(stageId),
      ctx,
      { tag_id: tagId },
      { toolName: 'set_stage_tag' }
    );
    if (!result.ok) return toolError(result.error);
    return { ok: true, data: result.json, resources: ['stages', `stage:${stageId}`] };
  }

  // action === 'remove'
  const result = await callInternal('DELETE', LOOPBACK_PATHS.stageTagRemove(stageId, tagId), ctx, undefined, {
    toolName: 'set_stage_tag',
  });
  if (!result.ok) return toolError(result.error);
  return { ok: true, data: result.json, resources: ['stages', `stage:${stageId}`] };
}

async function execCreateClient(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { name, email, phone } = args;
  const result = await callInternal(
    'POST',
    LOOPBACK_PATHS.clients,
    ctx,
    { name, email, phone },
    { toolName: 'create_client' }
  );
  if (!result.ok) return toolError(result.error);
  return { ok: true, data: result.json, resources: ['clients'] };
}

// ---------------------------------------------------------------------------
// navigate_to (Slice 4, design.md "Navigation"). Route allow-listing and
// parameterized-route ownership re-validation live in aiNavigation.ts,
// self-contained to avoid a circular import with this file.
// ---------------------------------------------------------------------------

async function execNavigateTo(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const route = args.route as string;
  const entityId = typeof args.entity_id === 'number' ? args.entity_id : undefined;

  const result = await resolveNavigation(route, entityId, ctx.organizationId);
  if (!result.ok) return toolError(result.error);

  return {
    ok: true,
    data: { path: result.path, entityName: result.entityName },
    resources: [],
    navigate: result.path,
  };
}

// ---------------------------------------------------------------------------
// delete_entity (Slice 4, design.md ADR D4 + Out of Scope note; widened to
// project|stage|client|comment|tag|stage_template|user per the orchestrator
// directive for this slice). NEVER mutates on the model's turn — issues a
// pending action through aiPending.ts and stops. Execution only happens via
// a separate client-initiated POST /api/assistant/confirm — see
// assistantRouter.ts and executeConfirmedDeletion() below.
// ---------------------------------------------------------------------------

const DELETE_LOOPBACK_PATHS: Record<DeleteEntityType, (id: number) => string> = {
  project: LOOPBACK_PATHS.project,
  stage: LOOPBACK_PATHS.stage,
  client: LOOPBACK_PATHS.client,
  comment: LOOPBACK_PATHS.comment,
  tag: LOOPBACK_PATHS.tag,
  stage_template: LOOPBACK_PATHS.stageTemplate,
  user: LOOPBACK_PATHS.user,
};

// Resource-hint collection key per entity type (AssistantDataBus's hint
// vocabulary). `stage_template` and `user` have no page currently
// registered — emitting them is a documented, harmless no-op (design.md
// "Refetch Bus": an unregistered key just means the page refetches on its
// next mount).
const DELETE_RESOURCE_COLLECTION: Record<DeleteEntityType, string> = {
  project: 'projects',
  stage: 'stages',
  client: 'clients',
  comment: 'comments',
  tag: 'tags',
  stage_template: 'stage_templates',
  user: 'users',
};

// Spanish, user-facing: rendered verbatim in PendingActionCard.tsx, so the
// human sees exactly what the deletion cascades into before confirming
// (specs/assistant-actions/spec.md, "Destructive Action Pending State").
const DELETE_CONSEQUENCES: Record<DeleteEntityType, string[]> = {
  project: [
    'Se eliminarán todas las etapas del proyecto.',
    'Se eliminarán en cascada los ciclos de trabajo, comentarios y etiquetas asociados a esas etapas.',
  ],
  stage: [
    'Se eliminarán los ciclos de trabajo registrados en esta etapa.',
    'Se eliminarán los comentarios de esta etapa.',
    'Se eliminarán los vínculos de etiquetas de esta etapa.',
  ],
  client: ['Los proyectos vinculados a este cliente quedarán sin cliente asignado; los proyectos no se eliminan.'],
  comment: ['Esta acción no tiene efectos en cascada sobre otros datos.'],
  tag: ['Se eliminarán los vínculos de esta etiqueta con todas las etapas donde esté asignada.'],
  stage_template: [
    'Las etapas ya creadas a partir de esta plantilla no se ven afectadas; solo se elimina la plantilla.',
  ],
  user: [
    'Si el usuario es responsable de alguna etapa, la eliminación fallará hasta que esas etapas se reasignen a otra persona.',
  ],
};

interface EntityDisplay {
  name: string;
  parentStageId?: number;
}

async function resolveEntityDisplay(entityType: DeleteEntityType, id: number): Promise<EntityDisplay | null> {
  switch (entityType) {
    case 'project': {
      const row = await dbGet<{ name: string }>('SELECT name FROM projects WHERE id = ?', [id]);
      return row ? { name: row.name } : null;
    }
    case 'stage': {
      const row = await dbGet<{ name: string }>('SELECT name FROM stages WHERE id = ?', [id]);
      return row ? { name: row.name } : null;
    }
    case 'client': {
      const row = await dbGet<{ name: string }>('SELECT name FROM clients WHERE id = ?', [id]);
      return row ? { name: row.name } : null;
    }
    case 'comment': {
      const row = await dbGet<{ content: string; stage_id: number }>(
        'SELECT content, stage_id FROM comments WHERE id = ?',
        [id]
      );
      if (!row) return null;
      const label = row.content.length > 60 ? `${row.content.slice(0, 60)}…` : row.content;
      return { name: label, parentStageId: row.stage_id };
    }
    case 'tag': {
      const row = await dbGet<{ name: string }>('SELECT name FROM tags WHERE id = ?', [id]);
      return row ? { name: row.name } : null;
    }
    case 'stage_template': {
      const row = await dbGet<{ name: string }>('SELECT name FROM stage_templates WHERE id = ?', [id]);
      return row ? { name: row.name } : null;
    }
    case 'user': {
      const row = await dbGet<{ name: string }>('SELECT name FROM users WHERE id = ?', [id]);
      return row ? { name: row.name } : null;
    }
    default:
      return null;
  }
}

function resourcesForDeletion(entityType: DeleteEntityType, id: number, parentStageId?: number): string[] {
  const collection = DELETE_RESOURCE_COLLECTION[entityType];
  switch (entityType) {
    case 'project':
      return [collection, `project:${id}`];
    case 'stage':
      return [collection, `stage:${id}`];
    case 'comment':
      return parentStageId !== undefined ? [collection, `stage:${parentStageId}`] : [collection];
    default:
      return [collection];
  }
}

async function execDeleteEntity(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const entityType = args.entity_type as DeleteEntityType;
  const entityId = args.entity_id as number;

  const owned = await assertOwned(entityType, entityId, ctx.organizationId);
  if (!owned) return toolError(`${entityType} not found or not owned by your organization`);

  const display = await resolveEntityDisplay(entityType, entityId);
  if (!display) return toolError(`${entityType} not found or not owned by your organization`);

  const path = DELETE_LOOPBACK_PATHS[entityType](entityId);
  const resources = resourcesForDeletion(entityType, entityId, display.parentStageId);

  const { token, view } = issuePendingAction({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    entityType,
    entityId,
    entityName: display.name,
    consequences: DELETE_CONSEQUENCES[entityType],
    method: 'DELETE',
    path,
    resources,
  });

  // The model never sees the token — aiLoop.ts stops the turn immediately
  // on a pending result and never feeds this ToolResult's contents back
  // into model context (design.md "Bounded Agent Loop": "Destructive: Loop
  // stops immediately; the model never observes the outcome").
  return { ok: true, data: { pendingIssued: true }, resources: [], pending: { token, view } };
}

/**
 * Executes a previously confirmed deletion. Called only from
 * assistantRouter.ts's POST /confirm, only after aiPending.ts's
 * consumePendingAction() has already single-use-verified the token against
 * the requesting user and organization.
 *
 * A raw SQLite error leaking through apiRouter.ts's own error handling
 * (e.g. `DELETE /users/:id` only special-cases the literal substring
 * "FOREIGN KEY constraint failed", but the real failure on this schema is
 * `audit_logs.user_id`'s NOT NULL constraint, which SQLite reports as a
 * plain constraint failure, not that exact substring) is sanitized by
 * `callInternal()` via `sanitizeToolError()` before it ever reaches this
 * function's caller — see that shared sanitizer above. `apiRouter.ts` itself
 * stays untouched (out of scope).
 */
export async function executeConfirmedDeletion(
  record: Pick<PendingActionRecord, 'method' | 'path' | 'resources' | 'entityType'>,
  ctx: ToolContext
): Promise<{ ok: true; resources: string[] } | { ok: false; error: string }> {
  const result = await callInternal(record.method, record.path, ctx, undefined, {
    toolName: 'delete_entity',
    entityType: record.entityType,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, resources: record.resources };
}

/** Dispatches a validated, normalized tool call. */
export async function executeTool(call: NormalizedCall, ctx: ToolContext): Promise<ToolResult> {
  const tool = findTool(call.name);
  if (!tool) {
    return toolError(`unknown tool: ${call.name}`);
  }

  const validation = validateToolCallArgs(tool, call.args);
  if (!validation.ok) {
    return toolError(validation.errors.map((e) => `${e.field}: ${e.message}`).join('; '));
  }

  try {
    switch (call.name) {
      case 'search_projects':
        return await execSearchProjects(validation.value, ctx);
      case 'get_project':
        return await execGetProject(validation.value, ctx);
      case 'search_stages':
        return await execSearchStages(validation.value, ctx);
      case 'list_reference_data':
        // entity_types bypasses aiSchema — validated inside execListReferenceData from the raw call args.
        return await execListReferenceData(call.args, ctx);
      case 'get_summary':
        return await execGetSummary(validation.value, ctx);
      case 'create_project':
        return await execCreateProject(validation.value, ctx);
      case 'update_project':
        return await execUpdateProject(validation.value, ctx);
      case 'set_project_status':
        return await execSetProjectStatus(validation.value, ctx);
      case 'set_stage_state':
        return await execSetStageState(validation.value, ctx);
      case 'manage_stage_cycle':
        return await execManageStageCycle(validation.value, ctx);
      case 'add_comment':
        return await execAddComment(validation.value, ctx);
      case 'set_stage_tag':
        return await execSetStageTag(validation.value, ctx);
      case 'create_client':
        return await execCreateClient(validation.value, ctx);
      case 'navigate_to':
        return await execNavigateTo(validation.value, ctx);
      case 'delete_entity':
        return await execDeleteEntity(validation.value, ctx);
      default:
        return toolError(`tool not implemented in this slice: ${call.name}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    console.error(`[aiExecutor] error executing ${call.name}:`, detail);
    return toolError(`internal error executing ${call.name}`);
  }
}
