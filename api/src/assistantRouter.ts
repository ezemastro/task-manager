// AI assistant endpoints. Mounted at /api/assistant in app.ts, ABOVE the SPA
// fallback, with authMiddleware applied externally (design.md Task 3.6).
// The router is ALWAYS mounted so /api/assistant/* never falls through to the
// SPA's index.html; individual handlers gate on aiConfig (graceful
// degradation — see aiConfig.ts).
//
// Slice 4 adds POST /confirm and POST /cancel for the two-phase destructive
// confirmation protocol (design.md ADR D4) — both are human-only entry
// points; the model never calls them directly, it only ever returns a
// `pending` directive that the client renders as a Confirmar/Cancelar card.

import { Router, type Request, type Response } from 'express';
import { aiConfig, isAiEnabled } from './aiConfig';
import { runTurn, type TurnHistoryMessage } from './aiLoop';
import { consumePendingAction, type PendingActionRecord } from './aiPending';
import { executeConfirmedDeletion } from './aiExecutor';
import { isValidTurnId, readProgress } from './aiProgress';

export const assistantRouter = Router();

assistantRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ enabled: isAiEnabled() });
});

/**
 * Live progress polling for a chat turn in flight (design: client-generated
 * turn id + progress polling, not SSE — see aiLoop.ts's header comment).
 * ALWAYS 200 with `{steps: []}` for an absent, expired, or not-owned turn id
 * — this is a pure enhancement, never a hard dependency, and must never leak
 * whether a turn id exists for a different user (aiProgress.ts's
 * readProgress() already enforces that scoping; this handler never bypasses
 * it with a raw store read).
 */
assistantRouter.get('/progress/:turnId', (req: Request, res: Response) => {
  const { turnId } = req.params;
  if (!aiConfig || !isValidTurnId(turnId)) {
    return res.json({ steps: [] });
  }

  const user = req.user!;
  const steps = readProgress(turnId, user.userId, user.organizationId);
  res.json({ steps: steps ?? [] });
});

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_CHARS = 1500;
const MAX_HISTORY_TOTAL_CHARS = 8000;
const MAX_MESSAGE_CHARS = 4000;

/**
 * Server-side history re-sanitization (design.md D5): only `role:
 * user|assistant` string entries survive — never `tool`/`system`. A client
 * cannot forge a tool result into model context this way. Caps at 12
 * messages / 1,500 chars each / 8,000 chars total, oldest dropped first.
 */
function sanitizeHistory(raw: unknown): TurnHistoryMessage[] {
  if (!Array.isArray(raw)) return [];

  const cleaned: TurnHistoryMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    cleaned.push({ role, content: content.slice(0, MAX_HISTORY_MESSAGE_CHARS) });
  }

  let windowed = cleaned.slice(-MAX_HISTORY_MESSAGES);
  let total = windowed.reduce((sum, m) => sum + m.content.length, 0);
  while (total > MAX_HISTORY_TOTAL_CHARS && windowed.length > 0) {
    const removed = windowed.shift();
    if (removed) total -= removed.content.length;
  }
  return windowed;
}

assistantRouter.post('/chat', async (req: Request, res: Response) => {
  // Graceful degradation: config absent -> clean refusal, nothing else changes.
  if (!aiConfig) {
    return res.status(503).json({ error: 'Asistente no configurado' });
  }

  const body = req.body ?? {};
  const message = body.message;
  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'El mensaje es requerido' });
  }

  // Identity comes only from req.user (authMiddleware) — never from the body.
  const user = req.user!;
  const ctx = {
    userId: user.userId,
    organizationId: user.organizationId,
    cookie: req.headers.cookie || '',
    ip: req.ip,
  };

  const sanitizedHistory = sanitizeHistory(body.history);
  const trimmedMessage = message.slice(0, MAX_MESSAGE_CHARS);
  // Client-generated turn id (design: client-generated turn id + progress
  // polling). Optional, bounded, only ever used as an in-memory bucket key
  // in aiProgress.ts — never trusted for identity, never required. Absent or
  // malformed: the turn runs exactly as it always has, no live steps.
  const turnId = isValidTurnId(body.turnId) ? body.turnId : undefined;

  try {
    const response = await runTurn({
      cfg: aiConfig,
      message: trimmedMessage,
      history: sanitizedHistory,
      ctx,
      turnId,
    });
    res.json(response);
  } catch (error) {
    console.error(
      '[assistantRouter] unexpected error in POST /chat:',
      error instanceof Error ? error.message : error
    );
    res.status(500).json({ error: 'Ocurrió un error inesperado al procesar tu mensaje' });
  }
});

function extractToken(req: Request): string | null {
  const token = (req.body ?? {}).token;
  return typeof token === 'string' && token.trim() !== '' ? token : null;
}

/**
 * Executes a destructive action the model previously proposed, only after a
 * human click. The token is single-use, minted server-side in aiPending.ts,
 * and consumed (delete-then-verify) here — the model has no path to mint or
 * replay one itself (design.md ADR D4, specs/assistant-actions "Confirmation
 * Token Issuance and Redemption").
 */
assistantRouter.post('/confirm', async (req: Request, res: Response) => {
  if (!aiConfig) {
    return res.status(503).json({ error: 'Asistente no configurado' });
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(400).json({ error: 'El token de confirmación es requerido' });
  }

  const user = req.user!;
  const consumed = consumePendingAction(token, user.userId, user.organizationId);
  if (!consumed.ok) {
    if (consumed.reason === 'forbidden') {
      return res.status(403).json({ error: 'No tenés permiso para confirmar esta acción' });
    }
    return res
      .status(410)
      .json({ error: 'La acción solicitada expiró o ya no existe. Pedile al asistente que la proponga nuevamente.' });
  }

  const record: PendingActionRecord = consumed.record;
  const ctx = {
    userId: user.userId,
    organizationId: user.organizationId,
    cookie: req.headers.cookie || '',
    ip: req.ip,
  };

  try {
    const outcome = await executeConfirmedDeletion(record, ctx);
    if (!outcome.ok) {
      return res.status(502).json({ error: outcome.error });
    }
    res.json({
      reply: `Listo, eliminé "${record.entityName}" correctamente.`,
      resources: outcome.resources,
    });
  } catch (error) {
    console.error(
      '[assistantRouter] unexpected error in POST /confirm:',
      error instanceof Error ? error.message : error
    );
    res.status(500).json({ error: 'Ocurrió un error inesperado al confirmar la acción' });
  }
});

/**
 * Discards a pending destructive action without executing it. Shares
 * consumePendingAction()'s single-use delete-then-verify semantics with
 * /confirm — the only difference is that executeConfirmedDeletion() is
 * never called.
 */
assistantRouter.post('/cancel', (req: Request, res: Response) => {
  if (!aiConfig) {
    return res.status(503).json({ error: 'Asistente no configurado' });
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(400).json({ error: 'El token de confirmación es requerido' });
  }

  const user = req.user!;
  const consumed = consumePendingAction(token, user.userId, user.organizationId);
  if (!consumed.ok) {
    if (consumed.reason === 'forbidden') {
      return res.status(403).json({ error: 'No tenés permiso para cancelar esta acción' });
    }
    return res
      .status(410)
      .json({ error: 'La acción solicitada expiró o ya no existe.' });
  }

  res.json({ reply: 'Listo, cancelé la acción. No se realizó ningún cambio.', resources: [] });
});
