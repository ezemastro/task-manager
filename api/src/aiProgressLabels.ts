// Server-side Spanish label generation for live progress steps. Every
// function here derives its text from the TOOL NAME, its VALIDATED ARGUMENTS
// and its REAL RESULT DATA — never from the model's prose. This is the
// decisive constraint of the whole feature: a step label must stay correct
// even when the model's own reply is wrong, ambiguous, or missing.
//
// Coverage: every tool in aiTools.ts's catalogue has an explicit case below.
// An unmapped tool name (should not happen — defense in depth only) falls
// back to a humanized version of its name rather than exposing a raw
// identifier or crashing.

import type { ToolResult } from './aiExecutor';
import type { PendingActionView } from './aiPending';
import { DELETE_ENTITY_TYPES, type DeleteEntityType } from './aiTools';

function humanizeToolName(toolName: string): string {
  return toolName.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const TOOL_NOUNS: Record<string, string> = {
  search_projects: 'los proyectos',
  get_project: 'el proyecto',
  search_stages: 'las etapas',
  list_reference_data: 'los datos de referencia',
  get_summary: 'el resumen',
  navigate_to: 'la pantalla',
  create_project: 'el proyecto',
  update_project: 'el proyecto',
  set_project_status: 'el proyecto',
  set_stage_state: 'la etapa',
  manage_stage_cycle: 'el ciclo de trabajo',
  add_comment: 'el comentario',
  set_stage_tag: 'la etiqueta',
  create_client: 'el cliente',
};

const DELETE_ENTITY_NOUNS: Record<DeleteEntityType, string> = {
  project: 'el proyecto',
  stage: 'la etapa',
  client: 'el cliente',
  comment: 'el comentario',
  tag: 'la etiqueta',
  stage_template: 'la plantilla de etapa',
  user: 'el usuario',
};

function isDeleteEntityType(value: unknown): value is DeleteEntityType {
  return typeof value === 'string' && (DELETE_ENTITY_TYPES as readonly string[]).includes(value);
}

function noun(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'delete_entity' && isDeleteEntityType(args.entity_type)) {
    return DELETE_ENTITY_NOUNS[args.entity_type];
  }
  return TOOL_NOUNS[toolName] ?? humanizeToolName(toolName).toLowerCase();
}

const STATIC_ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'el panel principal',
  '/stages': 'todas las etapas',
  '/completed-projects': 'los proyectos completados',
  '/paused-projects': 'los proyectos pausados',
  '/users-management': 'la gestión de usuarios',
  '/clients-management': 'la gestión de clientes',
  '/stage-templates': 'las plantillas de etapa',
  '/summary': 'el resumen',
};

/** Running-state label, shown while the tool call is in flight. */
export function describeToolStart(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'search_projects':
      return 'Buscando proyectos';
    case 'get_project':
      return 'Abriendo el proyecto';
    case 'search_stages':
      return 'Buscando etapas';
    case 'list_reference_data':
      return 'Consultando datos de referencia';
    case 'get_summary':
      return 'Calculando el resumen';
    case 'navigate_to':
      return 'Abriendo la pantalla';
    case 'create_project':
      return 'Creando el proyecto';
    case 'update_project':
      return 'Actualizando el proyecto';
    case 'set_project_status':
      switch (args.status) {
        case 'paused':
          return 'Pausando el proyecto';
        case 'active':
          return 'Reactivando el proyecto';
        case 'completed':
          return 'Marcando el proyecto como completado';
        default:
          return 'Actualizando el estado del proyecto';
      }
    case 'set_stage_state':
      switch (args.action) {
        case 'start':
          return 'Iniciando la etapa';
        case 'unstart':
          return 'Revirtiendo el inicio de la etapa';
        case 'complete':
          return 'Completando la etapa';
        case 'uncomplete':
          return 'Reabriendo la etapa';
        default:
          return 'Actualizando la etapa';
      }
    case 'manage_stage_cycle':
      return args.action === 'finish' ? 'Finalizando el ciclo de trabajo' : 'Iniciando un ciclo de trabajo';
    case 'add_comment':
      return 'Agregando el comentario';
    case 'set_stage_tag':
      return args.action === 'remove' ? 'Quitando la etiqueta' : 'Agregando la etiqueta';
    case 'create_client':
      return 'Creando el cliente';
    case 'delete_entity':
      return 'Preparando la eliminación';
    default:
      return `Ejecutando: ${humanizeToolName(toolName)}`;
  }
}

function readArray(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function readObject(data: unknown): Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

const REFERENCE_DATA_LABELS: Record<string, string> = {
  clients: 'clientes',
  users: 'usuarios',
  tags: 'etiquetas',
  stage_templates: 'plantillas de etapa',
};

/** Completed-state label for a successful, non-pending tool result. */
export function describeToolResult(toolName: string, args: Record<string, unknown>, result: ToolResult): string {
  if (!result.ok) return describeToolError(toolName, args, result.error);
  const data = result.data;

  switch (toolName) {
    case 'search_projects': {
      const rows = readArray(data);
      if (rows.length === 0) return 'No encontré proyectos';
      if (rows.length === 1) return `Encontré el proyecto «${String(rows[0].name)}»`;
      return `Encontré ${rows.length} proyectos`;
    }
    case 'get_project': {
      const project = readObject(data);
      return typeof project.name === 'string' ? `Leí el proyecto «${project.name}»` : 'Leí el proyecto';
    }
    case 'search_stages': {
      const rows = readArray(data);
      if (rows.length === 0) return 'No encontré etapas';
      if (rows.length === 1) return `Encontré la etapa «${String(rows[0].name)}»`;
      return `Encontré ${rows.length} etapas`;
    }
    case 'list_reference_data': {
      const obj = readObject(data);
      const parts: string[] = [];
      for (const key of ['clients', 'users', 'tags', 'stage_templates']) {
        const rows = readArray(obj[key]);
        if (rows.length > 0) parts.push(`${rows.length} ${REFERENCE_DATA_LABELS[key]}`);
      }
      return parts.length > 0 ? `Encontré ${parts.join(', ')}` : 'No encontré datos de referencia';
    }
    case 'get_summary': {
      const obj = readObject(data);
      return typeof obj.year === 'number' || typeof obj.year === 'string'
        ? `Resumen del año ${obj.year} listo`
        : 'Resumen listo';
    }
    case 'navigate_to': {
      const obj = readObject(data);
      if (typeof obj.entityName === 'string' && obj.entityName.trim() !== '') {
        return `Te llevé a ${obj.entityName}`;
      }
      if (typeof obj.path === 'string' && STATIC_ROUTE_LABELS[obj.path]) {
        return `Te llevé a ${STATIC_ROUTE_LABELS[obj.path]}`;
      }
      return 'Te llevé a la pantalla solicitada';
    }
    case 'create_project': {
      const obj = readObject(data);
      return typeof obj.name === 'string' ? `Proyecto creado: «${obj.name}»` : 'Proyecto creado';
    }
    case 'update_project': {
      const obj = readObject(data);
      return typeof obj.name === 'string' ? `Proyecto actualizado: «${obj.name}»` : 'Proyecto actualizado';
    }
    case 'set_project_status':
      switch (args.status) {
        case 'paused':
          return 'Proyecto pausado';
        case 'active':
          return 'Proyecto reactivado';
        case 'completed':
          return 'Proyecto completado';
        default:
          return 'Estado del proyecto actualizado';
      }
    case 'set_stage_state':
      switch (args.action) {
        case 'start':
          return 'Etapa iniciada';
        case 'unstart':
          return 'Etapa vuelta a pendiente';
        case 'complete':
          return 'Etapa completada';
        case 'uncomplete':
          return 'Etapa reabierta';
        default:
          return 'Etapa actualizada';
      }
    case 'manage_stage_cycle':
      return args.action === 'finish' ? 'Ciclo de trabajo finalizado' : 'Ciclo de trabajo iniciado';
    case 'add_comment':
      return 'Comentario agregado';
    case 'set_stage_tag':
      return args.action === 'remove' ? 'Etiqueta quitada' : 'Etiqueta agregada';
    case 'create_client': {
      const obj = readObject(data);
      return typeof obj.name === 'string' ? `Cliente creado: «${obj.name}»` : 'Cliente creado';
    }
    case 'delete_entity':
      // execDeleteEntity always returns `pending` on success (handled by the
      // caller via describeToolPending() before this function is even
      // reached). The one case that still lands here is a same-turn
      // duplicate call, whose wrapped result drops the `pending` field —
      // still true to what actually happened.
      return result.ok && 'pending' in result && result.pending
        ? describeToolPending(toolName, args, result.pending.view)
        : 'Ya había propuesto esta eliminación en este mismo pedido';
    default:
      return `${humanizeToolName(toolName)} completado`;
  }
}

/** Label for the terminal "awaiting human confirmation" state of a destructive tool call. */
export function describeToolPending(_toolName: string, _args: Record<string, unknown>, _view: PendingActionView): string {
  return 'Espero tu confirmación';
}

type ErrorBucket = 'notFound' | 'unknownOutcome' | 'duplicate' | 'generic';

function classifyError(rawError: string): ErrorBucket {
  if (/not found or not owned by your organization/i.test(rawError)) return 'notFound';
  if (/outcome unknown|do not repeat|timed out/i.test(rawError)) return 'unknownOutcome';
  if (/already attempted|already executed|already completed/i.test(rawError)) return 'duplicate';
  return 'generic';
}

// Matches the small, closed set of English strings authored directly in
// aiExecutor.ts/aiTools.ts/aiNavigation.ts (tenancy pre-checks, ad hoc
// validation, and the two blunt loopback-abort messages). Anything that does
// NOT match is very likely one of the app's own real Spanish route messages,
// or aiExecutor.ts's own sanitizeToolError() output — both already short,
// factual, and safe to show verbatim. A final safety net still screens that
// remainder for anything that smells like a raw driver/SQL leak.
const KNOWN_INTERNAL_ENGLISH_PATTERN =
  /not found or not owned by your organization|at least one field to update is required|cycle_id is required|unrecognized action|unknown tool|internal error executing|entity_types must be an array|outcome unknown|do not repeat|internal (read|write) request|request failed with status \d+$|route not allowed|entity_id is required|already attempted|already executed/i;

const UNSAFE_LEAK_PATTERN = /sqlite|constraint|stack trace|exception|at \S+\.(ts|js):\d+/i;

/** Failure-state label. Never surfaces a raw driver/SQL string or an ids-only identifier. */
export function describeToolError(toolName: string, args: Record<string, unknown>, rawError: string): string {
  const entityNoun = noun(toolName, args);

  if (!KNOWN_INTERNAL_ENGLISH_PATTERN.test(rawError) && !UNSAFE_LEAK_PATTERN.test(rawError)) {
    // Already one of the app's own real, factual Spanish messages (a route's
    // own error, or aiExecutor.ts's sanitizeToolError() output) — show it
    // directly instead of re-deriving a vaguer generic phrase.
    const trimmed = rawError.trim();
    if (trimmed.length > 0 && trimmed.length <= 160) return trimmed;
  }

  switch (classifyError(rawError)) {
    case 'notFound':
      return `No encontré ${entityNoun}`;
    case 'unknownOutcome':
      return `No quedó confirmado si se completó (${entityNoun}); lo estoy verificando`;
    case 'duplicate':
      return `Esta acción sobre ${entityNoun} ya se había hecho antes en este pedido`;
    default:
      return `No pude completar la acción sobre ${entityNoun}`;
  }
}
