'use client';

import type { Ref } from 'react';
import ReactMarkdown from 'react-markdown';
import GenUIRenderer from '../genui/GenUIRenderer';
import ChartSkeleton from './ChartSkeleton';
import ToolQueries from './ToolQueries';
import { formatMessageTime } from '../../utils/timestamps';
import { isAdmin } from '../../lib/auth';
import type { ChatMessage as ChatMessageData } from '../../hooks/useChat';
import type { Rating } from '../../lib/agent/feedback-api';

// One chat message row — shared by the full chat panel (MessageList) and the
// floating assistant. The two contexts differ only in spacing/sizing, captured
// by the `variant` styling table below.

type Variant = 'panel' | 'floating';

// Characters that render as NOTHING visible but survive String.trim().
// `Default_Ignorable_Code_Point` is the canonical Unicode property for
// "code points that conforming renderers MUST hide by default" \u2014 it
// covers every invisible variant we've seen leak out of the LLM
// JSON-escape pipeline: zero-width chars (U+200B\u2013U+200F), word joiner
// (U+2060), variation selectors (U+FE00\u2013U+FE0F), bidi marks
// (U+200E/U+200F/U+202A\u2013U+202E), Hangul fillers (U+115F/U+1160/U+3164/
// U+FFA0), Mongolian variation selectors (U+180B\u2013U+180E), soft hyphen
// (U+00AD), BOM (U+FEFF), the mathematical-invisible block
// (U+2061\u2013U+2064), and the deprecated CGJ (U+034F). Combined with \s
// for the standard whitespace cases.
// Requires the `u` flag for \p{}; supported in every browser we target.
const INVISIBLE_RE = /[\s\p{Default_Ignorable_Code_Point}]/gu;

interface ChatMessageProps {
  message: ChatMessageData;
  variant?: Variant;
  /** Verb shown beside the spinner while the agent is thinking; the panel cycles it. */
  loadingLabel?: string;
  /** Render the agent's UI blocks — gated on the agent supporting them. */
  showUi?: boolean;
  /** Attached to the row element so the panel can scroll a streaming reply into view. */
  rowRef?: Ref<HTMLDivElement>;
  /** Current thumb rating for this agent message. */
  rating?: Rating | null;
  /** Set or clear (null) this message's rating. */
  onRate?: (rating: Rating | null) => void;
  /** Send a message back to the agent — used by interactive UI blocks. */
  onAction?: (text: string) => void;
}

const VARIANT: Record<Variant, {
  agentInner: string;
  userInner: string;
  agentBubble: string;
  userBubble: string;
  prose: string;
  spinner: string;
  loadingGap: string;
  loadingText: string;
  uiGap: string;
}> = {
  panel: {
    agentInner: 'max-w-2xl w-full',
    userInner: 'max-w-lg',
    agentBubble: 'px-4 py-3.5 rounded-2xl bg-surface border border-line text-foreground',
    userBubble: 'px-4 py-3 rounded-2xl bg-surface-raised border border-line-strong text-foreground text-sm leading-relaxed',
    prose: 'prose-p:my-1.5 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-foreground prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-ul:my-1.5 prose-li:my-0.5 prose-code:text-xs prose-code:bg-surface-raised prose-code:px-1 prose-code:rounded prose-strong:text-foreground',
    spinner: 'w-4 h-4',
    loadingGap: 'gap-3',
    loadingText: 'text-sm text-muted font-medium',
    uiGap: 'mt-3 space-y-3',
  },
  floating: {
    agentInner: 'w-full',
    userInner: 'max-w-[85%]',
    agentBubble: 'px-3 py-2 rounded-xl bg-surface border border-line text-foreground text-[13px]',
    userBubble: 'px-3 py-2 rounded-xl bg-surface-raised border border-line-strong text-foreground text-[13px]',
    prose: 'prose-p:my-1 prose-p:leading-relaxed prose-headings:text-foreground prose-headings:font-semibold prose-strong:text-foreground prose-ul:my-1 prose-li:my-0.5 prose-code:text-xs prose-code:bg-surface-raised prose-code:px-1 prose-code:rounded',
    spinner: 'w-3.5 h-3.5 rounded-full',
    loadingGap: 'gap-2',
    loadingText: 'text-xs text-subtle',
    uiGap: 'mt-2 space-y-2',
  },
};

export default function ChatMessage({
  message,
  variant = 'panel',
  loadingLabel = 'Thinking',
  showUi = true,
  rowRef,
  rating,
  onRate,
  onAction,
}: ChatMessageProps) {
  const v = VARIANT[variant];
  const isAgent = message.author !== 'user';
  // "Has visible content" — `.trim()` alone isn't enough: zero-width chars
  // (U+200B–U+200F, U+2060), bidi marks, BOM, and narrow no-break space all
  // survive trim() but render as nothing in ReactMarkdown. Without this
  // stricter test, a stray `​` from an LLM JSON-escape pipeline left a
  // ghost bubble + streaming cursor floating between the prose and the chart.
  const hasContent = message.content.replace(INVISIBLE_RE, '') !== '';
  const isThinking = !!message.isStreaming && !hasContent;
  const blocks = showUi ? message.ui ?? [] : [];
  // A non-streaming agent message with no prose AND no UI blocks has nothing
  // to render — skip the bubble entirely instead of drawing an empty box.
  const isAgentEmpty = isAgent && !message.isStreaming && !hasContent && blocks.length === 0;
  // Text has arrived but a chart / choices block is still being produced —
  // only now show the specific "what's being built" label, where it will land.
  const showUiLoader =
    !!message.isStreaming && hasContent && !!message.uiKind && blocks.length === 0;
  if (isAgentEmpty) return null;
  const uiLoaderLabel =
    message.uiKind === 'choices' ? 'Creating selections' : 'Generating visualization';

  return (
    <div
      ref={rowRef}
      className={`flex animate-message-in ${isAgent ? 'justify-start' : 'justify-end'}`}
    >
      <div className={isAgent ? v.agentInner : v.userInner}>
        {isAgent ? (
          <div className="group">
            {isThinking ? (
              <LoadingRow label={message.status || loadingLabel} v={v} />
            ) : hasContent ? (
              <div className={v.agentBubble}>
                <div className={`prose dark:prose-invert prose-sm max-w-none ${v.prose}`}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                  {message.isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-subtle rounded-sm animate-pulse align-middle" />
                  )}
                </div>
              </div>
            ) : null}

            {showUiLoader && (
              <div className={v.uiGap}>
                {message.uiKind === 'chart' ? (
                  // Render a chart-shaped placeholder in the slot the real
                  // chart will land in, so the page doesn't jump when the
                  // spec arrives. Cuts perceived latency on chart turns.
                  <ChartSkeleton variant={variant} />
                ) : (
                  <LoadingRow label={uiLoaderLabel} v={v} />
                )}
              </div>
            )}

            {blocks.length > 0 && (
              <div className={v.uiGap}>
                <GenUIRenderer blocks={blocks} onAction={onAction} messageId={message.id} />
              </div>
            )}

            {/* Admin-only: the SQL behind this turn's MCP-toolbox tool calls. */}
            {isAdmin && !message.isStreaming && message.toolCalls && message.toolCalls.length > 0 && (
              <ToolQueries calls={message.toolCalls} />
            )}

            {/* One feedback footer for the whole reply, at the very bottom — so
                there is no empty gap between the text and its chart. */}
            {!message.isStreaming && (
              <MessageFooter timestamp={message.timestamp} rating={rating} onRate={onRate} />
            )}
          </div>
        ) : (
          <div className={v.userBubble}>
            <p className="whitespace-pre-wrap">{message.content}</p>
            {variant === 'panel' && (
              <p className="text-[11px] mt-2 text-faint">{formatMessageTime(message.timestamp)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Spinner + a shimmering activity label — shown while the agent is thinking,
// and again beneath the text while a chart / choices block is still rendering.
// `label` re-keys the span so a phase change restarts the shimmer cleanly.
function LoadingRow({ label, v }: { label: string; v: (typeof VARIANT)[Variant] }) {
  return (
    <div className={`inline-flex items-center py-1 ${v.loadingGap}`}>
      <span className={`${v.spinner} border-2 border-line-strong border-t-muted animate-spin flex-shrink-0`} />
      <span key={label} className={`${v.loadingText} animate-loading-text`}>
        {label}…
      </span>
    </div>
  );
}

// Timestamp + thumbs row beneath a completed agent reply. The rating is owned
// by useChat (persisted via the feedback API) — fades in on hover, stays
// visible once the message is rated.
function MessageFooter({
  timestamp,
  rating = null,
  onRate,
}: {
  timestamp: number;
  rating?: Rating | null;
  onRate?: (rating: Rating | null) => void;
}) {
  const toggle = (value: Rating) => onRate?.(rating === value ? null : value);

  return (
    <div
      className={`flex items-center gap-3 mt-1.5 px-1 transition-opacity duration-150 ${
        rating !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <span className="text-[11px] text-disabled">{formatMessageTime(timestamp)}</span>
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={() => toggle('up')}
          title="Good response"
          className={`p-1 rounded transition-colors ${
            rating === 'up' ? 'text-positive' : 'text-disabled hover:text-muted'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill={rating === 'up' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => toggle('down')}
          title="Poor response"
          className={`p-1 rounded transition-colors ${
            rating === 'down' ? 'text-danger' : 'text-disabled hover:text-muted'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill={rating === 'down' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
