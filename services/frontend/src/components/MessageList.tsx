'use client';

import { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAgentConfiguration } from '../config/agentConfig';
import ChartVisualization from './ChartVisualization';
import { ChartData } from '../types/chart';

// MessageList component for displaying chat messages

interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
  charts?: ChartData[];
}

interface MessageListProps {
  messages: ChatMessage[];
  selectedApp?: string | null;
  supportsVisualization?: boolean;
}

const THINKING_VERBS = [
  'Thinking', 'Analyzing', 'Reasoning', 'Researching', 'Processing',
  'Synthesizing', 'Exploring', 'Calculating', 'Reviewing', 'Crafting',
  'Connecting the dots', 'Consulting the oracle', 'Digging in',
  'On it', 'Unpacking that', 'Investigating',
];

export default function MessageList({ messages, selectedApp, supportsVisualization = false }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMsgRef = useRef<HTMLDivElement>(null);
  const lastStreamingId = useRef<string | null>(null);
  const prevLengthRef = useRef(messages.length);
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down' | null>>({});
  const [verbIndex, setVerbIndex] = useState(0);

  // Cycle verbs while any message is loading
  const isLoading = messages.some(m => m.isStreaming && m.content === '');
  useEffect(() => {
    if (!isLoading) return;
    setVerbIndex(Math.floor(Math.random() * THINKING_VERBS.length));
    const id = setInterval(() => {
      setVerbIndex(i => (i + 1) % THINKING_VERBS.length);
    }, 1800);
    return () => clearInterval(id);
  }, [isLoading]);

  const rate = (msgId: string, value: 'up' | 'down') => {
    setRatings(prev => ({ ...prev, [msgId]: prev[msgId] === value ? null : value }));
  };

  // When a new streaming message starts, scroll its top into view so the user
  // can read from the beginning as tokens arrive. Don't force-scroll to bottom
  // during streaming — let the user read at their own pace.
  useEffect(() => {
    const streamingMsg = messages.find(m => m.isStreaming);

    if (streamingMsg) {
      if (streamingMsg.id !== lastStreamingId.current) {
        // New streaming message just appeared — scroll to its top
        lastStreamingId.current = streamingMsg.id;
        setTimeout(() => {
          streamingMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
      // While streaming, don't scroll further
    } else {
      lastStreamingId.current = null;
    }
  }, [messages]);

  // Scroll to bottom only when the user sends a message (last message is from user)
  useEffect(() => {
    const added = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (added && messages[messages.length - 1]?.author === 'user') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get agent configuration for display
  const agentConfig = selectedApp ? getAgentConfiguration(selectedApp) : null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5 bg-black">
      {messages.length === 0 ? (
        <div className="flex justify-center items-center h-full">
          <div className="text-center max-w-sm mx-auto">
            <div className="w-14 h-14 mx-auto mb-5 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
              {agentConfig?.icon || (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              )}
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {agentConfig?.displayName || 'Assistant'}
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              {agentConfig?.description || 'Start a conversation by typing a message below.'}
            </p>
          </div>
        </div>
      ) : (
        messages.map((message) => {
          const hasCharts = supportsVisualization && message.charts && message.charts.length > 0;
          const isAgent = message.author !== 'user';
          const rating = ratings[message.id] ?? null;

          return (
          <div
            key={message.id}
            ref={message.isStreaming ? streamingMsgRef : undefined}
            className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}
          >
            <div className={`${isAgent ? 'max-w-2xl w-full' : 'max-w-lg'}`}>
              {isAgent ? (
                <div className="group">
                  {message.isStreaming && message.content === '' ? (
                    /* Loading indicator — no bubble, bare text + square snake spinner */
                    <div className="inline-flex items-center gap-3 py-1">
                      {/* Square snake spinner */}
                      <span className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-300 animate-spin flex-shrink-0" />
                      <span
                        key={verbIndex}
                        className="text-sm text-zinc-300 font-medium animate-verb"
                      >
                        {THINKING_VERBS[verbIndex]}…
                      </span>
                    </div>
                  ) : (
                  <div className="px-4 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white">
                      <div className="prose prose-invert prose-sm max-w-none
                        prose-p:my-1.5 prose-p:leading-relaxed
                        prose-headings:font-semibold prose-headings:text-white
                        prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
                        prose-ul:my-1.5 prose-li:my-0.5
                        prose-code:text-xs prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded
                        prose-strong:text-white">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                        {message.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-zinc-400 rounded-sm animate-pulse align-middle" />
                        )}
                      </div>
                  </div>
                  )}

                  {/* Timestamp + thumbs row — always visible when rated, hover-only otherwise */}
                  {!message.isStreaming && (
                    <div className={`flex items-center gap-3 mt-1.5 px-1 transition-opacity duration-150 ${
                      rating !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      <span className="text-[11px] text-zinc-600">{formatTimestamp(message.timestamp)}</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => rate(message.id, 'up')}
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
                          onClick={() => rate(message.id, 'down')}
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
                  )}

                  {/* Charts */}
                  {hasCharts && (
                    <div className="mt-3 space-y-3">
                      {message.charts!.map((chart, index) => (
                        <ChartVisualization
                          key={`${message.id}-chart-${index}`}
                          type={chart.type}
                          data={chart.data}
                          title={chart.title}
                          insight={chart.insight}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white text-sm leading-relaxed">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className="text-[11px] mt-2 text-zinc-500">{formatTimestamp(message.timestamp)}</p>
                </div>
              )}
            </div>
          </div>
          );
        })
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
