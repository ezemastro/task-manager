// Configuración del asistente de IA: resolución fail-closed de variables de entorno,
// siguiendo el mismo patrón que resolveJwtSecret() en api/src/auth.ts.
//
// Reglas:
// - Las tres variables requeridas (AI_API_KEY, AI_BASE_URL, AI_MODEL) deben estar
//   TODAS presentes o TODAS ausentes.
// - Si están todas ausentes: la funcionalidad queda deshabilitada silenciosamente
//   (comportamiento por defecto, sin romper nada).
// - Si están parcialmente presentes, o si un valor opcional está fuera de rango:
//   en producción (NODE_ENV === 'production') se lanza una excepción y el proceso
//   no arranca; fuera de producción se emite un console.warn y la funcionalidad
//   queda deshabilitada.

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxToolIterations: number;
  requestTimeoutMs: number;
  maxOutputTokens: number;
}

const DEFAULT_MAX_TOOL_ITERATIONS = 6;
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

const MAX_TOOL_ITERATIONS_MIN = 1;
const MAX_TOOL_ITERATIONS_MAX = 10;
const REQUEST_TIMEOUT_MS_MIN = 5000;
const REQUEST_TIMEOUT_MS_MAX = 120000;
const MAX_OUTPUT_TOKENS_MIN = 128;
const MAX_OUTPUT_TOKENS_MAX = 4096;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Fails the given reason: throws in production, warns and disables otherwise. */
function fail(reason: string): null {
  if (isProduction()) {
    throw new Error(`AI assistant configuration error: ${reason}`);
  }
  console.warn(`[aiConfig] Asistente de IA deshabilitado: ${reason}`);
  return null;
}

function normalizeBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (url.search || url.hash) {
    return null;
  }
  const stripped = url.toString().replace(/\/+$/, '');
  return stripped;
}

function parseOptionalInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string
): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined || raw.trim() === '') {
    return { ok: true, value: fallback };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { ok: false, error: `${name} must be an integer between ${min} and ${max}` };
  }
  return { ok: true, value: parsed };
}

export function resolveAiConfig(): AiConfig | null {
  const rawApiKey = process.env.AI_API_KEY;
  const rawBaseUrl = process.env.AI_BASE_URL;
  const rawModel = process.env.AI_MODEL;

  const apiKey = rawApiKey?.trim() || '';
  const baseUrlRaw = rawBaseUrl?.trim() || '';
  const model = rawModel?.trim() || '';

  const anySet = Boolean(apiKey) || Boolean(baseUrlRaw) || Boolean(model);
  const allSet = Boolean(apiKey) && Boolean(baseUrlRaw) && Boolean(model);

  if (!anySet) {
    // All unset: feature disabled, silent, no warning.
    return null;
  }

  if (!allSet) {
    return fail(
      'AI_API_KEY, AI_BASE_URL and AI_MODEL must be set together (partial configuration detected).'
    );
  }

  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  if (!baseUrl) {
    return fail('AI_BASE_URL must be an absolute http/https URL without query string or fragment.');
  }

  const maxToolIterations = parseOptionalInt(
    process.env.AI_MAX_TOOL_ITERATIONS,
    DEFAULT_MAX_TOOL_ITERATIONS,
    MAX_TOOL_ITERATIONS_MIN,
    MAX_TOOL_ITERATIONS_MAX,
    'AI_MAX_TOOL_ITERATIONS'
  );
  if (!maxToolIterations.ok) {
    return fail(maxToolIterations.error);
  }

  const requestTimeoutMs = parseOptionalInt(
    process.env.AI_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    REQUEST_TIMEOUT_MS_MIN,
    REQUEST_TIMEOUT_MS_MAX,
    'AI_REQUEST_TIMEOUT_MS'
  );
  if (!requestTimeoutMs.ok) {
    return fail(requestTimeoutMs.error);
  }

  const maxOutputTokens = parseOptionalInt(
    process.env.AI_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
    MAX_OUTPUT_TOKENS_MIN,
    MAX_OUTPUT_TOKENS_MAX,
    'AI_MAX_OUTPUT_TOKENS'
  );
  if (!maxOutputTokens.ok) {
    return fail(maxOutputTokens.error);
  }

  return {
    apiKey,
    baseUrl,
    model,
    maxToolIterations: maxToolIterations.value,
    requestTimeoutMs: requestTimeoutMs.value,
    maxOutputTokens: maxOutputTokens.value,
  };
}

// Resolved once at import time, mirroring JWT_SECRET's boot-time resolution.
export const aiConfig: AiConfig | null = resolveAiConfig();

export function isAiEnabled(): boolean {
  return aiConfig !== null;
}
