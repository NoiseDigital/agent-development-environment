import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSseChunk } from './adk-api';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('parseSseChunk', () => {
  it('parses a single complete event line', () => {
    const { events, buffer } = parseSseChunk('', 'data: {"author":"agent","id":"e1"}\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ author: 'agent', id: 'e1' });
    expect(buffer).toBe('');
  });

  it('parses multiple events in one chunk', () => {
    const chunk =
      'data: {"id":"a"}\n' +
      'data: {"id":"b"}\n' +
      'data: {"id":"c"}\n';
    const { events, buffer } = parseSseChunk('', chunk);
    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(buffer).toBe('');
  });

  it('carries the partial trailing line into the next call', () => {
    // The event JSON is split across two chunks — first chunk ends mid-line.
    const first = parseSseChunk('', 'data: {"id":"e1","text"');
    expect(first.events).toEqual([]);
    expect(first.buffer).toBe('data: {"id":"e1","text"');
    const second = parseSseChunk(first.buffer, ':"hello"}\n');
    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ id: 'e1', text: 'hello' });
    expect(second.buffer).toBe('');
  });

  it('ignores the [DONE] sentinel', () => {
    const { events } = parseSseChunk('', 'data: [DONE]\n');
    expect(events).toEqual([]);
  });

  it('ignores blank data: lines (heartbeats)', () => {
    const { events } = parseSseChunk('', 'data: \n');
    expect(events).toEqual([]);
  });

  it('ignores non-data lines (event: / id: / retry: SSE fields)', () => {
    const chunk = 'event: ping\nid: 42\nretry: 1000\ndata: {"id":"e1"}\n';
    const { events } = parseSseChunk('', chunk);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'e1' });
  });

  it('skips malformed JSON lines but keeps draining the chunk', () => {
    // A bad line in the middle must NOT lose the events around it.
    const chunk =
      'data: {"id":"a"}\n' +
      'data: {oops not json\n' +
      'data: {"id":"c"}\n';
    const { events } = parseSseChunk('', chunk);
    expect(events.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('logs a warning on malformed JSON (no silent catch)', () => {
    const warn = vi.spyOn(console, 'warn');
    parseSseChunk('', 'data: {bad json\n');
    expect(warn).toHaveBeenCalled();
  });

  it('handles a chunk that ends exactly on a newline (no trailing buffer)', () => {
    const { buffer } = parseSseChunk('', 'data: {"id":"a"}\n');
    expect(buffer).toBe('');
  });

  it('handles a chunk with no newline at all (everything is buffer)', () => {
    const { events, buffer } = parseSseChunk('', 'data: {"id":"a"}');
    expect(events).toEqual([]);
    // The whole chunk is the unterminated tail — waiting for the rest.
    expect(buffer).toBe('data: {"id":"a"}');
  });
});
