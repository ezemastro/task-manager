// Route allow-list validation and ownership re-validation for navigate_to
// (design.md "Navigation", specs/assistant-navigation/spec.md).
//
// Kept self-contained — its own org-scoped SQL against the imported `db`,
// mirroring aiExecutor.ts's assertOwned pattern — rather than importing
// assertOwned from aiExecutor.ts. Reusing it would create a circular import:
// aiExecutor.ts needs resolveNavigation() for its navigate_to dispatch, and
// aiExecutor.ts already owns assertOwned, so aiNavigation.ts would import
// aiExecutor.ts while aiExecutor.ts imports aiNavigation.ts.

import { db } from './apiRouter';

/** The eight static protected routes (specs/assistant-navigation/spec.md). */
export const STATIC_ROUTES = [
  '/dashboard',
  '/stages',
  '/completed-projects',
  '/paused-projects',
  '/users-management',
  '/clients-management',
  '/stage-templates',
  '/summary',
] as const;

/**
 * Full enum surface for navigate_to's `route` argument: the eight static
 * paths plus two tokens standing in for the parameterized routes
 * (`/projects/:id`, `/stages/:id`), resolved and ownership-checked below.
 * Ten tokens total — matches design.md's system-prompt enum echo.
 */
export const NAVIGATE_ROUTE_TOKENS = [...STATIC_ROUTES, 'project_detail', 'stage_detail'] as const;
export type NavigateRouteToken = (typeof NAVIGATE_ROUTE_TOKENS)[number];

export type NavigationResult =
  | { ok: true; path: string; entityName?: string }
  | { ok: false; error: string };

function dbGet<T = any>(sql: string, params: unknown[]): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: T | undefined) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Validates `route` against the allow-list. For the two parameterized
 * tokens, re-validates that `entityId` exists and belongs to
 * `organizationId` — stage ownership joined through `projects`, since
 * `stages` has no `organization_id` column — before returning a directive.
 * This re-validation happens even when the id was resolved by a prior tool
 * call earlier in the same conversation (specs/assistant-navigation.md,
 * "Parameterized Route Ownership Re-Validation").
 */
export async function resolveNavigation(
  route: string,
  entityId: number | undefined,
  organizationId: number
): Promise<NavigationResult> {
  if ((STATIC_ROUTES as readonly string[]).includes(route)) {
    return { ok: true, path: route };
  }

  if (route === 'project_detail') {
    if (entityId === undefined) {
      return { ok: false, error: 'entity_id is required for route project_detail' };
    }
    // `name` is selected alongside the ownership check (same query, no extra
    // round trip) only to surface a real, factual entity name for the
    // progress-step label (aiProgressLabels.ts) — never used for anything
    // else here.
    const row = await dbGet<{ name: string }>(
      'SELECT name FROM projects WHERE id = ? AND organization_id = ?',
      [entityId, organizationId]
    );
    if (!row) return { ok: false, error: 'project not found or not owned by your organization' };
    return { ok: true, path: `/projects/${entityId}`, entityName: row.name };
  }

  if (route === 'stage_detail') {
    if (entityId === undefined) {
      return { ok: false, error: 'entity_id is required for route stage_detail' };
    }
    const row = await dbGet<{ name: string }>(
      'SELECT s.name as name FROM stages s JOIN projects p ON s.project_id = p.id WHERE s.id = ? AND p.organization_id = ?',
      [entityId, organizationId]
    );
    if (!row) return { ok: false, error: 'stage not found or not owned by your organization' };
    return { ok: true, path: `/stages/${entityId}`, entityName: row.name };
  }

  // Not on the allow-list. Reachable only if a caller bypasses aiSchema's
  // enum check on the `route` field (defense in depth — schema validation
  // is the primary control).
  return { ok: false, error: `route not allowed: ${route}` };
}
