// Cliente, responsable y fecha límite son datos esperados en todo proyecto,
// pero no bloquean el guardado: si faltan, se muestra un aviso en el
// formulario y la etiqueta "Faltan datos" en el tablero hasta completarlos.

export type ExpectedProjectField = 'client_id' | 'responsible_id' | 'deadline';

export const EXPECTED_PROJECT_FIELD_LABELS: Record<ExpectedProjectField, string> = {
  client_id: 'Cliente',
  responsible_id: 'Responsable',
  deadline: 'Fecha comprometida',
};

export const MISSING_FIELD_MESSAGES: Record<ExpectedProjectField, string> = {
  client_id: 'Falta el cliente',
  responsible_id: 'Falta el responsable',
  deadline: 'Falta la fecha comprometida de entrega',
};

/** Avisos por campo para un formulario de proyecto (no impiden guardar). */
export function getMissingFieldWarnings(values: {
  client_id?: number | null;
  responsible_id?: number | null;
  deadline?: string | null;
}): Partial<Record<ExpectedProjectField, string>> {
  const warnings: Partial<Record<ExpectedProjectField, string>> = {};
  if (!values.client_id) warnings.client_id = MISSING_FIELD_MESSAGES.client_id;
  if (!values.responsible_id) warnings.responsible_id = MISSING_FIELD_MESSAGES.responsible_id;
  if (!values.deadline) warnings.deadline = MISSING_FIELD_MESSAGES.deadline;
  return warnings;
}

/**
 * Etiquetas de los datos que le faltan a un proyecto guardado.
 * Se basa en los nombres resueltos por la API (client_name / responsible_name),
 * que quedan vacíos también si el cliente o usuario fue eliminado.
 */
export function getMissingProjectData(project: {
  clientName?: string | null;
  responsibleName?: string | null;
  deadline?: string | null;
}): string[] {
  const missing: string[] = [];
  if (!project.clientName) missing.push(EXPECTED_PROJECT_FIELD_LABELS.client_id);
  if (!project.responsibleName) missing.push(EXPECTED_PROJECT_FIELD_LABELS.responsible_id);
  if (!project.deadline) missing.push(EXPECTED_PROJECT_FIELD_LABELS.deadline);
  return missing;
}
