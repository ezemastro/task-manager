// Causas de retraso / espera. Deben coincidir con DELAY_CAUSES y
// CLIENT_SIDE_CAUSES en api/src/apiRouter.ts.

export const DELAY_CAUSES = ['client', 'internal', 'missing_info', 'architecture_change', 'other'] as const;
export type DelayCause = typeof DELAY_CAUSES[number];

export const DELAY_CAUSE_LABELS: Record<DelayCause, string> = {
  client: 'Cliente',
  internal: 'Interna',
  missing_info: 'Falta de información',
  architecture_change: 'Cambio de arquitectura',
  other: 'Otra',
};

/** Causas que se cuentan como retraso "atribuible al cliente". */
export const CLIENT_SIDE_CAUSES: ReadonlySet<string> = new Set(['client', 'missing_info', 'architecture_change']);

export function getDelayCauseLabel(cause: string | null | undefined): string {
  if (!cause) return 'Sin causa';
  return DELAY_CAUSE_LABELS[cause as DelayCause] ?? cause;
}

/** "atribuible al cliente" / "atribuible al estudio" según la causa. */
export function getCauseSide(cause: string | null | undefined): 'cliente' | 'estudio' {
  return cause && CLIENT_SIDE_CAUSES.has(cause) ? 'cliente' : 'estudio';
}

/** Período "En espera" de una etapa o del proyecto (paralizado). */
export interface HoldPeriod {
  id: number;
  stage_id: number | null;
  cause: DelayCause | null;
  note?: string | null;
  started_at: string;
  ended_at?: string | null;
  started_by_name?: string | null;
  ended_by_name?: string | null;
  /** Días contados (hasta hoy si sigue abierto). */
  days: number;
}

export const pluralDays = (days: number) => `${days} ${days === 1 ? 'día' : 'días'}`;

// Fecha de calendario (AAAA-MM-DD) en Argentina para un timestamp del backend.
function argentinaDate(value: string): string {
  let normalized = value;
  if (!normalized.includes('T')) normalized = normalized.replace(' ', 'T');
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)) normalized += 'Z';
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

/**
 * La etapa superó su fecha estimada: sigue abierta después de esa fecha
 * o se completó más tarde. Las etapas "No aplica" no cuentan.
 */
export function isStageOverdue(stage: {
  estimated_end_date?: string | null;
  completed_date?: string | null;
  is_completed?: boolean | number;
  not_applicable?: boolean | number;
}): boolean {
  if (!stage.estimated_end_date || stage.not_applicable) return false;
  const estimated = stage.estimated_end_date.slice(0, 10);
  const end = stage.is_completed && stage.completed_date
    ? argentinaDate(stage.completed_date)
    : argentinaDate(new Date().toISOString());
  return end > estimated;
}

/** Etiqueta "Esperando respuesta (del) cliente": al ponerla se ofrece poner la etapa en espera. */
export function isClientWaitingTag(name: string | null | undefined): boolean {
  const normalized = (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return normalized.includes('esperando') && normalized.includes('cliente');
}
