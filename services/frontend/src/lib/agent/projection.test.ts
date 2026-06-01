import { describe, it, expect } from 'vitest';
import { deriveMessages, type InFlightStream } from './projection';
import type { Session, Event as AdkEvent } from './adk-api';

// Minimal builders — same approach as agent-events.test.ts so the
// streaming → completed → refetch handoff can be exercised without
// committing to a full ADK schema version.
function ev(partial: Partial<AdkEvent>): AdkEvent {
  return {
    id: 'e',
    author: 'agent',
    timestamp: 1700000000,
    content: undefined,
    ...partial,
  } as AdkEvent;
}
function userEv(id: string, text: string, timestamp = 1700000000): AdkEvent {
  return ev({ id, author: 'user', timestamp, content: { parts: [{ text }] } } as Partial<AdkEvent>);
}
function agentEv(id: string, text: string, author = 'MediaPerformanceAgent', timestamp = 1700000010): AdkEvent {
  return ev({ id, author, timestamp, content: { parts: [{ text }] } } as Partial<AdkEvent>);
}
function session(id: string, events: AdkEvent[]): Session {
  return { id, events } as Session;
}
function baseStream(overrides: Partial<InFlightStream> = {}): InFlightStream {
  return {
    userMessageId: 'u-synth',
    userContent: 'hello',
    streamingId: 's-synth',
    accumulated: '',
    agentAuthor: 'MediaPerformanceAgent',
    working: '',
    toolCalls: [],
    startedAt: 1700000005,
    ...overrides,
  };
}

describe('deriveMessages', () => {
  it('returns [] when there is no session and no stream', () => {
    expect(deriveMessages(null, undefined, true)).toEqual([]);
  });

  it('returns just the committed events when there is no in-flight stream', () => {
    const s = session('S1', [userEv('u1', 'hi'), agentEv('a1', '{"text":"hello","ui":[]}')]);
    const out = deriveMessages(s, undefined, true);
    expect(out).toHaveLength(2);
    expect(out[0].author).toBe('user');
    expect(out[1].content).toBe('hello');
  });

  // ── Streaming branch ───────────────────────────────────────────────────
  // The user's bubble + the agent's spinner come from the in-flight stream
  // until SSE finishes. Re-projecting here is what makes "navigate away mid-
  // stream and come back" not lose the reply.

  it('renders user bubble + streaming agent bubble while SSE is in flight', () => {
    const stream = baseStream({ accumulated: '{"text":"part', uiKind: 'chart' });
    const out = deriveMessages(null, stream, true);
    expect(out).toHaveLength(2);
    expect(out[0].author).toBe('user');
    expect(out[0].content).toBe('hello');
    expect(out[1].isStreaming).toBe(true);
    // streamingDisplayText surfaces the partial `text` field, never raw JSON.
    expect(out[1].content).toBe('part');
    expect(out[1].uiKind).toBe('chart');
  });

  it('does not double-render the user bubble when the server has already echoed it', () => {
    // ADK persists the user message at the START of the SSE — when the
    // session refetch lands, the committed events already include it.
    const echoed = userEv('u-server', 'hello', 1700000005);
    const s = session('S1', [echoed]);
    const stream = baseStream({ userMessageId: 'u-synth' });
    const out = deriveMessages(s, stream, true);
    const userBubbles = out.filter((m) => m.author === 'user');
    expect(userBubbles).toHaveLength(1);
    // The server-assigned id wins (it's the persisted truth).
    expect(userBubbles[0].id).toBe('u-server');
  });

  it('passes raw accumulated text through when supportsVisualization=false', () => {
    // Non-visualization agents don't speak the {text, ui} envelope, so the
    // streamingDisplayText extractor would strip useful content (it expects
    // a JSON shape). Bypass it for plain-text agents.
    const stream = baseStream({ accumulated: '{"raw":"json that is the actual reply"}' });
    const out = deriveMessages(null, stream, false);
    expect(out[1].content).toBe(stream.accumulated);
  });

  // ── Completed-snapshot branch ─────────────────────────────────────────
  // After turnComplete the parsed reply lives on `stream.completed` so the
  // bubble survives both the post-SSE refetch race AND a refetch that
  // arrives BEFORE ADK has persisted the new event.

  it('renders the completed snapshot when SSE has ended but session refetch has not committed the event', () => {
    const stream = baseStream({
      completed: {
        content: '**Spend trended up** through Q2.',
        ui: [{ component: 'chart', props: { mark: 'line' } }],
        toolCalls: [{ name: 'performance_trend', args: {} }],
        eventId: 'srv-1',
      },
    });
    const s = session('S1', []); // refetch raced persistence — empty
    const out = deriveMessages(s, stream, true);
    expect(out).toHaveLength(2);
    const reply = out[out.length - 1];
    expect(reply.content).toContain('Spend trended up');
    expect(reply.ui?.[0].component).toBe('chart');
    expect(reply.toolCalls?.[0].name).toBe('performance_trend');
    // The snapshot's eventId is used so a follow-up refetch can dedupe it.
    expect(reply.id).toBe('srv-1');
  });

  it('dedupes the completed snapshot once the session refetch has committed the matching event', () => {
    // The committed event id matches `stream.completed.eventId` — the
    // committed render is canonical, the snapshot must be suppressed.
    const committedEnvelope = JSON.stringify({
      text: '**Spend trended up** through Q2.',
      ui: [{ component: 'chart', props: { mark: 'line' } }],
    });
    const s = session('S1', [
      userEv('u-server', 'plot weekly spend'),
      agentEv('srv-1', committedEnvelope),
    ]);
    const stream = baseStream({
      completed: {
        content: '**Spend trended up** through Q2.',
        ui: [{ component: 'chart', props: { mark: 'line' } }],
        toolCalls: [],
        eventId: 'srv-1',
      },
    });
    const out = deriveMessages(s, stream, true);
    // Exactly ONE agent reply — the committed one, not a snapshot duplicate.
    const replies = out.filter((m) => m.author === 'MediaPerformanceAgent');
    expect(replies).toHaveLength(1);
    expect(replies[0].id).toBe('srv-1');
    expect(replies[0].ui?.[0].component).toBe('chart');
  });

  it('still renders the snapshot when its eventId is null (server never returned one)', () => {
    // Defensive: a partial / errored refetch may leave eventId null. The
    // snapshot still has to render so the user sees the reply.
    const stream = baseStream({
      completed: {
        content: 'reply',
        ui: undefined,
        toolCalls: undefined,
        eventId: null,
      },
    });
    const out = deriveMessages(null, stream, true);
    const reply = out[out.length - 1];
    expect(reply.content).toBe('reply');
    expect(reply.id).toBe('s-synth'); // falls back to streamingId
  });

  // ── Failed branch ─────────────────────────────────────────────────────
  // When the SSE throws, render a final non-streaming bubble so the user
  // sees what happened instead of a perpetual spinner.

  it('renders the failed message as a final non-streaming bubble', () => {
    const stream = baseStream({ failed: 'Network error — try again.' });
    const out = deriveMessages(null, stream, true);
    const reply = out[out.length - 1];
    expect(reply.content).toBe('Network error — try again.');
    expect(reply.isStreaming).toBeFalsy();
  });

  // ── Navigate-away-and-back ────────────────────────────────────────────
  // The whole reason inFlightStreams is keyed by sessionId: switching
  // sessions mid-stream shouldn't lose the streaming bubble. Re-projecting
  // against the SAME stream object after a session round-trip should yield
  // a stable message list.

  it('re-projects an identical message list on a second call with the same stream + session', () => {
    const stream = baseStream({ accumulated: '{"text":"partial answer' });
    const s = session('S1', [userEv('u-server', 'hello', 1700000005)]);
    const first = deriveMessages(s, stream, true);
    const second = deriveMessages(s, stream, true);
    // Structural equality — the projection is pure, no hidden state should
    // make a re-render produce different ids / contents.
    expect(second).toEqual(first);
  });
});
