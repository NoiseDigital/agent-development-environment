// Pure projection from server-persisted session events + the live in-flight
// stream into the visible message list. Extracted from useChat so the
// streaming → completed-snapshot → refetch handoff is unit-testable.

import type { Session } from './adk-api';
import type { UIBlock } from '../../types/genui';
import { eventsToMessages, type ChatMessage, type ToolCall } from './events';
import { streamingDisplayText } from './response';
import { isSilentMessage } from './silent';

/** Snapshot of the agent's final reply once the SSE has ended. Lives on
 *  the in-flight stream so the bubble is guaranteed to show even if the
 *  post-SSE session refetch is slow, races persistence, or fails. */
export interface CompletedReply {
  content: string;
  ui?: UIBlock[];
  toolCalls?: ToolCall[];
  /** Real ADK event id once available; used to dedupe against the session's
   *  committed events when the refetch eventually picks them up. */
  eventId: string | null;
}

/** State for a stream the agent is still producing. Tracked per-session so
 *  switching sessions mid-stream doesn't lose the in-flight reply — the
 *  streaming bubble re-projects the moment the user navigates back. */
export interface InFlightStream {
  /** Synthetic id for the user's bubble (replaced by the ADK event id once
   *  the server's `getSession` refetch picks it up). */
  userMessageId: string;
  userContent: string;
  /** The placeholder id used for the agent's streaming bubble. */
  streamingId: string;
  /** Accumulated text the agent has emitted so far (raw — runs through
   *  `streamingDisplayText` before display). */
  accumulated: string;
  agentAuthor: string;
  /** Process-step label shown by the spinner before any text arrives. */
  working: string;
  /** Hint that a chart / choices block is on the way — drives the more
   *  specific label shown after text begins streaming. */
  uiKind?: 'chart' | 'choices' | 'filters';
  /** Tool calls the agent made — surfaced under the reply for admins. */
  toolCalls: ToolCall[];
  /** Recovered subagent UI in case the root paraphrases away its block. */
  fallbackUi?: UIBlock[];
  startedAt: number;
  /** Snapshot of the parsed final reply once SSE finishes. Set BEFORE we
   *  attempt the post-stream refetch so the bubble is never lost to a
   *  race between turnComplete and ADK's event persistence. */
  completed?: CompletedReply;
  /** When the SSE throws, mark `failed` so the projection renders the
   *  bubble as a non-streaming final message instead of a perpetual spinner. */
  failed?: string;
}

/** Derive the visible message list for the active session: committed events
 *  from the server, plus the in-flight stream (if any) re-projected as
 *  user + agent bubbles. Pure — drives `messages` in useChat's useEffect. */
export function deriveMessages(
  session: Session | null,
  stream: InFlightStream | undefined,
  supportsVisualization: boolean,
): ChatMessage[] {
  const committed = session
    ? eventsToMessages(session.events, supportsVisualization)
    : [];
  if (!stream) return committed;

  // Don't double-render the user's bubble: if the server already echoed it
  // back as a persisted event (it lands at SSE start), the user message is
  // in `committed`. Match on id OR on (content + recent timestamp) since the
  // server-assigned id differs from our synthetic one.
  const userAlreadyIn = committed.some(
    (m) =>
      m.id === stream.userMessageId ||
      (m.author === 'user' &&
        m.content === stream.userContent &&
        m.timestamp >= stream.startedAt - 5_000),
  );

  const out = [...committed];
  // Silent turns (page-sent greetings / action notifications) drive an agent
  // reply but never render a user bubble — live or persisted.
  if (!userAlreadyIn && !isSilentMessage(stream.userContent)) {
    out.push({
      id: stream.userMessageId,
      content: stream.userContent,
      author: 'user',
      timestamp: stream.startedAt,
    });
  }
  if (stream.failed) {
    out.push({
      id: stream.streamingId,
      content: stream.failed,
      author: stream.agentAuthor,
      timestamp: stream.startedAt,
    });
  } else if (stream.completed) {
    // The SSE has ended successfully — render the parsed reply. Skip if the
    // committed events already include the matching event (the session
    // refetch picked it up). Match by event id when we have one, but ALSO
    // fall back to (author + content + recent timestamp) — ADK sometimes
    // re-stamps the event id on persistence, and without the content match
    // the snapshot renders alongside the committed event as a duplicate.
    const eid = stream.completed.eventId;
    const c = stream.completed.content;
    const alreadyCommitted = committed.some((m) =>
      (!!eid && m.id === eid) ||
      (m.author === stream.agentAuthor &&
        m.content === c &&
        Math.abs(m.timestamp - stream.startedAt) <= 30_000),
    );
    if (!alreadyCommitted) {
      out.push({
        id: eid ?? stream.streamingId,
        content: stream.completed.content,
        author: stream.agentAuthor,
        timestamp: stream.startedAt,
        ui: stream.completed.ui,
        toolCalls: stream.completed.toolCalls,
      });
    }
  } else {
    const display = supportsVisualization
      ? streamingDisplayText(stream.accumulated)
      : stream.accumulated;
    out.push({
      id: stream.streamingId,
      content: display,
      author: stream.agentAuthor,
      timestamp: stream.startedAt,
      isStreaming: true,
      status: stream.working || undefined,
      uiKind: stream.uiKind,
    });
  }
  return out;
}
