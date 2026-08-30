// Client-side mirror of api/src/aiLoop.ts's TurnResponse and related shapes.
// Slice 2 kept this minimal (read-only widget); Slice 4 adds the real
// PendingActionView/PendingAction shapes for the destructive confirmation
// flow (design.md ADR D4, section 9 "Client Architecture" state model).

export type ChatRole = 'user' | 'assistant';

export type ProgressStepKind = 'phase' | 'tool' | 'system';
export type ProgressStepStatus = 'running' | 'done' | 'error';

/**
 * Mirrors api/src/aiProgress.ts's ProgressStep exactly. Every field is
 * generated server-side from real tool dispatch events — never parsed or
 * inferred from the assistant's reply text.
 */
export interface ProgressStep {
  id: string;
  kind: ProgressStepKind;
  tool?: string;
  status: ProgressStepStatus;
  label: string;
  startedAt: number;
  endedAt?: number;
}

/** One rendered message in the transcript. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /**
   * Set to the server's `meta.degraded` reason when this assistant message
   * is a deterministic failure message rather than a normal reply. The
   * human-readable text is already inside `content` — this flag only
   * affects presentation.
   */
  degraded?: string;
  /**
   * The turn's complete, authoritative step list (TurnResponse.steps),
   * attached once the turn resolves so the transcript stays a live audit
   * trail of what the assistant actually did, not just what it said.
   */
  steps?: ProgressStep[];
}

/** Entry sent to the server as part of the conversation history. */
export interface HistoryMessage {
  role: ChatRole;
  content: string;
}

export type DegradeReason =
  | 'provider_unavailable'
  | 'unparseable_output'
  | 'invalid_arguments'
  | 'iteration_cap'
  | 'turn_deadline';

/** Mirrors api/src/aiPending.ts's PendingActionView — never includes the token. */
export interface PendingActionView {
  entityType: string;
  entityId: number;
  entityName: string;
  consequences: string[];
  expiresAt: string;
}

/** Mirrors api/src/aiLoop.ts's TurnResponse.pending exactly. */
export interface PendingAction {
  token: string;
  view: PendingActionView;
}

/**
 * Mirrors api/src/aiLoop.ts's TurnResponse exactly. `navigate` is executed
 * via `useNavigate()` and `resources` is emitted on the data bus, both in
 * AssistantChat.tsx; `pending` renders PendingActionCard and blocks the
 * composer until a human clicks Confirmar or Cancelar.
 */
export interface TurnResponse {
  reply: string;
  navigate?: string;
  resources: string[];
  pending?: PendingAction;
  meta: {
    iterations: number;
    repaired: boolean;
    degraded?: DegradeReason;
  };
  /** Complete, authoritative step list for this turn — see ProgressStep. */
  steps: ProgressStep[];
}

/** Response shape for GET /assistant/progress/:turnId — always 200, never an error. */
export interface ProgressResponse {
  steps: ProgressStep[];
}

/** Response shape for POST /assistant/confirm and POST /assistant/cancel. */
export interface ConfirmResponse {
  reply: string;
  resources: string[];
}

export interface StatusResponse {
  enabled: boolean;
}

export type ChatStatus = 'idle' | 'sending' | 'error';

export interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Set when a chat turn returns a destructive pending action; cleared on Confirmar/Cancelar. */
  pending: PendingAction | null;
  error: string | null;
}
