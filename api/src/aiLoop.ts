// Bounded server-side agent loop: dual-path parsing, schema validation, one
// repair round, hard iteration cap, wall-clock turn deadline, deterministic
// Spanish failure messages. See design.md "Bounded Agent Loop". Slice 4
// adds: `navigate` tracking (last directive of the turn wins) and immediate
// termination when a tool result carries a `pending` destructive action —
// the model never observes that outcome. Defect-fix batch adds: routing
// [DATA]-echoing "final" text into the repair round, framing tool
// observations as `tool`/`system` messages instead of `user` (Defect A), a
// single bounded continuation probe when the model narrates instead of
// finishing a multi-step chain (Defect B), and current-user identity
// injection into the system prompt (Defect C).

import type { AiConfig } from './aiConfig';
import { chatCompletion, type ChatMessage, type RawToolCall } from './aiProvider';
import { normalizeModelTurn } from './aiParse';
import { findTool, toProviderToolDefinitions, validateToolCallArgs } from './aiTools';
import { executeTool, getCurrentUserIdentity, type ToolContext, type ToolResult } from './aiExecutor';
import { buildSystemPrompt, wrapData, sanitizeObservationPayload } from './aiPrompt';
import type { PendingActionView } from './aiPending';
import { addStep, createProgressTurn, finishStep, type ProgressStep } from './aiProgress';
import { describeToolStart, describeToolResult, describeToolPending, describeToolError } from './aiProgressLabels';

export type DegradeReason =
  | 'provider_unavailable'
  | 'unparseable_output'
  | 'invalid_arguments'
  | 'iteration_cap'
  | 'turn_deadline';

const DEGRADE_MESSAGES: Record<DegradeReason, string> = {
  provider_unavailable:
    'No pude conectarme con el asistente de IA en este momento. Intenta nuevamente en unos minutos o realiza la acción manualmente desde la aplicación.',
  unparseable_output:
    'No pude interpretar la respuesta del asistente. Intenta reformular tu pedido o realiza la acción manualmente desde la aplicación.',
  invalid_arguments:
    'No pude completar la acción porque los datos no fueron válidos. Intenta reformular tu pedido o realiza la acción manualmente desde la aplicación.',
  iteration_cap:
    'No pude completar la acción en la cantidad de pasos permitidos. Intenta con un pedido más simple o realiza la acción manualmente desde la aplicación.',
  turn_deadline:
    'La solicitud tardó demasiado en procesarse. Intenta nuevamente o realiza la acción manualmente desde la aplicación.',
};

export interface TurnHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TurnRequest {
  cfg: AiConfig;
  message: string;
  history: TurnHistoryMessage[];
  ctx: ToolContext;
  /**
   * Optional client-generated id (design: client-generated turn id + progress
   * polling). Only ever used as an in-memory bucket key for live progress
   * steps (aiProgress.ts) — carries no authority and is never trusted for
   * identity. Absent or unknown: the turn runs exactly as before, no live
   * polling data, no error.
   */
  turnId?: string;
}

export interface TurnResponse {
  reply: string;
  navigate?: string;
  resources: string[];
  pending?: { token: string; view: PendingActionView };
  meta: { iterations: number; repaired: boolean; continued: boolean; degraded?: DegradeReason };
  /**
   * Complete, authoritative step list for this turn — the SOURCE OF TRUTH.
   * Progress polling (GET /api/assistant/progress/:turnId) is a best-effort
   * enhancement for a live view; a client that missed every poll, or never
   * sent a turn id at all, still ends up with the correct, complete list
   * here once the turn resolves.
   */
  steps: ProgressStep[];
}

// Defect fix (repair budget): a repair round used to be a single per-TURN
// shot (`let repairUsed = false`, never reset), so a multi-step chain that
// spent its one repair on step 1 had none left for a later step's stumble,
// degrading the whole turn even though earlier steps had already succeeded.
// The budget is now a small bounded per-turn COUNTER instead of a boolean.
// 3 is chosen deliberately: it is small enough to stay cheap and strictly
// bounded (no risk of unbounded looping), yet large enough that a weak model
// can stumble on more than one step of a realistic multi-step chain (this
// change's own manual chains top out around 3 tool calls) without losing
// already-completed work. It is intentionally kept well below
// `cfg.maxToolIterations` (default 6) so repairs alone can never approach the
// tool-call cap.
const MAX_REPAIRS_PER_TURN = 3;

// Bounds total provider calls per turn beyond the tool-call iteration cap, so
// the (now bounded-but-multi-shot) repair budget, the one continuation probe,
// and the one tools-drop retry can never loop forever. Grown from 3 to
// MAX_REPAIRS_PER_TURN + 2 (repairs + probe + tools-drop retry) to stay
// consistent with the wider repair budget above; `maxProviderCalls` still
// hard-caps total provider calls regardless of how repairs are spent.
const PROVIDER_CALL_SAFETY_MARGIN = MAX_REPAIRS_PER_TURN + 2;

/**
 * Defect fix (honest degradation): a degraded turn used to always return the
 * fixed `DEGRADE_MESSAGES[reason]` text, even when one or more write/
 * destructive tool calls had already completed successfully earlier in the
 * same turn — telling the user nothing worked when something genuinely did,
 * risking a duplicate retry or eroding trust in the assistant entirely.
 *
 * When at least one write/destructive tool step finished with `status:
 * 'done'`, the reply is composed from the SAME factual, server-derived step
 * labels already recorded for the live progress feed (never model prose):
 * every completed tool step's label, in order, followed by an honest
 * "could not finish" note. When no tool succeeded, the original fixed
 * message is returned unchanged.
 */
function buildDegradeReply(reason: DegradeReason, steps: ProgressStep[]): string {
  const completedToolSteps = steps.filter((s) => s.kind === 'tool' && s.status === 'done');
  const hasCompletedWrite = completedToolSteps.some((s) => {
    const tool = s.tool ? findTool(s.tool) : undefined;
    return !!tool && tool.class !== 'read';
  });
  if (!hasCompletedWrite) return DEGRADE_MESSAGES[reason];

  const facts = completedToolSteps.map((s) => s.label).join('. ');
  return (
    `${facts}. No pude terminar de armar la respuesta final del asistente para este pedido, ` +
    'pero lo que se detalla arriba sí se hizo. Te recomiendo verificar en la aplicación que todo haya quedado como esperabas.'
  );
}

function degradeResponse(
  reason: DegradeReason,
  iterations: number,
  repaired: boolean,
  continued: boolean,
  steps: ProgressStep[]
): TurnResponse {
  return {
    reply: buildDegradeReply(reason, steps),
    resources: [],
    meta: { iterations, repaired, continued, degraded: reason },
    steps,
  };
}

function buildRepairMessage(reason: string): string {
  return (
    `Your previous response could not be used: ${reason}. ` +
    'Respond again with EXACTLY one fenced block: ```action\n{"tool":"<tool_name>","args":{...}}\n``` ' +
    'or plain prose with no fenced block if no tool call is needed.'
  );
}

/**
 * Defect B: a weak model sometimes narrates its NEXT step in prose
 * ("Ahora busco el usuario...") instead of emitting the action block, and
 * the loop used to accept that prose as a finished answer, silently
 * abandoning the rest of the chain. This single, bounded probe — issued at
 * most once per turn, and only when at least one tool has already run — asks
 * the model to self-check before the loop trusts a "final" outcome.
 */
function buildContinuationProbe(): string {
  return (
    'Before finishing, check yourself: is the original request FULLY completed? ' +
    'If any step is still pending, respond now with EXACTLY one fenced ```action``` block for the next step. ' +
    'If the request is fully completed, repeat your final answer as plain prose with no fenced block — do not narrate a next step you are not about to take.'
  );
}

/**
 * Fixed Spanish reply shown when a destructive action stops the turn to
 * await human confirmation. The model never produces this text and never
 * observes the pending outcome (design.md "Bounded Agent Loop").
 */
function buildPendingReply(view: PendingActionView): string {
  return `Para continuar necesito tu confirmación: vas a eliminar "${view.entityName}". Revisá los detalles y confirmá o cancelá desde el mensaje que aparece a continuación.`;
}

/**
 * Defect A: pushes the assistant's tool-invoking turn plus the resulting
 * observation into `messages`, framed so the model cannot mistake it for the
 * human speaking. When the call came through native provider tool-calling,
 * the observation goes in via the provider's own `tool` role, correlated by
 * `tool_call_id` — the correct OpenAI-compatible shape, and unambiguous to
 * the model. When it came through the JSON-in-text fallback, there is no
 * real provider-issued tool call to correlate, so a `tool`-role message
 * would be an invalid turn shape for that provider; it is framed as
 * `system` instead of `user` so it still cannot be confused with the human,
 * while staying compatible with providers that are fussy about non-standard
 * roles (the existing `dropTools` retry already shows some are).
 */
function pushObservation(
  messages: ChatMessage[],
  assistantContent: string,
  call: { id: string; name: string },
  source: 'native' | 'text',
  rawToolCall: RawToolCall | undefined,
  data: unknown
): void {
  if (source === 'native' && rawToolCall) {
    messages.push({ role: 'assistant', content: assistantContent, tool_calls: [rawToolCall] });
    const { text } = sanitizeObservationPayload(data);
    messages.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text });
    return;
  }

  messages.push({ role: 'assistant', content: assistantContent });
  messages.push({
    role: 'system',
    content: `This is an automated tool observation, not user input: ${wrapData(call.name, data)}`,
  });
}

/**
 * Fix 2 (defect-fix batch): canonical dedupe key for a write/destructive tool
 * call, robust to trivial argument reordering. `args` here is always
 * `validation.value` (already schema-validated), whose values are flat
 * int/string/enum/date/bool primitives for every write/destructive tool
 * (`aiSchema.ts`'s `FieldSpec` union has no array/object kind) — a top-level
 * key sort is therefore sufficient; there is no nested structure to recurse
 * into for these tools.
 */
function canonicalizeArgs(args: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(args).sort()) {
    sorted[key] = args[key];
  }
  return JSON.stringify(sorted);
}

/**
 * Fix 2 (defect-fix batch): deterministic single-turn idempotency guard.
 * When a write/destructive tool call's name + canonicalized args exactly
 * match one already dispatched earlier in this same turn, the second call is
 * refused WITHOUT touching the database — the stored outcome from the first
 * attempt is reported back to the model as already-done (or, if the first
 * attempt itself ended in an UNKNOWN/errored state, that same UNKNOWN
 * framing is repeated) so the model can finish its answer truthfully instead
 * of guessing.
 *
 * This is the single dispatch chokepoint both parsing paths already share:
 * `normalizeModelTurn()` (aiParse.ts) merges native provider `tool_calls`
 * and the ```action``` JSON-in-text fallback into one `outcome.call` shape
 * BEFORE either ever reaches this function's call site below — there is no
 * second route into `executeTool()` (its only caller in the whole codebase
 * is this file). Placing the guard here therefore covers both parsing paths
 * by construction, not by convention.
 *
 * Defense in depth for Fix 1 (`callInternal()`'s UNKNOWN-outcome wording in
 * aiExecutor.ts): it also independently covers a weak model genuinely
 * repeating itself for any other reason.
 */
function buildDuplicateCallResult(previous: ToolResult): ToolResult {
  if (previous.ok) {
    return {
      ok: true,
      data: {
        alreadyExecuted: true,
        note: 'This exact action was already completed earlier in this turn; do not repeat it, use this result to answer.',
        result: previous.data,
      },
      resources: previous.resources,
    };
  }
  return {
    ok: false,
    error:
      `This exact action was already attempted earlier in this turn (${previous.error}). ` +
      'Do NOT repeat it again. If you still need to confirm the outcome, call a read/search tool instead.',
  };
}

/** Runs one bounded assistant turn: system prompt + sanitized history + user message in, TurnResponse out. */
export async function runTurn(req: TurnRequest): Promise<TurnResponse> {
  const { cfg, message, history, ctx, turnId } = req;

  // Progress steps: opens the in-memory polling bucket (no-op if turnId is
  // absent/invalid). `steps` is this turn's own authoritative, ordered
  // record — every addStep() call below is also appended here, regardless
  // of whether a turn id was supplied, so TurnResponse.steps is always
  // complete and correct even for a client that never polls.
  createProgressTurn(turnId, ctx.userId, ctx.organizationId);
  const steps: ProgressStep[] = [];
  function record(step: ProgressStep): ProgressStep {
    steps.push(step);
    return step;
  }

  // Defect C: identity comes only from ctx (itself only ever from req.user —
  // never model-supplied); a lookup failure degrades to id-only rather than
  // failing the turn.
  const identity = await getCurrentUserIdentity(ctx);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt({
        userId: ctx.userId,
        userName: identity?.userName,
        organizationName: identity?.organizationName,
      }),
    },
    ...history.map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
    { role: 'user', content: message },
  ];

  const resources: string[] = [];
  let toolCallCount = 0;
  // Defect fix (repair budget): per-turn counter, not a one-shot boolean —
  // see MAX_REPAIRS_PER_TURN above. `meta.repaired` stays a boolean meaning
  // "at least one repair happened this turn", so existing clients keep
  // working unchanged.
  let repairCount = 0;
  let consecutiveNativeUnparseable = 0;
  let dropTools = false;
  // Defect B: at most one continuation probe per turn — see
  // buildContinuationProbe(). Never reset mid-turn, so a second "final" can
  // never trigger a second probe.
  let probeUsed = false;
  // "Last directive of a turn wins" (design.md "Navigation") — overwritten,
  // never accumulated, on every successful navigate_to call.
  let latestNavigate: string | undefined;
  // Fix 2 (defect-fix batch): per-turn only — a fresh Map every runTurn()
  // call, never a module-level variable, so concurrent turns from different
  // users/requests never share or leak each other's dedupe state. Keyed by
  // canonicalizeArgs() below; see buildDuplicateCallResult() for the guard.
  const executedWriteCalls = new Map<string, ToolResult>();

  const deadline = Date.now() + cfg.requestTimeoutMs * 3;
  const maxProviderCalls = cfg.maxToolIterations + PROVIDER_CALL_SAFETY_MARGIN;

  for (let call = 0; call < maxProviderCalls; call++) {
    if (Date.now() > deadline) {
      record(
        addStep(turnId, { kind: 'system', status: 'error', label: DEGRADE_MESSAGES.turn_deadline })
      );
      return degradeResponse('turn_deadline', toolCallCount, repairCount > 0, probeUsed, steps);
    }

    // "Turn started / waiting on the provider" phase step (the "pensando"
    // state) — one per provider call, so a multi-step chain shows a fresh
    // "Pensando..." line between each tool result and the next model turn.
    const phaseStep = record(addStep(turnId, { kind: 'phase', status: 'running', label: 'Pensando...' }));

    const result = await chatCompletion(cfg, {
      messages,
      tools: dropTools ? undefined : toProviderToolDefinitions(),
    });

    if (!result.ok) {
      const mentionsTools =
        result.kind === 'http' && result.status === 400 && result.detail.toLowerCase().includes('tools');
      if (!dropTools && mentionsTools) {
        dropTools = true;
        finishStep(phaseStep, { status: 'done', label: 'Ajustando la forma de pedir herramientas...' });
        continue;
      }
      finishStep(phaseStep, { status: 'error', label: DEGRADE_MESSAGES.provider_unavailable });
      return degradeResponse('provider_unavailable', toolCallCount, repairCount > 0, probeUsed, steps);
    }

    finishStep(phaseStep, { status: 'done', label: 'Pensando...' });

    const nativeToolCalls = dropTools ? [] : result.toolCalls;
    const outcome = normalizeModelTurn(result.content, nativeToolCalls);

    if (outcome.kind === 'final') {
      // Defect B: prose is only trusted as "done" immediately when either no
      // tool has run yet this turn (a plain conversational reply, e.g.
      // "hola" — must never cost an extra provider call) or the bounded
      // probe has already been spent once.
      if (toolCallCount > 0 && !probeUsed) {
        probeUsed = true;
        record(
          addStep(turnId, {
            kind: 'system',
            status: 'done',
            label: 'Verificando que el pedido esté completo...',
          })
        );
        messages.push({ role: 'assistant', content: result.content });
        messages.push({ role: 'user', content: buildContinuationProbe() });
        continue;
      }
      return {
        reply: outcome.text,
        navigate: latestNavigate,
        resources,
        meta: { iterations: toolCallCount, repaired: repairCount > 0, continued: probeUsed },
        steps,
      };
    }

    if (outcome.kind === 'unparseable') {
      const wasNative = nativeToolCalls.length > 0;
      if (wasNative) {
        consecutiveNativeUnparseable++;
        if (consecutiveNativeUnparseable >= 2) dropTools = true;
      } else {
        consecutiveNativeUnparseable = 0;
      }

      if (repairCount >= MAX_REPAIRS_PER_TURN) {
        record(
          addStep(turnId, { kind: 'system', status: 'error', label: DEGRADE_MESSAGES.unparseable_output })
        );
        return degradeResponse('unparseable_output', toolCallCount, repairCount > 0, probeUsed, steps);
      }
      repairCount++;
      record(
        addStep(turnId, {
          kind: 'system',
          status: 'done',
          label: 'La respuesta no se entendió bien, reintentando...',
        })
      );
      messages.push({ role: 'assistant', content: result.content });
      messages.push({ role: 'user', content: buildRepairMessage(outcome.reason) });
      continue;
    }

    // outcome.kind === 'call'
    consecutiveNativeUnparseable = 0;
    const tool = findTool(outcome.call.name);

    if (!tool) {
      if (repairCount >= MAX_REPAIRS_PER_TURN) {
        record(
          addStep(turnId, { kind: 'system', status: 'error', label: DEGRADE_MESSAGES.invalid_arguments })
        );
        return degradeResponse('invalid_arguments', toolCallCount, repairCount > 0, probeUsed, steps);
      }
      repairCount++;
      record(
        addStep(turnId, {
          kind: 'system',
          status: 'done',
          label: 'Pidió una herramienta desconocida, reintentando...',
        })
      );
      messages.push({ role: 'assistant', content: result.content });
      messages.push({
        role: 'user',
        content: buildRepairMessage(`unknown tool "${outcome.call.name}"`),
      });
      continue;
    }

    const validation = validateToolCallArgs(tool, outcome.call.args);
    if (!validation.ok) {
      if (repairCount >= MAX_REPAIRS_PER_TURN) {
        record(
          addStep(turnId, { kind: 'system', status: 'error', label: DEGRADE_MESSAGES.invalid_arguments })
        );
        return degradeResponse('invalid_arguments', toolCallCount, repairCount > 0, probeUsed, steps);
      }
      repairCount++;
      record(
        addStep(turnId, {
          kind: 'system',
          status: 'done',
          label: 'Ajustando los datos de la acción, reintentando...',
        })
      );
      const errorText = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      messages.push({ role: 'assistant', content: result.content });
      messages.push({ role: 'user', content: buildRepairMessage(errorText) });
      continue;
    }

    if (toolCallCount >= cfg.maxToolIterations) {
      record(addStep(turnId, { kind: 'system', status: 'error', label: DEGRADE_MESSAGES.iteration_cap }));
      return degradeResponse('iteration_cap', toolCallCount, repairCount > 0, probeUsed, steps);
    }
    toolCallCount++;

    // Progress step for the tool call itself: running label derived from the
    // tool name + its already-schema-validated arguments (aiProgressLabels.ts)
    // — never from the model's prose.
    const toolStep = record(
      addStep(turnId, {
        kind: 'tool',
        tool: tool.name,
        status: 'running',
        label: describeToolStart(tool.name, validation.value),
      })
    );

    // Fix 2 (defect-fix batch): read tools stay freely repeatable (they have
    // no side effect); only write/destructive calls are deduped.
    let toolResult: ToolResult;
    let toolResultForLabel: ToolResult;
    if (tool.class === 'read') {
      toolResult = await executeTool(outcome.call, ctx);
      toolResultForLabel = toolResult;
    } else {
      const dedupeKey = `${outcome.call.name}::${canonicalizeArgs(validation.value)}`;
      const cached = executedWriteCalls.get(dedupeKey);
      if (cached) {
        toolResult = buildDuplicateCallResult(cached);
        toolResultForLabel = cached;
      } else {
        toolResult = await executeTool(outcome.call, ctx);
        executedWriteCalls.set(dedupeKey, toolResult);
        toolResultForLabel = toolResult;
      }
    }

    if (toolResult.ok && toolResult.pending) {
      // Destructive action: the loop stops immediately and the model never
      // observes the outcome or the token — it cannot self-confirm or
      // reason about a pending deletion in a later turn (design.md
      // "Bounded Agent Loop", specs/assistant-actions "Confirmation Token
      // Issuance and Redemption").
      finishStep(toolStep, {
        status: 'done',
        label: describeToolPending(tool.name, validation.value, toolResult.pending.view),
      });
      return {
        reply: buildPendingReply(toolResult.pending.view),
        resources: toolResult.resources,
        pending: toolResult.pending,
        meta: { iterations: toolCallCount, repaired: repairCount > 0, continued: probeUsed },
        steps,
      };
    }

    if (!toolResult.ok) {
      finishStep(toolStep, {
        status: 'error',
        label: describeToolError(tool.name, validation.value, toolResult.error),
      });
      pushObservation(messages, result.content, outcome.call, outcome.source, nativeToolCalls[0], {
        error: toolResult.error,
      });
      continue;
    }

    finishStep(toolStep, {
      status: 'done',
      label: describeToolResult(tool.name, validation.value, toolResultForLabel),
    });

    if (toolResult.navigate) {
      latestNavigate = toolResult.navigate;
    }

    resources.push(...toolResult.resources);
    pushObservation(messages, result.content, outcome.call, outcome.source, nativeToolCalls[0], toolResult.data);
  }

  record(addStep(turnId, { kind: 'system', status: 'error', label: DEGRADE_MESSAGES.iteration_cap }));
  return degradeResponse('iteration_cap', toolCallCount, repairCount > 0, probeUsed, steps);
}
