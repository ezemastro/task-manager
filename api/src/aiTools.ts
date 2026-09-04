// Tool catalogue for the AI assistant. Slice 1 added the 5 read tools
// (search_projects, get_project, search_stages, list_reference_data,
// get_summary). Slice 3 added the 8 write tools, dispatched via loopback
// HTTP (design.md D2) — see aiExecutor.ts's callInternal(). Slice 4 adds
// navigate_to (read class) and delete_entity (destructive class, two-phase
// confirmation via aiPending.ts) below.
//
// `intermediate_date_note` MUST NEVER appear in any tool schema: it is
// accepted by `PUT /stages/:id` but the `stages` table has no such column.
//
// LOOPBACK_PATHS is the fixed path-template table design.md D2 requires:
// only validated integers (already checked by aiSchema's `int` kind) are
// ever interpolated into a path, and `/api/assistant/*` never appears here
// so the assistant cannot recurse into itself.

import { validateArgs, type ToolSchema, type ValidationResult } from './aiSchema';
import type { ToolDefinition as ProviderToolDefinition } from './aiProvider';
import { NAVIGATE_ROUTE_TOKENS } from './aiNavigation';

export type ToolClass = 'read' | 'write' | 'destructive';

export interface AiToolDefinition {
  name: string;
  class: ToolClass;
  /** Generic argument schema, validated by aiSchema.validateArgs(). */
  schema: ToolSchema;
  /** One-line human-readable summary, used verbatim in the system prompt catalogue. */
  summary: string;
  /**
   * Static resource-hint keys this tool may emit on success (see
   * AssistantDataBus's hint vocabulary, added in Slice 3). Read tools never
   * mutate data, so this is always empty in Slice 1.
   */
  resourceHints: string[];
}

// `list_reference_data`'s `entity_types` parameter is conceptually
// `array<enum(clients,users,tags,stage_templates)>`, but aiSchema.ts's
// FieldSpec union (design.md) intentionally covers only int/string/enum/date/
// bool — no array kind. Rather than widening that shared contract for one
// field, `entity_types` is validated ad hoc in aiExecutor.ts and is excluded
// from this tool's generic ToolSchema (documented deviation).
export const REFERENCE_DATA_ENTITY_TYPES = ['clients', 'users', 'tags', 'stage_templates'] as const;
export type ReferenceDataEntityType = (typeof REFERENCE_DATA_ENTITY_TYPES)[number];

export const PROJECT_STATUS_VALUES = ['active', 'paused', 'completed'] as const;
export const STAGE_STATE_ACTIONS = ['start', 'unstart', 'complete', 'uncomplete'] as const;
export const STAGE_CYCLE_ACTIONS = ['start', 'finish'] as const;
export const STAGE_TAG_ACTIONS = ['add', 'remove'] as const;

// Widened from the proposal's project|stage|client|comment (orchestrator
// directive for Slice 4: full functional coverage on the same single tool —
// no extra tool, no extra model confusion). `assertOwned()` in aiExecutor.ts
// gates every one of these before a pending action is even issued.
export const DELETE_ENTITY_TYPES = [
  'project',
  'stage',
  'client',
  'comment',
  'tag',
  'stage_template',
  'user',
] as const;
export type DeleteEntityType = (typeof DELETE_ENTITY_TYPES)[number];

/**
 * Fixed loopback path templates for the write tools (design.md D2's guard).
 * Every id parameter here is already validated as `kind: 'int', min: 1` by
 * aiSchema.ts before it reaches these builders — no model-supplied string
 * is ever interpolated.
 */
export const LOOPBACK_PATHS = {
  createProject: '/projects',
  project: (id: number) => `/projects/${id}`,
  stageComplete: (id: number) => `/stages/${id}/complete`,
  stageStart: (id: number) => `/stages/${id}/start`,
  stageUnstart: (id: number) => `/stages/${id}/unstart`,
  stageUncomplete: (id: number) => `/stages/${id}/uncomplete`,
  stageCycles: (stageId: number) => `/stages/${stageId}/cycles`,
  stageCycleFinish: (stageId: number, cycleId: number) => `/stages/${stageId}/cycles/${cycleId}/finish`,
  comments: '/comments',
  stageTags: (stageId: number) => `/stages/${stageId}/tags`,
  stageTagRemove: (stageId: number, tagId: number) => `/stages/${stageId}/tags/${tagId}`,
  clients: '/clients',
  // Slice 4: delete_entity's per-type DELETE targets. `project` above is
  // reused for its DELETE verb too (same path, different HTTP method).
  stage: (id: number) => `/stages/${id}`,
  client: (id: number) => `/clients/${id}`,
  comment: (id: number) => `/comments/${id}`,
  tag: (id: number) => `/tags/${id}`,
  stageTemplate: (id: number) => `/stage-templates/${id}`,
  user: (id: number) => `/users/${id}`,
} as const;

const searchProjectsSchema: ToolSchema = {
  name: { kind: 'string', required: false, maxLength: 200 },
  status: { kind: 'enum', required: false, values: PROJECT_STATUS_VALUES },
  client_id: { kind: 'int', required: false, min: 1 },
  responsible_id: { kind: 'int', required: false, min: 1 },
};

const getProjectSchema: ToolSchema = {
  project_id: { kind: 'int', required: true, min: 1 },
};

const searchStagesSchema: ToolSchema = {
  project_id: { kind: 'int', required: false, min: 1 },
  name: { kind: 'string', required: false, maxLength: 200 },
  responsible_id: { kind: 'int', required: false, min: 1 },
  is_completed: { kind: 'bool', required: false },
};

const listReferenceDataSchema: ToolSchema = {
  // entity_types intentionally absent — see REFERENCE_DATA_ENTITY_TYPES note above.
  name: { kind: 'string', required: false, maxLength: 100 },
};

const getSummarySchema: ToolSchema = {
  year: { kind: 'int', required: false, min: 1900, max: 3000 },
};

// `entity_id` is conditionally required (only for the project_detail /
// stage_detail tokens) — aiSchema.ts's FieldSpec union has no "required if"
// primitive (same documented limitation as update_project's "at least one
// field" rule), so that check lives in aiNavigation.ts's resolveNavigation().
const navigateToSchema: ToolSchema = {
  route: { kind: 'enum', required: true, values: NAVIGATE_ROUTE_TOKENS },
  entity_id: { kind: 'int', required: false, min: 1 },
};

export const readTools: AiToolDefinition[] = [
  {
    name: 'search_projects',
    class: 'read',
    schema: searchProjectsSchema,
    summary:
      'search_projects(name?:string, status?:active|paused|completed, client_id?:int, responsible_id?:int) — lists projects in your organization, defaults to active only when status is omitted',
    resourceHints: [],
  },
  {
    name: 'get_project',
    class: 'read',
    schema: getProjectSchema,
    summary: 'get_project(project_id:int) — fetches one project with its stages, only if you own it',
    resourceHints: [],
  },
  {
    name: 'search_stages',
    class: 'read',
    schema: searchStagesSchema,
    summary:
      'search_stages(project_id?:int, name?:string, responsible_id?:int, is_completed?:bool) — lists stages; only reaches stages of ACTIVE projects, paused/completed projects are invisible here',
    resourceHints: [],
  },
  {
    name: 'list_reference_data',
    class: 'read',
    schema: listReferenceDataSchema,
    summary:
      'list_reference_data(entity_types?:array<clients|users|tags|stage_templates>, name?:string) — lists lookup data such as clients, users, tags and stage templates; omit entity_types to list all; name (optional) filters the listed entities by partial, accent-insensitive name match',
    resourceHints: [],
  },
  {
    name: 'get_summary',
    class: 'read',
    schema: getSummarySchema,
    summary: 'get_summary(year?:int) — yearly project/stage summary counts, defaults to the current year',
    resourceHints: [],
  },
  {
    name: 'navigate_to',
    class: 'read',
    schema: navigateToSchema,
    summary:
      'navigate_to(route:enum, entity_id?:int) — sends the user to a screen in the app; entity_id is required (and re-validated for ownership) for route=project_detail|stage_detail, see the navigate_to route enum below',
    resourceHints: [],
  },
];

const createProjectSchema: ToolSchema = {
  name: { kind: 'string', required: true, maxLength: 200 },
  description: { kind: 'string', required: false, maxLength: 2000 },
  client_id: { kind: 'int', required: false, min: 1 },
  responsible_id: { kind: 'int', required: false, min: 1 },
  deadline: { kind: 'date', required: false },
};

const updateProjectSchema: ToolSchema = {
  project_id: { kind: 'int', required: true, min: 1 },
  name: { kind: 'string', required: false, maxLength: 200 },
  description: { kind: 'string', required: false, maxLength: 2000 },
  deadline: { kind: 'date', required: false },
  client_id: { kind: 'int', required: false, min: 1 },
  responsible_id: { kind: 'int', required: false, min: 1 },
};

const setProjectStatusSchema: ToolSchema = {
  project_id: { kind: 'int', required: true, min: 1 },
  status: { kind: 'enum', required: true, values: PROJECT_STATUS_VALUES },
};

const setStageStateSchema: ToolSchema = {
  stage_id: { kind: 'int', required: true, min: 1 },
  action: { kind: 'enum', required: true, values: STAGE_STATE_ACTIONS },
};

const manageStageCycleSchema: ToolSchema = {
  stage_id: { kind: 'int', required: true, min: 1 },
  action: { kind: 'enum', required: true, values: STAGE_CYCLE_ACTIONS },
  cycle_id: { kind: 'int', required: false, min: 1 },
};

const addCommentSchema: ToolSchema = {
  stage_id: { kind: 'int', required: true, min: 1 },
  content: { kind: 'string', required: true, maxLength: 2000 },
};

const setStageTagSchema: ToolSchema = {
  stage_id: { kind: 'int', required: true, min: 1 },
  tag_id: { kind: 'int', required: true, min: 1 },
  action: { kind: 'enum', required: true, values: STAGE_TAG_ACTIONS },
};

const createClientSchema: ToolSchema = {
  name: { kind: 'string', required: true, maxLength: 200 },
  email: { kind: 'string', required: false, maxLength: 200 },
  phone: { kind: 'string', required: false, maxLength: 50 },
};

export const writeTools: AiToolDefinition[] = [
  {
    name: 'create_project',
    class: 'write',
    schema: createProjectSchema,
    summary:
      'create_project(name:string, description?:string, client_id?:int, responsible_id?:int, deadline?:date) — creates a project in your organization',
    resourceHints: ['projects'],
  },
  {
    name: 'update_project',
    class: 'write',
    schema: updateProjectSchema,
    summary:
      'update_project(project_id:int, name?:string, description?:string, deadline?:date, client_id?:int, responsible_id?:int) — updates a project you own; at least one field besides project_id is required',
    resourceHints: ['projects', 'project:<id>'],
  },
  {
    name: 'set_project_status',
    class: 'write',
    schema: setProjectStatusSchema,
    summary:
      'set_project_status(project_id:int, status:active|paused|completed) — changes a project\'s status',
    resourceHints: ['projects', 'project:<id>'],
  },
  {
    name: 'set_stage_state',
    class: 'write',
    schema: setStageStateSchema,
    summary:
      'set_stage_state(stage_id:int, action:start|unstart|complete|uncomplete) — starts, un-starts, completes or reopens a stage; only reaches stages of ACTIVE projects',
    resourceHints: ['stages', 'stage:<id>'],
  },
  {
    name: 'manage_stage_cycle',
    class: 'write',
    schema: manageStageCycleSchema,
    summary:
      'manage_stage_cycle(stage_id:int, action:start|finish, cycle_id?:int) — starts or finishes a work cycle on a stage; cycle_id is required to finish',
    resourceHints: ['stages', 'stage:<id>'],
  },
  {
    name: 'add_comment',
    class: 'write',
    schema: addCommentSchema,
    summary: 'add_comment(stage_id:int, content:string) — adds a comment to a stage',
    resourceHints: ['comments', 'stage:<id>'],
  },
  {
    name: 'set_stage_tag',
    class: 'write',
    schema: setStageTagSchema,
    summary: 'set_stage_tag(stage_id:int, tag_id:int, action:add|remove) — adds or removes a tag on a stage',
    resourceHints: ['stages', 'stage:<id>'],
  },
  {
    name: 'create_client',
    class: 'write',
    schema: createClientSchema,
    summary: 'create_client(name:string, email?:string, phone?:string) — creates a client in your organization',
    resourceHints: ['clients'],
  },
];

const deleteEntitySchema: ToolSchema = {
  entity_type: { kind: 'enum', required: true, values: DELETE_ENTITY_TYPES },
  entity_id: { kind: 'int', required: true, min: 1 },
};

export const destructiveTools: AiToolDefinition[] = [
  {
    name: 'delete_entity',
    class: 'destructive',
    schema: deleteEntitySchema,
    summary:
      'delete_entity(entity_type:enum, entity_id:int) — proposes deleting an entity; NEVER deletes directly, always returns a pending action that requires an explicit human confirmation click',
    // Resource hints for a confirmed deletion are computed dynamically per
    // entity_type at issue time (aiExecutor.ts's execDeleteEntity) and
    // stored on the pending record, not declared statically here.
    resourceHints: [],
  },
];

/** Full catalogue: Slice 1 read tools + navigate_to, Slice 3 write tools, Slice 4 delete_entity. */
export const toolCatalogue: AiToolDefinition[] = [...readTools, ...writeTools, ...destructiveTools];

export function findTool(name: string): AiToolDefinition | undefined {
  return toolCatalogue.find((tool) => tool.name === name);
}

/**
 * Discovered defect (fix batch, not one of Defects A/B/C but directly
 * blocking their live verification): `list_reference_data`'s `entity_types`
 * is intentionally absent from `listReferenceDataSchema` (see the comment
 * above `REFERENCE_DATA_ENTITY_TYPES`), but BOTH aiLoop.ts's loop-level
 * pre-validation gate and aiExecutor.ts's own defense-in-depth call used the
 * plain generic `validateArgs(tool.schema, args)` against that same empty
 * schema — which rejects `entity_types` as "not a recognized argument"
 * every single time. The tool could therefore only ever be called with NO
 * filter at all; every filtered call burned the turn's one repair round and
 * often degraded the whole turn. This wrapper is the single source of truth
 * both callers now use instead of calling `validateArgs()` directly.
 */
export function validateToolCallArgs(tool: AiToolDefinition, args: unknown): ValidationResult {
  if (tool.name !== 'list_reference_data') {
    return validateArgs(tool.schema, args);
  }

  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { ok: false, errors: [{ field: '(root)', message: 'arguments must be a JSON object' }] };
  }
  const { entity_types, ...rest } = args as Record<string, unknown>;
  const restResult = validateArgs(tool.schema, rest);
  if (!restResult.ok) return restResult;

  if (entity_types === undefined) {
    return restResult;
  }
  if (
    Array.isArray(entity_types) &&
    entity_types.every((item) => typeof item === 'string' && (REFERENCE_DATA_ENTITY_TYPES as readonly string[]).includes(item))
  ) {
    return { ok: true, value: { ...restResult.value, entity_types } };
  }
  return {
    ok: false,
    errors: [
      { field: 'entity_types', message: `entity_types must be an array of: ${REFERENCE_DATA_ENTITY_TYPES.join('|')}` },
    ],
  };
}

function fieldToJsonSchema(spec: ToolSchema[string]): Record<string, unknown> {
  switch (spec.kind) {
    case 'int':
      return { type: 'integer', ...(spec.min !== undefined ? { minimum: spec.min } : {}), ...(spec.max !== undefined ? { maximum: spec.max } : {}) };
    case 'string':
      return { type: 'string', maxLength: spec.maxLength };
    case 'enum':
      return { type: 'string', enum: [...spec.values] };
    case 'date':
      return { type: 'string', description: 'YYYY-MM-DD' };
    case 'bool':
      return { type: 'boolean' };
    default:
      return {};
  }
}

/** Converts the internal catalogue into OpenAI-compatible native `tools[]` for the opportunistic fast path. */
export function toProviderToolDefinitions(): ProviderToolDefinition[] {
  return toolCatalogue.map((tool) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [field, spec] of Object.entries(tool.schema)) {
      properties[field] = fieldToJsonSchema(spec);
      if (spec.required) required.push(field);
    }
    if (tool.name === 'list_reference_data') {
      properties.entity_types = {
        type: 'array',
        items: { type: 'string', enum: [...REFERENCE_DATA_ENTITY_TYPES] },
      };
    }
    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.summary,
        parameters: { type: 'object', properties, required, additionalProperties: false },
      },
    };
  });
}
