// Tipos de proyecto. Cada tipo tiene su propia lista de etapas predefinidas,
// que se copian al proyecto cuando se crea con ese tipo.
// Los valores deben coincidir con PROJECT_TYPES en api/src/apiRouter.ts.

export const PROJECT_TYPES = ['obra_nueva', 'carteles', 'reforma'] as const;
export type ProjectType = typeof PROJECT_TYPES[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  obra_nueva: 'Obra nueva',
  carteles: 'Carteles',
  reforma: 'Reforma',
};

export function getProjectTypeLabel(type?: string | null): string | null {
  return type && type in PROJECT_TYPE_LABELS ? PROJECT_TYPE_LABELS[type as ProjectType] : null;
}
