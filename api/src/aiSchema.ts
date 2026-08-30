// Hand-rolled tool-argument schema validation. Zero dependencies.
// Error messages are authored in the exact phrasing fed back verbatim to the
// model during the single bounded repair round (see aiLoop.ts).

export type FieldSpec =
  | { kind: 'int'; required?: boolean; min?: number; max?: number }
  | { kind: 'string'; required?: boolean; maxLength: number }
  | { kind: 'enum'; required?: boolean; values: readonly string[] }
  | { kind: 'date'; required?: boolean } // YYYY-MM-DD, real calendar date
  | { kind: 'bool'; required?: boolean };

export type ToolSchema = Record<string, FieldSpec>;

export interface FieldError {
  field: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: FieldError[] };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function validateField(field: string, spec: FieldSpec, raw: unknown): FieldError | null {
  const missing = raw === undefined || raw === null;

  if (missing) {
    if (spec.required) {
      return { field, message: `${field} is required` };
    }
    return null;
  }

  switch (spec.kind) {
    case 'int': {
      if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        return { field, message: `${field} must be an integer` };
      }
      if (spec.min !== undefined && raw < spec.min) {
        return { field, message: `${field} must be >= ${spec.min}` };
      }
      if (spec.max !== undefined && raw > spec.max) {
        return { field, message: `${field} must be <= ${spec.max}` };
      }
      return null;
    }
    case 'string': {
      if (typeof raw !== 'string') {
        return { field, message: `${field} must be a string` };
      }
      if (raw.length > spec.maxLength) {
        return { field, message: `${field} must be at most ${spec.maxLength} characters` };
      }
      return null;
    }
    case 'enum': {
      if (typeof raw !== 'string' || !spec.values.includes(raw)) {
        return { field, message: `${field} must be one of: ${spec.values.join('|')}` };
      }
      return null;
    }
    case 'date': {
      if (typeof raw !== 'string' || !isRealCalendarDate(raw)) {
        return { field, message: `${field} must be a real calendar date in YYYY-MM-DD format` };
      }
      return null;
    }
    case 'bool': {
      if (typeof raw !== 'boolean') {
        return { field, message: `${field} must be a boolean` };
      }
      return null;
    }
    default:
      return { field, message: `${field} has an unrecognized schema kind` };
  }
}

/**
 * Validates `args` against `schema`. Rejects unknown keys, missing required
 * fields, and out-of-range/mismatched-type values before any execution.
 */
export function validateArgs(schema: ToolSchema, args: unknown): ValidationResult {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { ok: false, errors: [{ field: '(root)', message: 'arguments must be a JSON object' }] };
  }

  const errors: FieldError[] = [];
  const input = args as Record<string, unknown>;

  for (const key of Object.keys(input)) {
    if (!(key in schema)) {
      errors.push({ field: key, message: `${key} is not a recognized argument for this tool` });
    }
  }

  const value: Record<string, unknown> = {};
  for (const [field, spec] of Object.entries(schema)) {
    const error = validateField(field, spec, input[field]);
    if (error) {
      errors.push(error);
    } else if (input[field] !== undefined) {
      value[field] = input[field];
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value };
}
