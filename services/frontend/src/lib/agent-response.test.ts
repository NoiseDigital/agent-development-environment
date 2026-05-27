import { describe, it, expect } from 'vitest';
import {
  extractFirstJsonObject,
  normalizePythonJson,
  parseJsonLoose,
  parseAgentResponse,
  streamingDisplayText,
} from './agent-response';

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
});
