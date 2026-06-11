import { describe, it, expect } from 'vitest';
import {
  extractFirstJsonObject,
  normalizePythonJson,
  parseJsonLoose,
  parseAgentResponse,
  streamingDisplayText,
} from './response';

describe('extractFirstJsonObject', () => {
  it('returns null when no object is present', () => {
    expect(extractFirstJsonObject('just text')).toBeNull();
  });
  it('extracts a balanced object from a prose prefix', () => {
    expect(extractFirstJsonObject('Here is data: {"x": 1}')).toBe('{"x": 1}');
  });
  it('ignores braces inside string literals', () => {
    expect(extractFirstJsonObject('{"text": "} { ok"}')).toBe('{"text": "} { ok"}');
  });
  it('handles nested objects', () => {
    expect(extractFirstJsonObject('{"a": {"b": {"c": 3}}}')).toBe('{"a": {"b": {"c": 3}}}');
  });
});

describe('normalizePythonJson', () => {
  it('rewrites Python literals outside strings', () => {
    expect(normalizePythonJson('[True, False, None]')).toBe('[true, false, null]');
  });
  it('leaves Python literals inside strings untouched', () => {
    expect(normalizePythonJson('{"label": "True north"}')).toBe('{"label": "True north"}');
  });
  it('handles consecutive non-literal words correctly', () => {
    expect(normalizePythonJson('TrueValue')).toBe('TrueValue');
  });
});

describe('parseJsonLoose', () => {
  it('returns null on irrecoverable input', () => {
    expect(parseJsonLoose('not json')).toBeNull();
  });
  it('parses strict JSON', () => {
    expect(parseJsonLoose('{"a": 1}')).toEqual({ a: 1 });
  });
  it('retries with Python literal normalization on a second pass', () => {
    expect(parseJsonLoose('{"a": True, "b": None}')).toEqual({ a: true, b: null });
  });
});

describe('parseAgentResponse', () => {
  it('returns plain text when the response has no JSON envelope', () => {
    expect(parseAgentResponse('Hello')).toEqual({ content: 'Hello' });
  });
  it('parses { text, ui } envelopes', () => {
    const r = parseAgentResponse('{"text":"hi","ui":[{"component":"chart","props":{}}]}');
    expect(r.content).toBe('hi');
    expect(r.ui).toEqual([{ component: 'chart', props: {} }]);
  });
  it('parses an envelope wrapped in prose', () => {
    const r = parseAgentResponse('Some prefix\n{"text":"hi","ui":[]}');
    expect(r.content).toBe('hi');
    expect(r.ui).toEqual([]);
  });
  it('maps the legacy { text, visualization } shape onto chart blocks', () => {
    const r = parseAgentResponse(
      '{"text":"x","visualization":{"mark":"bar","encoding":{}}}',
    );
    expect(r.ui).toEqual([
      { component: 'chart', props: { mark: 'bar', encoding: {} } },
    ]);
  });

  it('strips a code fence around the envelope', () => {
    const r = parseAgentResponse('```json\n{"text":"hi","ui":[]}\n```');
    expect(r.content).toBe('hi');
    expect(r.ui).toEqual([]);
  });

  it('recovers when the agent forgets the text field — uses prose lead as text', () => {
    // Real-world breakage: agent emits friendly prose then a ui-only envelope.
    // The ui block must win; the prose becomes the bubble text.
    const r = parseAgentResponse(
      'Hello! Here are some options: {"ui":[{"component":"choices","props":{"questions":[]}}]}',
    );
    expect(r.content).toBe('Hello! Here are some options:');
    expect(r.ui).toEqual([{ component: 'choices', props: { questions: [] } }]);
  });

  it('recovers a ui-only envelope with no prose lead', () => {
    const r = parseAgentResponse('{"ui":[{"component":"chart","props":{}}]}');
    expect(r.content).toBe('');
    expect(r.ui).toEqual([{ component: 'chart', props: {} }]);
  });

  it('passes a filters block through unchanged (chart + filters multi-block)', () => {
    const envelope = JSON.stringify({
      text: 'Trend rising.',
      ui: [
        { component: 'chart', props: { mark: 'line' } },
        {
          component: 'filters',
          props: {
            title: 'Adjust',
            fields: [
              { kind: 'select', key: 'metric', label: 'Metric', options: ['spend'], value: 'spend' },
              { kind: 'date', key: 'date_from', label: 'From', value: '2024-01-01' },
            ],
          },
        },
      ],
    });
    const r = parseAgentResponse(envelope);
    expect(r.ui).toHaveLength(2);
    expect(r.ui?.[1].component).toBe('filters');
  });

  it('wraps a bare Vega-Lite spec as a chart block when the envelope is missing', () => {
    // Regression: the root agent occasionally paraphrases the VegaChartsAgent
    // and emits the spec by itself, with no { text, ui } wrapper. Rather
    // than render raw JSON in the bubble, we recognise the spec and adopt it.
    const bare = JSON.stringify({
      mark: 'bar',
      encoding: {
        x: { field: 'publisher', type: 'nominal' },
        y: { field: 'total_spend', type: 'quantitative' },
      },
    });
    const r = parseAgentResponse(bare);
    expect(r.ui).toHaveLength(1);
    expect(r.ui?.[0].component).toBe('chart');
  });

  it('recognises a layered Vega-Lite spec ($schema only) as a chart', () => {
    const bare = JSON.stringify({
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      layer: [{ mark: 'line', encoding: {} }],
    });
    const r = parseAgentResponse(bare);
    expect(r.ui?.[0].component).toBe('chart');
  });

  it('scrubs a nested envelope copy the agent embedded in its own text field', () => {
    // Regression: the agent occasionally puts the narrative AND a fenced
    // JSON copy of the whole envelope inside its `text` field, which then
    // renders both the prose AND the raw JSON in the chat bubble.
    const inner = JSON.stringify({
      text: '**Spend trended up** through Q2.',
      ui: [{ component: 'chart', props: { mark: 'line' } }],
    });
    const envelope = JSON.stringify({
      text: `**Spend trended up** through Q2.\n\n\`\`\`json\n${inner}\n\`\`\``,
      ui: [{ component: 'chart', props: { mark: 'line' } }],
    });
    const r = parseAgentResponse(envelope);
    expect(r.content).toBe('**Spend trended up** through Q2.');
    expect(r.content).not.toContain('"ui"');
    expect(r.content).not.toContain('```');
    expect(r.ui?.[0].component).toBe('chart');
  });

  it('keeps non-envelope code blocks (e.g. a SQL snippet) inside the narrative', () => {
    const envelope = JSON.stringify({
      text: 'Here is the SQL I ran:\n\n```sql\nSELECT 1\n```',
      ui: [],
    });
    const r = parseAgentResponse(envelope);
    expect(r.content).toContain('SELECT 1');
  });

  it('scrubs an UNFENCED envelope copy the agent dumped into its own text field', () => {
    // The variant seen on the "make the line green" turn: no markdown fence,
    // just a raw JSON object pasted into the text field. The bubble shows
    // a code-block-shaped wall of JSON when this leaks through.
    const inner =
      '{"text": "Spend trend line is now green.", "ui": [{"component":"chart","props":{"mark":"line"}}]}';
    const envelope = JSON.stringify({
      text: `Sure! ${inner}`,
      ui: [{ component: 'chart', props: { mark: 'line' } }],
    });
    const r = parseAgentResponse(envelope);
    // The raw JSON brace pile is gone; the recovered prose remains.
    expect(r.content).not.toContain('"component"');
    expect(r.content).not.toContain('"ui"');
    expect(r.content).toContain('Spend trend line is now green.');
    expect(r.ui?.[0].component).toBe('chart');
  });

  it('strips a bare JSON data array the agent dumped into its text field', () => {
    // The "Spend over all time" regression: VegaChartsAgent put the chart's
    // row array directly into the `text` field. The bubble rendered a wall
    // of `[{"name":..., "value":...}]` above the chart.
    const dataDump =
      '[{"name":"2023-07-10","value":145892.4555274},{"name":"2023-07-28","value":257363.5636091},{"name":"2023-08-15","value":288553.2416061}]';
    const envelope = JSON.stringify({
      text: dataDump,
      ui: [{ component: 'chart', props: { mark: 'line' } }],
    });
    const r = parseAgentResponse(envelope);
    expect(r.content).not.toContain('"name"');
    expect(r.content).not.toContain('"value"');
    expect(r.ui?.[0].component).toBe('chart');
  });

  it('strips a bare JSON data dump even when surrounded by prose', () => {
    const dataDump =
      '[{"name":"Meta","value":48000},{"name":"YouTube","value":41000},{"name":"Google","value":33000},{"name":"X","value":12000}]';
    const envelope = JSON.stringify({
      text: `Here are the rows I plotted: ${dataDump}. Spend was concentrated in Meta and YouTube.`,
      ui: [{ component: 'chart', props: { mark: 'bar' } }],
    });
    const r = parseAgentResponse(envelope);
    expect(r.content).toContain('Spend was concentrated');
    expect(r.content).not.toContain('"value"');
  });

  it('keeps an inline small JSON example the analyst meant to share', () => {
    // Below the 60-char threshold, so the scrub leaves it alone.
    const envelope = JSON.stringify({
      text: 'The schema is `{"a": 1}` — a single numeric field.',
      ui: [],
    });
    const r = parseAgentResponse(envelope);
    expect(r.content).toContain('{"a": 1}');
  });

  it('recovers from a malformed envelope (trailing comma) by parsing it loosely', () => {
    // Models occasionally emit trailing commas — invalid JSON but a common
    // mistake. `parseJsonLoose` strips them before the second-pass parse.
    const malformed = '{"text":"Spend trend line is now green.","ui":[{"component":"chart","props":{"mark":"line",}},]}';
    const r = parseAgentResponse(malformed);
    expect(r.content).toBe('Spend trend line is now green.');
    expect(r.ui?.[0].component).toBe('chart');
  });

  it('regex-recovers the text when the envelope JSON is too broken to parse', () => {
    // Simulate the modify-chart turn the user reported: an envelope-shaped
    // string the JSON parser rejects (e.g. a smart quote inside the spec).
    // The bubble should at least show the analyst's prose instead of raw JSON.
    const broken = '{\n  "text": "Spend trend line is now green.",\n  "ui": [{ this is not valid JSON at all }]\n}';
    const r = parseAgentResponse(broken);
    expect(r.content).toContain('Spend trend line is now green');
    // UI isn't recoverable here — accepted degradation, the alternative is
    // dumping raw JSON into the chat which is far worse.
  });

  // ── PROSE + TRAILING ENVELOPE DUMP — the screenshot regression ──────
  // These reproduce the exact failure shown in the chat screenshot:
  // the agent emits real prose first, then a *literal copy* of an
  // envelope-shaped JSON block AFTER the prose. The dump itself may be
  // malformed (truncated, missing quotes, missing closing braces). The
  // bubble must show ONLY the prose — no `{`, `"text":`, `"ui":` leakage.

  it('strips a trailing envelope dump that follows prose', () => {
    const dump = '{\n  "text": "Both spend and impressions...",\n  "ui": [{"component":"chart","props":{"mark":"line"}}]\n}';
    const raw = `Both spend and impressions show a pronounced seasonal trend, growing from $791K to $941K.\n\n${dump}`;
    const r = parseAgentResponse(raw);
    expect(r.content).toContain('Both spend and impressions show');
    expect(r.content).not.toContain('"text"');
    expect(r.content).not.toContain('"ui"');
    expect(r.content).not.toContain('"component"');
  });

  it('strips a TRUNCATED envelope dump that follows prose (screenshot variant)', () => {
    // Exact pattern from the user's screenshot: prose followed by a JSON
    // block whose inner `text` field is cut off with no closing quote
    // and no closing braces. extractFirstJsonObject can't recover it.
    const truncated = '{\n  "text": "Both spend and impressions show a pronounced seasonal trend, consistently peaking to\n  "ui": [\n    {\n      "component": "chart",\n      "props": {\n        "title": "Spend and Impressions Over Time",';
    const raw = `Both spend and impressions show a pronounced seasonal trend, growing from a peak of $791K in late 2023 to $941K in late 2024.\n\n${truncated}`;
    const r = parseAgentResponse(raw);
    expect(r.content).toContain('Both spend and impressions show');
    expect(r.content).toContain('$941K');
    expect(r.content).not.toContain('"text"');
    expect(r.content).not.toContain('"ui"');
    expect(r.content).not.toContain('"component"');
    expect(r.content).not.toContain('"props"');
  });

  it('strips an envelope dump even with no leading prose (no real envelope wrapper)', () => {
    // No prose lead AND no outer envelope — just a malformed envelope-
    // shaped string. Should fall back to streamingDisplayText to at least
    // surface the inner text field, not a wall of JSON.
    const raw = '{\n  "text": "Spend grew steadily across 2024.",\n  "ui": [{ malformed }]\n}';
    const r = parseAgentResponse(raw);
    expect(r.content).toContain('Spend grew steadily');
    expect(r.content).not.toContain('"ui"');
  });

  it('tolerates inline `~~~` fences around a self-envelope dump', () => {
    const inner = '{"text":"x","ui":[{"component":"chart","props":{}}]}';
    const envelope = JSON.stringify({
      text: `done!\n~~~${inner}~~~`,
      ui: [{ component: 'chart', props: { mark: 'bar' } }],
    });
    const r = parseAgentResponse(envelope);
    expect(r.content).not.toContain('~~~');
    expect(r.content).not.toContain('"ui"');
  });
});

describe('streamingDisplayText', () => {
  it('returns "" before the text field has streamed in (envelope-first)', () => {
    expect(streamingDisplayText('{"ui":[')).toBe('');
  });
  it('returns partial text while the field is still streaming', () => {
    expect(streamingDisplayText('{"text":"Hello, wo')).toBe('Hello, wo');
  });
  it('decodes standard escapes', () => {
    expect(streamingDisplayText('{"text":"line\\none"}')).toBe('line\none');
  });
  it('stops at the closing quote', () => {
    expect(streamingDisplayText('{"text":"done","ui":[]}')).toBe('done');
  });
  it('tolerates an escape split across stream chunks', () => {
    // The trailing backslash is the first char of an escape sequence whose
    // second character hasn't arrived yet — we must NOT consume past the buffer.
    expect(streamingDisplayText('{"text":"ok\\')).toBe('ok');
  });
  it('shows prose-before-the-brace when the agent leads with prose then emits a ui-only envelope', () => {
    // Without this guard, `{"ui":[...]}` would stream as raw JSON into the
    // bubble — the exact failure mode the user reported.
    expect(streamingDisplayText('Hello! Here are options: {"ui":[')).toBe(
      'Hello! Here are options:',
    );
  });
  it('passes plain prose through when no envelope has appeared yet', () => {
    expect(streamingDisplayText('Hello, working')).toBe('Hello, working');
  });
  it('never leaks a stray `[` from an array-shaped chunk', () => {
    // Regression: an early chunk could be `[\n  {...}` (a tool-result echo);
    // the streaming display was returning `[` for a frame, which the user
    // saw as a stray bracket in the chat bubble.
    expect(streamingDisplayText('[\n  {"name":"2024-01-01"')).toBe('');
    expect(streamingDisplayText('intro [partial')).toBe('intro');
  });

  // ── SSE CHUNK BOUNDARY CASES — envelope split across deltas ───────────
  // The agent's reply arrives as a sequence of `accumulated` snapshots
  // (each delta appended). Every intermediate snapshot must extract a
  // sane display string — no raw JSON, no half-escapes, no stray braces.

  it('progresses cleanly through every prefix of a streamed envelope', () => {
    // Simulate the SSE building up the envelope char-by-char. At NO point
    // along the way should the bubble show raw JSON braces.
    const full = '{"text":"Spend grew steadily through 2024.","ui":[{"component":"chart","props":{"mark":"line"}}]}';
    const seen: string[] = [];
    for (let i = 1; i <= full.length; i++) {
      seen.push(streamingDisplayText(full.slice(0, i)));
    }
    // No prefix should leak a `{` or `}` into the displayed text.
    for (const frame of seen) {
      expect(frame, `frame leaked structural char: ${JSON.stringify(frame)}`)
        .not.toMatch(/[{}]/);
    }
    // The final frame must equal the completed text field.
    expect(seen[seen.length - 1]).toBe('Spend grew steadily through 2024.');
  });

  it('handles an envelope whose text field arrives split mid-escape sequence', () => {
    // An SSE chunk boundary in the middle of a `\n` escape used to consume
    // past the buffer. We must NOT emit a trailing `\` or eat the next char.
    expect(streamingDisplayText('{"text":"line one\\')).toBe('line one');
    expect(streamingDisplayText('{"text":"line one\\n')).toBe('line one\n');
    expect(streamingDisplayText('{"text":"line one\\nline two')).toBe('line one\nline two');
  });

  it('handles a unicode escape arriving across chunk boundaries', () => {
    // `\u00xx` requires 4 hex digits — if the chunk arrives with only 2,
    // we must wait, not crash and not emit garbage.
    expect(streamingDisplayText('{"text":"em\\u20')).toBe('em');
    expect(streamingDisplayText('{"text":"em\\u2014 dash')).toBe('em— dash');
  });

  it('survives a chunked self-envelope-dump scenario without leaking JSON mid-stream', () => {
    // The agent emits prose then accidentally begins dumping its own
    // envelope. Every intermediate frame should show ONLY the prose lead;
    // the start of the dump must never leak as raw braces.
    const full = 'Spend grew steadily.\n\n{"text":"Spend grew steadily.","ui":[]}';
    for (let i = 1; i <= full.length; i++) {
      const frame = streamingDisplayText(full.slice(0, i));
      // Plain string check — avoids the /s regex flag (es2018+).
      expect(frame, `frame leaked JSON open-brace: ${JSON.stringify(frame)}`)
        .not.toContain('{');
    }
  });
});
