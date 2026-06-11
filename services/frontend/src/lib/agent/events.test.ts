import { describe, it, expect } from 'vitest';
import {
  phaseFromEvent,
  extractToolCalls,
  dedupeToolCalls,
  eventsToMessages,
} from './events';
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
  it('commits to chart early on chart-likely data tools (templated path)', () => {
    // Templated chart path: root agent doesn't call VegaChartsAgent, it calls
    // a data tool then emits the envelope itself. We commit to "chart on the
    // way" the moment the data tool fires so the skeleton mounts during the
    // fetch instead of leaving the tile slot blank.
    for (const fn of ['performance_trend', 'publisher_spend_breakdown', 'breakdown_nested']) {
      const e = ev({
        content: { parts: [{ functionCall: { name: fn } }] },
      } as Partial<AdkEvent>);
      expect(phaseFromEvent(e)).toEqual({ uiKind: 'chart' });
    }
  });
  it('falls back to generic "querying" for scalar / metadata tools', () => {
    // metric_totals, describe_source, available_date_range etc. usually
    // resolve to a text-only answer, not a chart. Stay generic so we don't
    // mount a chart skeleton that would never have a chart land in it.
    for (const fn of ['metric_totals', 'describe_source', 'available_date_range', 'qa_report']) {
      const e = ev({
        content: { parts: [{ functionCall: { name: fn } }] },
      } as Partial<AdkEvent>);
      expect(phaseFromEvent(e)).toEqual({ working: 'Querying the data' });
    }
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

  // ── SESSION REFETCH / NAVIGATE-AWAY-AND-BACK ROUND-TRIPS ─────────────
  // These pin the "I came back to a chat and the chart was gone" class of
  // bugs. The contract: a turn that was persisted by ADK as
  //   [functionCall event] → [functionResponse event] → [agent text event]
  // must re-project into the same chat message (text + UI blocks) on every
  // subsequent render. Loss of UI on refetch was the user-visible failure.

  it('round-trips a templated_chart envelope through eventsToMessages', () => {
    // The templated fast path: the ROOT agent (MediaPerformanceAgent) is the
    // author of the envelope event — there's no subagent to hold a fallback
    // UI for us. If the root's text parses but the UI is dropped, the chart
    // disappears on refetch.
    const envelope = JSON.stringify({
      text: '**Weekly spend climbed through Q2**, peaking in June at $58K.',
      ui: [
        {
          component: 'templated_chart',
          props: {
            shape: 'weekly_trend',
            title: 'Weekly spend, 2024',
            rows: [{ name: '2024-01-07', value: 42300 }],
            valueFormat: '$',
          },
        },
        {
          component: 'suggestions',
          props: { title: 'Want to look at…', items: ['Break down by publisher'] },
        },
      ],
    });
    const toolCallEv = ev({
      id: 'fc1',
      author: 'MediaPerformanceAgent',
      content: { parts: [{ functionCall: { name: 'performance_trend', args: {} } }] },
    } as Partial<AdkEvent>);
    const toolRespEv = ev({
      id: 'fr1',
      author: 'MediaPerformanceAgent',
      content: { parts: [{ functionResponse: { name: 'performance_trend', response: { result: '[]' } } }] },
    } as Partial<AdkEvent>);
    const finalEv = agentEv('a1', envelope, 'MediaPerformanceAgent');

    const out = eventsToMessages(
      [userEv('u1', 'plot weekly spend in 2024'), toolCallEv, toolRespEv, finalEv],
      true,
    );

    const reply = out.find((m) => m.author === 'MediaPerformanceAgent');
    expect(reply).toBeDefined();
    expect(reply?.content).toContain('Weekly spend');
    expect(reply?.ui).toHaveLength(2);
    expect(reply?.ui?.[0].component).toBe('templated_chart');
    expect(reply?.ui?.[1].component).toBe('suggestions');
    // Tool calls should also be attached so the "queries that ran" admin
    // view stays accurate after a refetch.
    expect(reply?.toolCalls?.[0]?.name).toBe('performance_trend');
  });

  it('captures fallbackUi from a subagent functionResponse with a {text,ui} result', () => {
    // The functionResponse path: when AgentTool wraps a subagent's reply,
    // it ends up in part.functionResponse.response.result as a JSON string.
    // We pre-parse that to harvest UI in case the root paraphrases the
    // visible text and drops the block. Pin the capture so a regression in
    // the fallback path is loud.
    const subResult = JSON.stringify({
      text: 'subagent prose',
      ui: [{ component: 'chart', props: { mark: 'bar' } }],
    });
    const toolRespEv = ev({
      id: 'fr1',
      author: 'MediaPerformanceAgent',
      content: {
        parts: [{
          functionResponse: { name: 'VegaChartsAgent', response: { result: subResult } },
        }],
      },
    } as Partial<AdkEvent>);
    const rootEv = agentEv('a1', 'Concise paraphrase of the subagent result.', 'MediaPerformanceAgent');
    const out = eventsToMessages([userEv('u1', 'plot it'), toolRespEv, rootEv], true);
    const reply = out[out.length - 1];
    expect(reply.content).toContain('Concise paraphrase');
    // UI must be recovered from the functionResponse, not from the root.
    expect(reply.ui?.[0].component).toBe('chart');
  });

  it('skips events with no text + no recoverable parts (functionCall-only)', () => {
    // A functionCall event carries no user-visible text — it must not
    // produce its own message, only contribute to the next reply's
    // toolCalls list. Regression: a stray empty bubble would appear.
    const fcOnly = ev({
      id: 'fc-empty',
      content: { parts: [{ functionCall: { name: 'performance_trend', args: {} } }] },
    } as Partial<AdkEvent>);
    const out = eventsToMessages([userEv('u1', 'q'), fcOnly, agentEv('a1', 'answer')], false);
    expect(out).toHaveLength(2);
    expect(out[1].content).toBe('answer');
  });

  it('survives an event with empty content (no parts) without throwing', () => {
    // Defensive: ADK may persist a heartbeat-style event with no parts.
    const empty = ev({ id: 'empty', content: { parts: [] } } as Partial<AdkEvent>);
    expect(() =>
      eventsToMessages([userEv('u1', 'q'), empty, agentEv('a1', 'answer')], true),
    ).not.toThrow();
  });

  it('picks up the text part even when a functionCall is in the SAME event', () => {
    // ADK occasionally batches a tool call + text in one event (different
    // parts). Our `parts.find(p => p.text)` must grab the text without
    // being confused by the functionCall part.
    const mixed = ev({
      id: 'mix',
      author: 'MediaPerformanceAgent',
      content: {
        parts: [
          { functionCall: { name: 'performance_trend', args: {} } },
          { text: '{"text":"answer","ui":[{"component":"chart","props":{}}]}' },
        ],
      },
    } as Partial<AdkEvent>);
    const out = eventsToMessages([userEv('u1', 'q'), mixed], true);
    const reply = out[out.length - 1];
    expect(reply.content).toBe('answer');
    expect(reply.ui?.[0].component).toBe('chart');
    expect(reply.toolCalls?.[0]?.name).toBe('performance_trend');
  });

  it('still recovers UI from a subagent event when the root paraphrased it away', () => {
    // VegaChartsAgent fallback path: the SUBAGENT emits the chart envelope,
    // then the root agent emits a TEXT-ONLY paraphrase that replaces the
    // draft. Without fallbackUi, the chart drops on refetch. The cache
    // in eventsToMessages exists for this case — pin it with a test.
    const subEnv = JSON.stringify({
      text: 'Here is the chart.',
      ui: [{ component: 'chart', props: { mark: 'bar' } }],
    });
    const subEv = agentEv('a1', subEnv, 'VegaChartsAgent');
    // Root's paraphrase: prose only, no envelope, no UI.
    const rootEv = agentEv('a2', 'Spend was concentrated in Meta and YouTube.', 'MediaPerformanceAgent');
    const out = eventsToMessages([userEv('u1', 'spend by publisher'), subEv, rootEv], true);
    const reply = out[out.length - 1];
    expect(reply.author).toBe('MediaPerformanceAgent');
    expect(reply.content).toContain('Spend was concentrated');
    expect(reply.ui?.[0].component).toBe('chart');
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
