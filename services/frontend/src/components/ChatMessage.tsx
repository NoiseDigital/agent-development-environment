'use client';

import { useState, type Ref } from 'react';
import ReactMarkdown from 'react-markdown';
import ChartVisualization from './ChartVisualization';
import { formatMessageTime } from '../utils/timestamps';
import type { ChatMessage as ChatMessageData } from '../hooks/useChat';

// One chat message row — shared by the full chat panel (MessageList) and the
// floating assistant. The two contexts differ only in spacing/sizing, captured
// by the `variant` styling table below.

type Variant = 'panel' | 'floating';

interface ChatMessageProps {
  message: ChatMessageData;
  variant?: Variant;
  /** Verb shown beside the spinner while the agent is thinking; the panel cycles it. */
  loadingLabel?: string;
  /** Render attached visualizations — gated on the agent supporting them. */
  showCharts?: boolean;
  /** Attached to the row element so the panel can scroll a streaming reply into view. */
  rowRef?: Ref<HTMLDivElement>;
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
  chartGap: string;
}> = {
  panel: {
    agentInner: 'max-w-2xl w-full',
    userInner: 'max-w-lg',
    agentBubble: 'px-4 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white',
    userBubble: 'px-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white text-sm leading-relaxed',
    prose: 'prose-p:my-1.5 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-white prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-ul:my-1.5 prose-li:my-0.5 prose-code:text-xs prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded prose-strong:text-white',
    spinner: 'w-4 h-4',
    loadingGap: 'gap-3',
    loadingText: 'text-sm text-zinc-300 font-medium',
    chartGap: 'mt-3 space-y-3',
  },
  floating: {
    agentInner: 'w-full',
    userInner: 'max-w-[85%]',
    agentBubble: 'px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-[13px]',
    userBubble: 'px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-[13px]',
    prose: 'prose-p:my-1 prose-p:leading-relaxed prose-headings:text-white prose-headings:font-semibold prose-strong:text-white prose-ul:my-1 prose-li:my-0.5 prose-code:text-xs prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded',
    spinner: 'w-3.5 h-3.5 rounded-full',
    loadingGap: 'gap-2',
    loadingText: 'text-xs text-zinc-400',
    chartGap: 'mt-2 space-y-2',
  },
};

export default function ChatMessage({
  message,
  variant = 'panel',
  loadingLabel = 'Thinking',
  showCharts = true,
  rowRef,
}: ChatMessageProps) {
  const v = VARIANT[variant];
  const isAgent = message.author !== 'user';
  const isThinking = message.isStreaming && message.content === '';
  const charts = showCharts ? message.charts ?? [] : [];

  return (
    <div
      ref={rowRef}
      className={`flex animate-message-in ${isAgent ? 'justify-start' : 'justify-end'}`}
    >
      <div className={isAgent ? v.agentInner : v.userInner}>
        {isAgent ? (
          <div className="group">
            {isThinking ? (
              <div className={`inline-flex items-center py-1 ${v.loadingGap}`}>
                <span className={`${v.spinner} border-2 border-zinc-700 border-t-zinc-300 animate-spin flex-shrink-0`} />
                <span key={loadingLabel} className={`${v.loadingText} animate-verb`}>
                  {loadingLabel}…
                </span>
              </div>
            ) : (
              <div className={v.agentBubble}>
                <div className={`prose prose-invert prose-sm max-w-none ${v.prose}`}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                  {message.isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-zinc-400 rounded-sm animate-pulse align-middle" />
                  )}
                </div>
              </div>
            )}

            {variant === 'panel' && !message.isStreaming && (
              <MessageFooter timestamp={message.timestamp} />
            )}

            {charts.length > 0 && (
              <div className={v.chartGap}>
                {charts.map((chart, i) => (
                  <ChartVisualization key={`${message.id}-chart-${i}`} chart={chart} saveable />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={v.userBubble}>
            <p className="whitespace-pre-wrap">{message.content}</p>
            {variant === 'panel' && (
              <p className="text-[11px] mt-2 text-zinc-500">{formatMessageTime(message.timestamp)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Timestamp + thumbs row beneath a completed agent reply. Rating is local UI
// state — fades in on hover, stays visible once the user rates.
function MessageFooter({ timestamp }: { timestamp: number }) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const toggle = (value: 'up' | 'down') => setRating((r) => (r === value ? null : value));

  return (
    <div
      className={`flex items-center gap-3 mt-1.5 px-1 transition-opacity duration-150 ${
        rating !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <span className="text-[11px] text-zinc-600">{formatMessageTime(timestamp)}</span>
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={() => toggle('up')}
          title="Good response"
          className={`p-1 rounded transition-colors ${
            rating === 'up' ? 'text-green-400' : 'text-zinc-600 hover:text-zinc-300'
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
            rating === 'down' ? 'text-red-400' : 'text-zinc-600 hover:text-zinc-300'
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
