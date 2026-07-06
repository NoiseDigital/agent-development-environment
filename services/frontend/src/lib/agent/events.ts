// Helpers that translate ADK event streams into the platform's chat-message
// shape. Pure functions only — the React hook in useChat composes these into
// state updates, but the logic lives here so it's directly testable.

import type { Event as AdkEvent } from './adk-api';
import type { UIBlock } from '../../types/genui';
import { parseAgentResponse } from './response';
import { stripContextPreamble } from '../dashboards/context';
import { isSilentMessage } from './silent';
import { normalizeTimestamp } from '../../utils/timestamps';

/** One tool the agent invoked during a turn — name + arguments only; the SQL
 *  is reconstructed later from the toolbox catalog. */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
  ui?: UIBlock[];
  /** While streaming, before any text: a label for the process step underway. */
  status?: string;
  /** While streaming: the kind of UI block still being produced, if any. */
  uiKind?: 'chart' | 'choices' | 'filters';
  /** Tool calls made while producing this reply (admin "what ran" view). */
  toolCalls?: ToolCall[];
}

/** Data tools whose row shape almost always lands in a chart. When the agent
 *  fires one of these, we commit to "chart on the way" early so ChatMessage
 *  can show the chart skeleton in the bubble's tile slot — covers the
 *  templated-chart fast path where the root agent never calls VegaChartsAgent.
 *  If the agent ultimately responds with text only, the skeleton unmounts
 *  the moment text streams in (it's gated on `blocks.length === 0`). */
const CHART_LIKELY_TOOLS = new Set([
  'performance_trend',
  'publisher_spend_breakdown',
  'campaign_performance_comparison',
  'market_group_breakdown',
  'creative_format_breakdown',
  'kpi_goal_breakdown',
  'top_performing_campaigns',
  'platform_engagement_metrics',
  'conversion_funnel_data',
  'budget_pacing',
  'period_over_period',
  'breakdown_nested',
]);

/** What the agent is doing right now, derived from an event. `working` is the
 *  process label shown by the spinner BEFORE any text streams. `uiKind` means
 *  a chart / choices block is on the way — it drives the more specific label
 *  shown AFTER text has appeared, never before it. */
export function phaseFromEvent(
  event: AdkEvent,
): { working?: string; uiKind?: 'chart' | 'choices' | 'filters' } | null {
  // Subagents stream as distinct ADK authors; the moment one starts emitting,
  // we know what kind of block is on the way before any text appears.
  if (event.author === 'ChoicesAgent') return { uiKind: 'choices' };
  if (event.author === 'VegaChartsAgent') return { uiKind: 'chart' };

  const call = event.content?.parts?.find(p => p.functionCall)?.functionCall as
    | { name?: string }
    | undefined;
  const fnName = call?.name;
  if (fnName) {
    // The root delegates to specialists via AgentTool calls — that's the
    // earliest signal of which envelope shape is coming.
    if (/vegacharts|charts?/i.test(fnName)) return { uiKind: 'chart' };
    if (/choices/i.test(fnName)) return { uiKind: 'choices' };
    if (/filter/i.test(fnName)) return { uiKind: 'filters' };
    // Data tools that almost always end in a chart — commit to chart early
    // so the skeleton appears during the data fetch on the templated path.
    if (CHART_LIKELY_TOOLS.has(fnName)) return { uiKind: 'chart' };
    return { working: 'Querying the data' };
  }
  return null;
}

/** Extract the tool calls an event records (its function_call parts). The SQL
 *  is not here — the agent never sees it; ToolQueries reconstructs it from
 *  the catalog. */
export function extractToolCalls(event: AdkEvent): ToolCall[] {
  return (event.content?.parts ?? [])
    .map(p => p.functionCall)
    .filter((fc): fc is Record<string, unknown> => !!fc)
    .map(fc => ({
      name: typeof fc.name === 'string' ? fc.name : '',
      args: (fc.args && typeof fc.args === 'object' ? fc.args : {}) as Record<string, unknown>,
    }))
    .filter(c => c.name);
}

/** The stream emits each call more than once (partial + complete events) —
 *  keep one entry per distinct name+args so the "N queries" count is accurate. */
export function dedupeToolCalls(calls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  return calls.filter(c => {
    const key = `${c.name}|${JSON.stringify(c.args)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Convert a session's persisted ADK events into the chat message list shown
 *  in the UI. Tool calls precede their reply event, so they're gathered and
 *  attached to the next agent text event in the same turn. Consecutive agent
 *  events for one turn are collapsed to the last (the final reply) so a
 *  multi-stage pipeline doesn't render its drafts. */
export function eventsToMessages(
  events: AdkEvent[],
  supportsVisualization: boolean,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let pendingCalls: ToolCall[] = [];
  // Subagent UI captured per turn, kept until the root agent's text replaces
  // the draft. Recovers the choices / chart block when root paraphrases away
  // the subagent's verbatim envelope.
  let fallbackUi: UIBlock[] | undefined;

  for (const event of events) {
    const calls = extractToolCalls(event);
    if (calls.length) pendingCalls.push(...calls);

    // Tool responses (`functionResponse.response.result`) may contain a
    // subagent's full envelope — ADK's AgentTool wraps it there. Mirror the
    // streaming logic: capture any UI block + text from it.
    if (supportsVisualization) {
      for (const p of event.content?.parts ?? []) {
        const fr = p.functionResponse as { response?: unknown } | undefined;
        const resp = fr?.response;
        if (!resp || typeof resp !== 'object') continue;
        const result = (resp as Record<string, unknown>).result;
        if (typeof result !== 'string') continue;
        const subParsed = parseAgentResponse(result);
        if (subParsed.ui?.length) fallbackUi = subParsed.ui;
      }
    }

    const part = event.content?.parts?.find(part => part.text);
    if (!part?.text) continue;

    if (event.author === 'user') {
      // ADK persists the FULL text including any context preamble we prepended
      // for the agent. Strip it so a reloaded session shows only what the user
      // actually typed; and skip page-sent silent turns (greetings / action
      // notifications) entirely — the agent's reply is shown, not the trigger.
      const text = stripContextPreamble(part.text);
      if (!isSilentMessage(text)) {
        messages.push({
          id: event.id,
          content: text,
          author: 'user',
          timestamp: normalizeTimestamp(event.timestamp),
        });
      }
      pendingCalls = [];
      fallbackUi = undefined;
      continue;
    }

    const parsed = supportsVisualization
      ? parseAgentResponse(part.text)
      : { content: part.text, ui: undefined };
    // Cache UI from any non-root subagent so we can recover it if the root
    // event later replaces this draft without its own ui field.
    if (
      supportsVisualization &&
      event.author !== 'MediaPerformanceAgent' &&
      parsed.ui?.length
    ) {
      fallbackUi = parsed.ui;
    }
    const message: ChatMessage = {
      id: event.id,
      content: parsed.content,
      author: event.author,
      timestamp: normalizeTimestamp(event.timestamp),
      ui: parsed.ui ?? fallbackUi,
      toolCalls: pendingCalls.length ? dedupeToolCalls(pendingCalls) : undefined,
    };
    const prev = messages[messages.length - 1];
    if (prev && prev.author !== 'user') {
      // Replacing the draft with the later output — keep the turn's tool calls
      // AND inherit any captured UI fallback when the new message lacks one.
      messages[messages.length - 1] = {
        ...message,
        ui: message.ui ?? prev.ui,
        toolCalls: message.toolCalls ?? prev.toolCalls,
      };
    } else {
      messages.push(message);
    }
    pendingCalls = [];
  }

  return messages;
}
