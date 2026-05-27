import { describe, it, expect } from 'vitest';
import {
  phaseFromEvent,
  extractToolCalls,
  dedupeToolCalls,
  eventsToMessages,
} from './agent-events';
import type { Event as AdkEvent } from './adk-api';

// Minimal event builder — keeps each test self-contained without committing
// to a particular ADK schema-version's required fields.
function ev(partial: Partial<AdkEvent>): AdkEvent {
  return {
    id: 'e',
    author: 'agent',
    timestamp: 1700000000,
    content: undefined,
    ...partial,
  } as AdkEvent;
}

describe('phaseFromEvent', () => {
  it('flags choices when the ChoicesAgent emits', () => {
    expect(phaseFromEvent(ev({ author: 'ChoicesAgent' }))).toEqual({ uiKind: 'choices' });
  });
  it('flags chart when the VegaChartsAgent emits', () => {
    expect(phaseFromEvent(ev({ author: 'VegaChartsAgent' }))).toEqual({ uiKind: 'chart' });
  });
  it('flags chart when the root agent calls VegaChartsAgent', () => {
    const e = ev({
      content: { parts: [{ functionCall: { name: 'VegaChartsAgent' } }] },
    } as Partial<AdkEvent>);
    expect(phaseFromEvent(e)).toEqual({ uiKind: 'chart' });
  });
  it('shows generic "querying" label for a data tool call', () => {
    // A data tool call hasn't committed to chart vs. text-only yet — that
    // decision happens AFTER the rows come back. Stay generic until then.
    const e = ev({
      content: { parts: [{ functionCall: { name: 'performance_trend' } }] },
    } as Partial<AdkEvent>);
    expect(phaseFromEvent(e)).toEqual({ working: 'Querying the data' });
  });
  it('returns null when there is nothing actionable in the event', () => {
    expect(phaseFromEvent(ev({}))).toBeNull();
  });
});

describe('extractToolCalls + dedupeToolCalls', () => {
  it('pulls tool name + args out of an event', () => {
    const e = ev({
      content: {
        parts: [{ functionCall: { name: 'performance_trend', args: { metric: 'spend' } } }],
      },
    } as Partial<AdkEvent>);
    expect(extractToolCalls(e)).toEqual([{ name: 'performance_trend', args: { metric: 'spend' } }]);
  });
  it('drops calls with no name', () => {
    const e = ev({
      content: { parts: [{ functionCall: { args: {} } }] },
    } as Partial<AdkEvent>);
    expect(extractToolCalls(e)).toEqual([]);
  });
  it('dedupes by name + args', () => {
    const calls = [
      { name: 'a', args: { x: 1 } },
      { name: 'a', args: { x: 1 } },
      { name: 'a', args: { x: 2 } },
    ];
    expect(dedupeToolCalls(calls)).toEqual([
      { name: 'a', args: { x: 1 } },
      { name: 'a', args: { x: 2 } },
    ]);
  });
});

describe('eventsToMessages', () => {
  const userEv = (id: string, text: string): AdkEvent =>
    ev({ id, author: 'user', content: { parts: [{ text }] } } as Partial<AdkEvent>);
  const agentEv = (id: string, text: string, author = 'agent'): AdkEvent =>
    ev({ id, author, content: { parts: [{ text }] } } as Partial<AdkEvent>);

  it('round-trips user + agent text', () => {
    const out = eventsToMessages([userEv('u1', 'hello'), agentEv('a1', 'hi back')], false);
    expect(out.map(m => ({ author: m.author, content: m.content }))).toEqual([
      { author: 'user', content: 'hello' },
      { author: 'agent', content: 'hi back' },
    ]);
  });

  it('collapses consecutive agent events to the last reply', () => {
    const out = eventsToMessages(
      [
        userEv('u1', 'ping'),
        agentEv('a1', '{"text":"draft"}', 'Worker'),
        agentEv('a2', '{"text":"final"}', 'ResponseFormatter'),
      ],
      true,
    );
    expect(out).toHaveLength(2);
    expect(out[1].content).toBe('final');
    expect(out[1].id).toBe('a2');
  });

  it('attaches preceding tool calls to the next agent reply', () => {
    const toolEv = ev({
      id: 't1',
      content: {
        parts: [{ functionCall: { name: 'performance_trend', args: {} } }],
      },
    } as Partial<AdkEvent>);
    const out = eventsToMessages([userEv('u1', 'q'), toolEv, agentEv('a1', 'answer')], false);
    const reply = out.find(m => m.author === 'agent');
    expect(reply?.toolCalls).toEqual([{ name: 'performance_trend', args: {} }]);
  });

  it('parses the JSON envelope when supportsVisualization is true', () => {
    const out = eventsToMessages(
      [userEv('u1', 'q'), agentEv('a1', '{"text":"hi","ui":[{"component":"chart","props":{}}]}')],
      true,
    );
    expect(out[1].content).toBe('hi');
    expect(out[1].ui).toEqual([{ component: 'chart', props: {} }]);
  });

  it('leaves text as-is when supportsVisualization is false', () => {
    const out = eventsToMessages(
      [userEv('u1', 'q'), agentEv('a1', '{"text":"hi"}')],
      false,
    );
    expect(out[1].content).toBe('{"text":"hi"}');
    expect(out[1].ui).toBeUndefined();
  });

  it('strips the dashboard-context preamble from a reloaded user message', () => {
    // ADK persists the full text the agent saw, including the prefix we
    // prepended. On reload we must render only what the user actually typed.
    const fullText =
      '[Dashboard context: id=NOI, tab=overall, name=NOI Performance, mode=view]\n' +
      'Active tab: Overall\n' +
      'Tiles on this tab:\n- KPI: Spend\n\n' +
      'What was our top publisher?';
    const out = eventsToMessages([userEv('u1', fullText)], false);
    expect(out[0].content).toBe('What was our top publisher?');
  });
});
