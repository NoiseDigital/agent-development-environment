// Parsers for the agent's GenUI `{ text, ui }` envelope.
//
// The agent's persona is "return JSON only", but model output is never
// perfectly compliant: it may wrap the envelope in a code fence, prepend a
// line of prose, drop a closing brace at the end of a stream, or sprinkle in
// Python literals (True / None) when paraphrasing tool output. These helpers
// recover the envelope leniently so the UI never sees raw JSON in a bubble.

import type { UIBlock, VegaSpec } from '../types/genui';

/** Extract the first complete, balanced JSON object from a string. Skips
 *  braces/brackets inside JSON string literals so a `"text": "{"` inside the
 *  envelope's text field doesn't fool the depth counter. */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** LLM-generated JSON occasionally blends in Python literals (True/False/None).
 *  Translate them to JSON — but only outside string content, so the message
 *  text the user reads is left untouched. */
export function normalizePythonJson(s: string): string {
  const LITERALS: Record<string, string> = { True: 'true', False: 'false', None: 'null' };
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    let matched = false;
    for (const [py, json] of Object.entries(LITERALS)) {
      if (s.startsWith(py, i) && !/[A-Za-z0-9_]/.test(s[i + py.length] ?? '')) {
        out += json;
        i += py.length - 1;
        matched = true;
        break;
      }
    }
    if (!matched) out += ch;
  }
  return out;
}

/** JSON.parse, retried once with Python literals normalised to JSON. */
export function parseJsonLoose(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    /* malformed — retry leniently below */
  }
  try {
    return JSON.parse(normalizePythonJson(s));
  } catch {
    return null;
  }
}

export interface ParsedAgentResponse {
  content: string;
  ui?: UIBlock[];
}

/** Parse the JSON object the agent emitted into the platform envelope.
 *  Accepts:
 *    - `{ text, ui }` — the canonical contract
 *    - `{ ui }` alone — agent forgot the text field; caller supplies prose
 *    - `{ text, visualization }` — legacy single-chart shape
 *    - a bare Vega-Lite spec — fallback for when the root agent paraphrases
 *      a chart subagent's envelope and drops the wrap. Heuristic: an object
 *      with `mark`, `layer`, `$schema`, or `vconcat`/`hconcat` is a spec.
 *  Returns null when the object can't plausibly be an envelope. */
function tryParseAgentJson(raw: string): ParsedAgentResponse | null {
  const parsed = parseJsonLoose(raw.trim()) as
    | (Record<string, unknown> & {
        text?: unknown;
        ui?: unknown;
        visualization?: unknown;
      })
    | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const hasText = parsed.text !== undefined;
  const hasUi = Array.isArray(parsed.ui);
  const hasViz = parsed.visualization !== undefined;

  if (hasText || hasUi || hasViz) {
    const result: ParsedAgentResponse = {
      content: hasText ? String(parsed.text) : '',
    };
    if (hasUi) {
      result.ui = parsed.ui as UIBlock[];
    } else if (hasViz) {
      // Legacy shape: one or more charts under `visualization` → chart blocks.
      const viz = parsed.visualization;
      const charts: VegaSpec[] = Array.isArray(viz) ? viz : [viz as VegaSpec];
      result.ui = charts.map((props) => ({ component: 'chart', props }));
    }
    return result;
  }

  // Fallback: a bare Vega-Lite spec. The agent contract is "always wrap in
  // { text, ui }", but the root agent occasionally paraphrases and emits
  // the chart spec by itself. Rather than render raw JSON in the bubble,
  // we recognise the spec shape and wrap it ourselves.
  if (looksLikeVegaSpec(parsed)) {
    return {
      content: '',
      ui: [{ component: 'chart', props: parsed as VegaSpec }],
    };
  }
  return null;
}

/** Heuristic test for a Vega-Lite spec. The fields that uniquely identify
 *  one in this codebase: `mark`, `layer`, `$schema`, `vconcat`, `hconcat`,
 *  `repeat`, `facet`. The presence of any one (with no `text`/`ui` to
 *  override) is enough to assume the object is a chart spec. */
function looksLikeVegaSpec(obj: Record<string, unknown>): boolean {
  return (
    'mark' in obj ||
    'layer' in obj ||
    '$schema' in obj ||
    'vconcat' in obj ||
    'hconcat' in obj ||
    'repeat' in obj ||
    'facet' in obj
  );
}

/** Strip a leading code fence and language tag if present (```json ... ```). */
function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fence ? fence[1] : trimmed;
}

/** Lenient parse of a completed agent response.
 *
 *  The agent's contract is "JSON only," but model output is never perfectly
 *  compliant: it may wrap the envelope in a code fence, prepend a friendly
 *  line of prose, or emit a `{ ui: [...] }` body and leave its narrative as
 *  plain text outside the object. This is the user-facing safety net: any
 *  embedded envelope wins over the surrounding prose, so a stray `{...}`
 *  block can never leak as raw JSON into a chat bubble.
 *
 *  Resolution order:
 *    1. The whole reply IS the envelope (after fence stripping).
 *    2. An envelope is embedded inside prose — use the envelope, with the
 *       prose BEFORE it as the text when the envelope omits its own.
 *    3. No envelope found — return the reply as plain text. */
export function parseAgentResponse(text: string): ParsedAgentResponse {
  const stripped = stripCodeFence(text);

  // Case 1: the whole thing parses cleanly.
  const whole = tryParseAgentJson(stripped);
  if (whole) return whole;

  // Case 2: an envelope is embedded somewhere in the reply.
  const jsonStr = extractFirstJsonObject(stripped);
  if (jsonStr) {
    const embedded = tryParseAgentJson(jsonStr);
    if (embedded) {
      // The envelope wins. If it has no `text` field of its own, salvage any
      // prose the agent wrote BEFORE the envelope and use that as text so the
      // user gets a coherent narrative instead of an empty bubble.
      if (!embedded.content) {
        const at = stripped.indexOf(jsonStr);
        const lead = at > 0 ? stripped.slice(0, at).trim() : '';
        if (lead) embedded.content = lead;
      }
      return embedded;
    }
  }

  // Case 3: no envelope — treat the whole reply as plain text.
  return { content: text };
}

/** While a structured ({ text, ui }) response streams in, show only the
 *  partial `text` value so the user never sees raw JSON in their bubble.
 *  Best-effort extraction of the first "text" string from a possibly-
 *  incomplete JSON object. Handles standard JSON escapes (\n, \", \u00xx).
 *
 *  Three streaming shapes we tolerate:
 *    1. The envelope leads — `{"text":"hello..."` → show "hello...".
 *    2. Prose leads, envelope follows — show the prose until the `{` starts.
 *    3. No envelope at all — show the raw text. */
export function streamingDisplayText(raw: string): string {
  const key = raw.indexOf('"text"');
  if (key === -1) {
    // No `"text"` field yet. If a JSON-structural char (`{` or `[`) has
    // appeared, the envelope is starting — show only the prose BEFORE it so
    // the JSON itself never leaks. If there's no JSON yet, show whatever has
    // streamed (plain prose so far). The leading-`[` case caught a real bug
    // where an array-shaped chunk leaked a stray `[` into the chat bubble.
    const cutoff = [raw.indexOf('{'), raw.indexOf('[')]
      .filter((i) => i >= 0)
      .reduce((a, b) => Math.min(a, b), raw.length);
    return cutoff === raw.length ? raw : raw.slice(0, cutoff).trimEnd();
  }
  let i = key + 6;
  while (i < raw.length && raw[i] !== ':') i++;
  i++;
  while (i < raw.length && raw[i] !== '"') i++;
  i++; // past the opening quote
  const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/' };
  let out = '';
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') {
      const next = raw[i + 1];
      if (next === undefined) break; // escape split across stream chunks
      if (next === 'u') {
        const hex = raw.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '"') break; // closing quote — text field complete
    out += ch;
    i++;
  }
  return out;
}
