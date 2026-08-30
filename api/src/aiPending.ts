// In-memory confirmation token store for destructive actions (design.md
// ADR D4). No SQLite table, no migration, no write of any kind to the
// `/app/data` bind mount — a single container/process, TTL 5 minutes, cap
// 200 entries (oldest evicted), tokens minted with `crypto.randomUUID()`
// (Node core, zero new dependency).
//
// The model can never mint or self-confirm a token: tokens only ever
// originate from issuePendingAction() below, called exclusively from
// aiExecutor.ts's execDeleteEntity() on the server side. Execution only
// happens through a separate, client-initiated POST /api/assistant/confirm
// carrying the token — see assistantRouter.ts.
//
// Single-use: consumePendingAction() deletes the entry from the map BEFORE
// verifying the caller (delete-then-verify), so a token can never be
// redeemed twice even if verification then fails.

import { randomUUID } from 'crypto';

/** Fields shown to the client for the confirmation card. Never includes the token itself. */
export interface PendingActionView {
  entityType: string;
  entityId: number;
  entityName: string;
  consequences: string[];
  expiresAt: string; // ISO 8601
}

export interface PendingActionRecord extends PendingActionView {
  token: string;
  userId: number;
  organizationId: number;
  /** Loopback dispatch to run on confirm — see aiExecutor.ts's executeConfirmedDeletion(). */
  method: 'DELETE';
  path: string;
  /** Resource hints to emit on the client data bus once the deletion executes. */
  resources: string[];
  expiresAtMs: number;
}

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;
const SWEEP_INTERVAL_MS = 60_000;

const store = new Map<string, PendingActionRecord>();

function evictOldestIfFull(): void {
  if (store.size < MAX_ENTRIES) return;
  const oldestKey = store.keys().next().value;
  if (oldestKey !== undefined) store.delete(oldestKey);
}

function sweep(): void {
  const now = Date.now();
  for (const [token, record] of store) {
    if (record.expiresAtMs <= now) store.delete(token);
  }
}

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
sweepTimer.unref();

export interface IssuePendingActionInput {
  userId: number;
  organizationId: number;
  entityType: string;
  entityId: number;
  entityName: string;
  consequences: string[];
  method: 'DELETE';
  path: string;
  resources: string[];
}

/** Issues a new single-use confirmation token and returns the client-facing view alongside it. */
export function issuePendingAction(input: IssuePendingActionInput): { token: string; view: PendingActionView } {
  evictOldestIfFull();
  const token = randomUUID();
  const expiresAtMs = Date.now() + TTL_MS;
  const expiresAt = new Date(expiresAtMs).toISOString();

  const record: PendingActionRecord = {
    token,
    userId: input.userId,
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    entityName: input.entityName,
    consequences: input.consequences,
    method: input.method,
    path: input.path,
    resources: input.resources,
    expiresAtMs,
    expiresAt,
  };
  store.set(token, record);

  const view: PendingActionView = {
    entityType: record.entityType,
    entityId: record.entityId,
    entityName: record.entityName,
    consequences: record.consequences,
    expiresAt: record.expiresAt,
  };
  return { token, view };
}

export type ConsumeResult =
  | { ok: true; record: PendingActionRecord }
  | { ok: false; reason: 'not_found' | 'expired' | 'forbidden' };

/**
 * Single-use redemption: the token is removed from the store first
 * (delete-then-verify), then checked for expiry and ownership. Used by both
 * the confirm and cancel routes — cancel simply never calls
 * executeConfirmedDeletion() with the returned record.
 */
export function consumePendingAction(token: string, userId: number, organizationId: number): ConsumeResult {
  const record = store.get(token);
  if (!record) return { ok: false, reason: 'not_found' };
  store.delete(token);

  if (record.expiresAtMs <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (record.userId !== userId || record.organizationId !== organizationId) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, record };
}
