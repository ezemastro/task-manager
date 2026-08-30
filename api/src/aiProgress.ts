// In-memory, per-turn progress step store for the assistant's live "what is
// happening" feed (client-generated turn id + polling). Mirrors aiPending.ts's
// pattern: a single-process `Map` with a TTL sweep, no SQLite table, no write
// of any kind to the `/app/data` bind mount.
//
// Every step is created and mutated SERVER-SIDE, from real tool dispatch
// events in aiLoop.ts — never parsed or inferred from the model's prose (see
// aiProgressLabels.ts). The client-generated turn id only selects which
// in-memory bucket to read/write; it carries no authority of its own —
// readProgress() always re-checks the requesting user's identity before
// returning anything, so one user can never read another user's turn
// progress even if they somehow learned or guessed the turn id.
//
// The polling endpoint (assistantRouter.ts's GET /progress/:turnId) is a
// pure enhancement: the same step objects created here are also collected
// locally by aiLoop.ts and returned verbatim as TurnResponse.steps, so a
// client that missed every poll (or never sent a turn id at all) still ends
// up with the complete, correct step list once the chat response resolves.

export type ProgressStepKind = 'phase' | 'tool' | 'system';
export type ProgressStepStatus = 'running' | 'done' | 'error';

export interface ProgressStep {
  id: string;
  kind: ProgressStepKind;
  /** Stable machine field: the tool name, present only for kind === 'tool'. */
  tool?: string;
  status: ProgressStepStatus;
  /** Human-readable Spanish label, generated server-side — see aiProgressLabels.ts. */
  label: string;
  startedAt: number;
  endedAt?: number;
}

interface ProgressTurnRecord {
  userId: number;
  organizationId: number;
  steps: ProgressStep[];
  expiresAtMs: number;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 300;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_STEPS_PER_TURN = 60;
const MAX_TURN_ID_LENGTH = 100;

const store = new Map<string, ProgressTurnRecord>();

function evictOldestIfFull(): void {
  if (store.size < MAX_ENTRIES) return;
  const oldestKey = store.keys().next().value;
  if (oldestKey !== undefined) store.delete(oldestKey);
}

function sweep(): void {
  const now = Date.now();
  for (const [turnId, record] of store) {
    if (record.expiresAtMs <= now) store.delete(turnId);
  }
}

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
sweepTimer.unref();

let stepCounter = 0;
function nextStepId(): string {
  stepCounter += 1;
  return `step-${Date.now()}-${stepCounter}`;
}

/** A client-supplied turn id is only ever used as a bucket key — never trusted for identity. Bounded length, string-only. */
export function isValidTurnId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TURN_ID_LENGTH;
}

/**
 * Opens (or re-opens) the in-memory bucket for a turn. A no-op when `turnId`
 * is absent or invalid — every other function in this module already
 * degrades gracefully in that case, so the whole feature is optional by
 * construction (design requirement: absent/unknown turn id must never error).
 */
export function createProgressTurn(turnId: string | undefined, userId: number, organizationId: number): void {
  if (!isValidTurnId(turnId)) return;
  evictOldestIfFull();
  store.set(turnId, { userId, organizationId, steps: [], expiresAtMs: Date.now() + TTL_MS });
}

/**
 * Records a new step. Returns the step object itself (not just an id) so the
 * caller (aiLoop.ts) can also keep a local reference for `finishStep()` and
 * for building the authoritative `TurnResponse.steps` snapshot — the exact
 * same object is stored in this module's map when a turn id is present, so
 * mutating it via `finishStep()` updates both the poll-visible copy and the
 * caller's local copy at once, with no second lookup required.
 */
export function addStep(
  turnId: string | undefined,
  input: { kind: ProgressStepKind; tool?: string; status: ProgressStepStatus; label: string }
): ProgressStep {
  const step: ProgressStep = { id: nextStepId(), startedAt: Date.now(), ...input };
  if (isValidTurnId(turnId)) {
    const record = store.get(turnId);
    if (record && record.steps.length < MAX_STEPS_PER_TURN) {
      record.steps.push(step);
    }
  }
  return step;
}

/** Mutates a step in place (status/label/endedAt). Safe to call even if the step's turn was never persisted (turnId absent). */
export function finishStep(step: ProgressStep, patch: { status: ProgressStepStatus; label: string }): void {
  step.status = patch.status;
  step.label = patch.label;
  step.endedAt = Date.now();
}

/**
 * Reads the current step list for a turn, scoped to the requesting user.
 * Returns `null` when the turn is unknown, expired, or NOT owned by
 * (userId, organizationId) — the caller (assistantRouter.ts) maps `null` to
 * an empty, still-200 response rather than an error, so this never leaks
 * whether a turn id exists for a different user.
 */
export function readProgress(turnId: string, userId: number, organizationId: number): ProgressStep[] | null {
  const record = store.get(turnId);
  if (!record) return null;
  if (record.userId !== userId || record.organizationId !== organizationId) return null;
  return record.steps;
}
