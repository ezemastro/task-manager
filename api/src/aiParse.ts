// Dual-path parsing pipeline: normalizes either a native OpenAI-compatible
// `tool_calls` entry or a constrained ```action fenced JSON block into one
// internal call shape. No `eval`, bounded repair passes, string/escape-aware
// scanning (no backtracking-prone regex for the brace scan).

import { randomUUID } from 'crypto';
import type { RawToolCall } from './aiProvider';

export interface NormalizedCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ParseOutcome =
  | { kind: 'call'; call: NormalizedCall; source: 'native' | 'text' }
  | { kind: 'final'; text: string }
  | { kind: 'unparseable'; reason: string; sample: string };

const MAX_REPAIR_PASSES = 3;
const PREFERRED_TAGS = ['action', 'json'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```[a-zA-Z]*\n?([\s\S]*?)\n?```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function normalizeSmartQuotes(raw: string): string {
  return raw.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function dropTrailingCommas(raw: string): string {
  return raw.replace(/,(\s*[}\]])/g, '$1');
}

/** String/escape-aware: truncates back to the last position where brace/bracket depth returned to 0. */
function depthTruncate(raw: string): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastZero = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) lastZero = i;
    }
  }
  return lastZero >= 0 ? raw.slice(0, lastZero + 1) : raw;
}

/**
 * Bounded JSON repair: trim, strip fences, normalize smart quotes, drop
 * trailing commas, depth-truncate. Max 3 parse attempts, no `eval`.
 */
export function parseLooseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  let candidate = normalizeSmartQuotes(stripFences(raw));
  candidate = dropTrailingCommas(candidate);

  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      if (pass === 0) {
        candidate = dropTrailingCommas(depthTruncate(candidate));
      } else if (pass === 1) {
        candidate = candidate.trim();
      }
    }
  }
  return { ok: false, error: 'Unable to parse JSON after bounded repair' };
}

interface FencedBlock {
  tag: string | undefined;
  body: string;
}

function collectFencedBlocks(content: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  const regex = /```([a-zA-Z]*)\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const tag = match[1] ? match[1].toLowerCase() : undefined;
    blocks.push({ tag, body: match[2].trim() });
  }
  return blocks;
}

/** Finds top-level balanced {...} regions, string/escape-aware, no nested backtracking. */
function collectBraceRegions(content: string): string[] {
  const regions: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          regions.push(content.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return regions;
}

/**
 * Extracts ordered candidate strings from a model text response.
 * Fence tag preference: `action` -> `json` -> untagged. Falls back to a
 * brace-scan for the first balanced `{...}` region containing `"tool"`
 * only when no fenced block exists at all.
 */
export function extractActionBlock(content: string): string[] {
  const blocks = collectFencedBlocks(content);
  if (blocks.length > 0) {
    const ordered: string[] = [];
    for (const tag of PREFERRED_TAGS) {
      for (const block of blocks) {
        if (block.tag === tag) ordered.push(block.body);
      }
    }
    for (const block of blocks) {
      if (!block.tag) ordered.push(block.body);
    }
    // Include any remaining tagged-but-not-preferred blocks last, so nothing is silently dropped.
    for (const block of blocks) {
      if (block.tag && !(PREFERRED_TAGS as readonly string[]).includes(block.tag)) {
        ordered.push(block.body);
      }
    }
    return ordered;
  }

  return collectBraceRegions(content).filter((region) => region.includes('"tool"'));
}

function randomCallId(): string {
  return `text-${randomUUID()}`;
}

// Defect A backstop: `[DATA tool=...]...[/DATA]` is aiPrompt.ts's own
// observation-wrapping format (wrapData()) — a weak model occasionally
// imitates it when producing its "final" prose instead of emitting a real
// action block. A final answer that echoes this exact internal format is
// never a legitimate reply, so it is treated as unparseable and routed into
// the existing bounded repair round (aiLoop.ts) instead of being returned to
// the user verbatim. See also aiPrompt.ts's hard rule forbidding the model
// from producing this format itself.
const DATA_BLOCK_ECHO_PATTERN = /\[DATA(\s+tool=|\])|\[\/DATA\]/i;

function looksLikeDataBlockEcho(text: string): boolean {
  return DATA_BLOCK_ECHO_PATTERN.test(text);
}

/** Normalizes a model turn (native tool_calls first, JSON-in-text fallback) into one ParseOutcome. */
export function normalizeModelTurn(content: string, toolCalls: RawToolCall[]): ParseOutcome {
  if (toolCalls.length > 0) {
    // Extra tool_calls beyond the first are ignored — one call per turn is a hard rule.
    const first = toolCalls[0];
    const parsed = parseLooseJson(first.function.arguments || '{}');
    if (parsed.ok && isPlainObject(parsed.value)) {
      return {
        kind: 'call',
        call: { id: first.id, name: first.function.name, args: parsed.value },
        source: 'native',
      };
    }
    return {
      kind: 'unparseable',
      reason: 'native tool_calls arguments are not a valid JSON object',
      sample: (first.function.arguments || '').slice(0, 200),
    };
  }

  const candidates = extractActionBlock(content);
  for (const candidate of candidates) {
    const parsed = parseLooseJson(candidate);
    if (parsed.ok && isPlainObject(parsed.value) && typeof parsed.value.tool === 'string') {
      const args = isPlainObject(parsed.value.args) ? parsed.value.args : {};
      return {
        kind: 'call',
        call: { id: randomCallId(), name: parsed.value.tool, args },
        source: 'text',
      };
    }
  }

  if (candidates.length > 0) {
    return {
      kind: 'unparseable',
      reason: 'an action block was present but did not parse into a valid tool call',
      sample: candidates[0].slice(0, 200),
    };
  }

  const finalText = content.trim();
  if (looksLikeDataBlockEcho(finalText)) {
    return {
      kind: 'unparseable',
      reason: 'final response imitates the internal [DATA]...[/DATA] observation format instead of answering the user',
      sample: finalText.slice(0, 200),
    };
  }

  return { kind: 'final', text: finalText };
}
