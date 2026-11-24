// Atributos de etapa que cada empresa configura una vez en Etapas predefinidas
// y que se copian a las etapas de cada proyecto. Deben coincidir con
// STAGE_KINDS / STAGE_MILESTONES en api/src/apiRouter.ts.

export type StageKind = 'execution' | 'control';
export type StageMilestone = 'delivery' | 'client_closing';

export interface StageAttributes {
  stage_kind?: StageKind;
  milestone?: StageMilestone | null;
  is_required?: number | boolean;
  counts_work_time?: number | boolean;
  // "No aplica" (solo en etapas de proyecto): motivo y quién lo decidió.
  not_applicable?: number | boolean;
  not_applicable_reason?: string | null;
  not_applicable_by_name?: string | null;
  not_applicable_at?: string | null;
}

/** Etapa obligatoria que todavía no está completada ni marcada "No aplica". */
export function isPendingRequired(stage: StageAttributes & { is_completed?: boolean | number }): boolean {
  return Boolean(stage.is_required) && !stage.is_completed && !stage.not_applicable;
}

export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  execution: 'Ejecución',
  control: 'Control',
};

export const STAGE_MILESTONE_LABELS: Record<StageMilestone, string> = {
  delivery: 'Marca la entrega',
  client_closing: 'Marca el cierre del cliente',
};

export const STAGE_MILESTONE_SHORT_LABELS: Record<StageMilestone, string> = {
  delivery: 'Entrega',
  client_closing: 'Cierre cliente',
};

export const STAGE_MILESTONE_HELP: Record<StageMilestone, string> = {
  delivery: 'Al completarla se registra la fecha real de entrega (mide el retraso).',
  client_closing: 'Al completarla se registra el cierre administrativo (no cuenta para el retraso).',
};

/** La etapa marca la entrega real del proyecto. */
export function isDeliveryStage(stage: StageAttributes): boolean {
  return stage.milestone === 'delivery';
}

export function countsWorkTime(stage: StageAttributes): boolean {
  return stage.counts_work_time === undefined ? true : Boolean(stage.counts_work_time);
}
