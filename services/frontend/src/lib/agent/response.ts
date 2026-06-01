// Parsers for the agent's GenUI `{ text, ui }` envelope.
//
// The agent's persona is "return JSON only", but model output is never
// perfectly compliant: it may wrap the envelope in a code fence, prepend a
// line of prose, drop a closing brace at the end of a stream, or sprinkle in
// Python literals (True / None) when paraphrasing tool output. These helpers
// recover the envelope leniently so the UI never sees raw JSON in a bubble.

import type { UIBlock, VegaSpec } from '../../types/genui';

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

/** Strip trailing commas before `}` or `]` — a common LLM JSON mistake.
 *  Conservative: only acts outside string literals. */
function stripTrailingCommas(s: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { out += ch; escape = false; continue; }
    if (inString) {
      out += ch;
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { out += ch; inString = true; continue; }
    if (ch === ',') {
      // Look ahead past whitespace for the next non-space char.
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === '}' || s[j] === ']') continue; // drop the comma
    }
    out += ch;
  }
  return out;
}

/** JSON.parse, retried with progressively looser cleanups for common LLM
 *  mistakes: Python literals (True/False/None) and trailing commas. */
export function parseJsonLoose(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    /* malformed — retry leniently below */
  }
  try {
    return JSON.parse(normalizePythonJson(s));
  } catch {
    /* still malformed — try one more cleanup */
  }
  try {
    return JSON.parse(stripTrailingCommas(normalizePythonJson(s)));
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
  // Tolerant of variations the model actually emits: ```json``` or ```...```,
  // with or without an interior newline, with `~~~` instead of backticks,
  // and trailing whitespace after the closing fence.
  const fence = /^(?:```|~~~)\s*[A-Za-z0-9_-]*\s*\n?([\s\S]*?)\n?\s*(?:```|~~~)\s*$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

/** The agent occasionally self-documents — its `text` field includes the
 *  narrative AND a markdown-fenced JSON envelope copy of itself ("look, here
 *  is the envelope I returned!"). ReactMarkdown then renders both the
 *  narrative + the raw JSON code block, which is exactly the leak the
 *  user reports. Strip any embedded code-fenced envelope from the text so
 *  the bubble shows only the analyst's prose. */
function scrubNestedEnvelope(content: string): string {
  if (!content) return content;
  // Match ```json ... ``` (or bare ``` ... ```) where the body contains a
  // top-level `"text"` key — the giveaway that this is the envelope itself,
  // not just any code block the analyst meant to share.
  // 1) Fenced — tolerant of inline fences and `~~~` fences.
  const fenceRe = /(?:```|~~~)\s*[A-Za-z0-9_-]*\s*\n?([\s\S]*?)\n?\s*(?:```|~~~)/gi;
  let out = content.replace(fenceRe, (match, body: string) => {
    // Keep code blocks that AREN'T self-envelope dumps (e.g. a SQL snippet
    // the analyst chose to share).
    return /"text"\s*:/i.test(body) && /"ui"\s*:/i.test(body) ? '' : match;
  });

  // 2) Unfenced envelope — the model pasted the envelope as raw JSON into
  //    its own text field. Detect by shape (has `text` AND `ui` keys),
  //    carve it out, and replace it with the real `text` field so the
  //    bubble still gets the analyst's prose if there is any.
  if (/\{[\s\S]*?"text"\s*:[\s\S]*?"ui"\s*:/.test(out)) {
    const objStr = extractFirstJsonObject(out);
    if (objStr) {
      const parsed = parseJsonLoose(objStr) as { text?: unknown } | null;
      const realText =
        parsed && typeof parsed.text === 'string' ? parsed.text : '';
      out = out.replace(objStr, realText);
    }
  }

  // 3) Bare data dump — the model pasted the chart's row array (or a single
  //    record-shaped object) directly into the text field. No envelope keys,
  //    just `[{...}, {...}, ...]`. The analyst never has a reason to put a
  //    JSON array in their prose — strip any chunk that looks like one and
  //    parses cleanly. Conservative: only strip well-formed arrays/objects
  //    that don't contain markdown structure.
  out = stripBareJsonDumps(out);

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Find and drop any standalone JSON array or object dump from the text.
 *  Conservative on what counts as a "dump":
 *    - Must parse as JSON.
 *    - Must be at least 60 chars (skips tiny inline snippets).
 *    - Must look data-shaped (an array of objects, or an object with
 *      data-key-ish field names like `name`/`value`/`label`/`series`).
 *  Keeps small inline JSON (e.g. a one-line `{"a": 1}` the analyst chose
 *  to share as an example) intact. */
function stripBareJsonDumps(text: string): string {
  let out = text;
  // Walk the text looking for `[` or `{` at the start of a logical chunk.
  // We use the existing depth-aware extractor to find balanced spans.
  let cursor = 0;
  while (cursor < out.length) {
    const arrAt = out.indexOf('[', cursor);
    const objAt = out.indexOf('{', cursor);
    const candidates = [arrAt, objAt].filter((i) => i >= 0);
    if (candidates.length === 0) break;
    const start = Math.min(...candidates);
    const span = out[start] === '['
      ? extractFirstJsonArray(out.slice(start))
      : extractFirstJsonObject(out.slice(start));
    if (!span) {
      cursor = start + 1;
      continue;
    }
    if (span.length < 60) {
      cursor = start + span.length;
      continue;
    }
    const parsed = parseJsonLoose(span);
    if (!isLikelyDataDump(parsed)) {
      cursor = start + span.length;
      continue;
    }
    // Strip the dump (plus any leading punctuation like ": ") from `out`,
    // then restart the scan because indices shifted.
    out = out.slice(0, start) + out.slice(start + span.length);
    cursor = start;
  }
  return out;
}

/** Same depth-aware extractor as `extractFirstJsonObject`, for arrays. */
function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf('[');
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
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Heuristic: is the parsed JSON shaped like a data dump the analyst
 *  shouldn't have included? Look for an array of objects, or an object
 *  whose keys read like data fields (name, value, label, series, etc.). */
function isLikelyDataDump(parsed: unknown): boolean {
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return false;
    return parsed.every((it) => it && typeof it === 'object' && !Array.isArray(it));
  }
  if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed as object);
    if (keys.length === 0) return false;
    const DATA_KEYS = new Set(['name', 'value', 'label', 'series', 'rows', 'data', 'values']);
    return keys.some((k) => DATA_KEYS.has(k.toLowerCase()));
  }
  return false;
}

/** Find the byte offset of the first `{` that opens an envelope-shaped
 *  block — i.e., one whose forward span contains both `"text"` and `"ui"`
 *  keys before any closing brace at the same depth. Lenient: matches even
 *  when the envelope is malformed or truncated (no closing braces), which
 *  is exactly the case `extractFirstJsonObject` can't recover. */
function findEnvelopeStart(text: string): number {
  const m = /\{[\s\S]*?"text"\s*:[\s\S]*?"ui"\s*:/.exec(text);
  return m ? m.index : -1;
}

/** Threshold below which a prose lead before an embedded envelope is
 *  treated as accidental noise (e.g. `Sure! {"text":"<answer>",...}`).
 *  Above the threshold, the lead is treated as the agent's REAL message
 *  and the envelope's `text` field is presumed to be a self-dump leak.
 *  80 chars chosen by inspection: a real one-paragraph analyst response
 *  is always longer; preamble like "Sure!" / "Here's the data:" is shorter. */
const PROSE_LEAD_THRESHOLD = 80;

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
 *    2. An envelope is embedded inside prose — use the envelope, but if the
 *       prose BEFORE it is substantial (>= PROSE_LEAD_THRESHOLD chars),
 *       treat the envelope's `text` as a self-dump leak and keep the prose.
 *    3. The reply LOOKS envelope-shaped but can't be parsed (malformed /
 *       truncated). Salvage any prose lead; otherwise recover the inner
 *       `text` value via `streamingDisplayText`.
 *    4. No envelope shape at all — return the reply as plain text. */
export function parseAgentResponse(text: string): ParsedAgentResponse {
  const stripped = stripCodeFence(text);

  // Case 1: the whole thing parses cleanly.
  const whole = tryParseAgentJson(stripped);
  if (whole) {
    whole.content = scrubNestedEnvelope(whole.content);
    return whole;
  }

  // Case 2: an envelope is embedded somewhere in the reply.
  const jsonStr = extractFirstJsonObject(stripped);
  if (jsonStr) {
    const embedded = tryParseAgentJson(jsonStr);
    if (embedded) {
      const at = stripped.indexOf(jsonStr);
      const lead = at > 0 ? stripped.slice(0, at).trim() : '';
      // Two flavours of "prose lead":
      //  • short ("Sure! " / "Here you go: ") → keep the envelope text;
      //    the lead is just a friendly preamble.
      //  • substantial (full paragraph) → the lead IS the agent's message
      //    and the embedded envelope is an accidental self-dump (often
      //    a truncated copy). Use the lead, keep the envelope's UI blocks.
      if (lead && (!embedded.content || lead.length >= PROSE_LEAD_THRESHOLD)) {
        embedded.content = lead;
      }
      embedded.content = scrubNestedEnvelope(embedded.content);
      return embedded;
    }
    // Found a `{...}` substring but couldn't parse it. If it LOOKS like an
    // envelope (has the `text` and `ui` keys), fall through to Case 3.
    // Log so the regression is visible instead of just looking like a
    // stale bubble.
    if (/"text"\s*:/.test(jsonStr) && /"ui"\s*:/.test(jsonStr)) {
      console.warn(
        '[parseAgentResponse] envelope-shaped JSON failed to parse; using regex recovery',
        { sample: jsonStr.slice(0, 240) },
      );
    }
  }

  // Case 3: parse-clean extraction failed but the reply still LOOKS
  // envelope-shaped. Find the first envelope-shaped opener (which may be
  // truncated / malformed) and:
  //   • if there's any prose BEFORE it, use that as the bubble content;
  //   • otherwise recover the inner `text` value via `streamingDisplayText`
  //     so the user at least sees a clean prose answer instead of raw JSON.
  // We can't recover the UI block here (the spec was malformed), so the
  // chart drops — but a clean text bubble degrades far better than raw JSON.
  const envIdx = findEnvelopeStart(stripped);
  if (envIdx !== -1) {
    const lead = stripped.slice(0, envIdx).trim();
    if (lead) return { content: lead };
    const recovered = streamingDisplayText(stripped.slice(envIdx)).trim();
    if (recovered) return { content: recovered };
  }

  // True fallback — treat the whole reply as plain text.
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
