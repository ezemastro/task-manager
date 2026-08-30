// OpenAI-compatible chat-completions client over the global `fetch` (Node 20).
// Zero new npm dependencies. Non-throwing: every failure mode is a typed result.

import type { AiConfig } from './aiConfig';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  /** Only set on an `assistant` message that triggered a native tool call, so a
   *  following `role: 'tool'` message can correlate by `tool_call_id` (OpenAI
   *  tool-calling contract). Never set for the JSON-in-text fallback path. */
  tool_calls?: RawToolCall[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface RawToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ProviderRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}

export type ProviderResult =
  | { ok: true; content: string; toolCalls: RawToolCall[]; finishReason: string | null }
  | { ok: false; kind: 'timeout' | 'http' | 'network' | 'malformed'; status?: number; detail: string };

const RETRY_DELAY_MS = 500;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function truncateBody(body: string): string {
  return body.slice(0, 200);
}

async function performRequest(cfg: AiConfig, req: ProviderRequest): Promise<ProviderResult> {
  const url = `${cfg.baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: req.messages,
    max_tokens: cfg.maxOutputTokens,
    stream: false,
  };
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'TimeoutError';
    if (isAbort) {
      // Defect-fix batch: this branch previously returned silently — a
      // `provider_unavailable` degrade caused by a timeout left zero trace
      // in the log, unlike the network/HTTP branches below. Logged here so a
      // future occurrence is diagnosable without guessing between timeout,
      // network error, and malformed response.
      console.error(`[aiProvider] request to AI provider timed out after ${cfg.requestTimeoutMs}ms`);
      return { ok: false, kind: 'timeout', detail: 'Request timed out' };
    }
    const detail = error instanceof Error ? error.message : 'Unknown network error';
    console.error('[aiProvider] network error contacting AI provider:', detail);
    return { ok: false, kind: 'network', detail };
  }

  if (!response.ok) {
    let text = '';
    try {
      text = await response.text();
    } catch {
      text = '';
    }
    console.error(`[aiProvider] provider HTTP ${response.status}:`, truncateBody(text));
    return {
      ok: false,
      kind: 'http',
      status: response.status,
      detail: truncateBody(text),
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    // Defect-fix batch: same silent-branch gap as the timeout case above.
    console.error('[aiProvider] provider response body is not valid JSON');
    return { ok: false, kind: 'malformed', detail: 'Response body is not valid JSON' };
  }

  const choice = (json as any)?.choices?.[0];
  if (!choice) {
    console.error('[aiProvider] provider response has no choices[0]');
    return { ok: false, kind: 'malformed', detail: 'Response has no choices[0]' };
  }

  const message = choice.message ?? {};
  const content: string = typeof message.content === 'string' ? message.content : '';
  const rawToolCalls: unknown = message.tool_calls;
  const toolCalls: RawToolCall[] = Array.isArray(rawToolCalls)
    ? rawToolCalls
        .filter(
          (call: any) =>
            call &&
            typeof call.id === 'string' &&
            call.function &&
            typeof call.function.name === 'string' &&
            typeof call.function.arguments === 'string'
        )
        .map((call: any) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.function.name, arguments: call.function.arguments },
        }))
    : [];

  return {
    ok: true,
    content,
    toolCalls,
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
  };
}

function isRetryable(result: ProviderResult): boolean {
  if (result.ok) return false;
  if (result.kind === 'timeout' || result.kind === 'network') return true;
  if (result.kind === 'http' && result.status !== undefined && RETRYABLE_STATUS.has(result.status)) {
    return true;
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes one OpenAI-compatible chat-completions call.
 * At most one internal retry (500ms delay) on timeout/network/HTTP 429/5xx.
 * Never throws; never logs the API key.
 */
export async function chatCompletion(cfg: AiConfig, req: ProviderRequest): Promise<ProviderResult> {
  const first = await performRequest(cfg, req);
  if (first.ok || !isRetryable(first)) {
    return first;
  }
  await delay(RETRY_DELAY_MS);
  return performRequest(cfg, req);
}
