'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useChat } from '../hooks/useChat';
import ChartVisualization from './ChartVisualization';
import SaveToDashboardButton from './SaveToDashboardButton';

// Defacto Plan & Dashboard assistant. For now every request is routed to the
// Media Analyst agent; a dedicated plan/dashboard agent can replace this later.
const AGENT_ID = 'media_performance_agent';

export default function FloatingAssistant() {
  const pathname = usePathname();
  const onSupportedPage = pathname.startsWith('/plan') || pathname.startsWith('/dashboards');

  // Mounting only on supported routes keeps the chat session alive while moving
  // between Plan and Dashboards, and avoids backend calls on other pages.
  if (!onSupportedPage) return null;
  return <AssistantWidget />;
}

function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, isLoading, error, sendMessage, createNewSession } = useChat(AGENT_ID);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  // Create a session once so the first message can send without a round-trip wait.
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      createNewSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage(text);
  };

  // ── Collapsed: floating action button ──────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-full bg-white text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:bg-zinc-100 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-sm font-semibold">Ask Analyst</span>
      </button>
    );
  }

  // ── Expanded: chat panel ───────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-3rem)] rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_16px_50px_rgba(0,0,0,0.6)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white leading-tight">Media Analyst</p>
          <p className="text-[11px] text-zinc-500 leading-tight">Plan &amp; dashboard assistant</p>
        </div>
        <button
          type="button"
          onClick={() => createNewSession()}
          title="New chat"
          className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Minimize"
          className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-white">How can I help?</p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Ask me to analyze media performance, explain a dashboard, or build a new visualization.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isAgent = m.author !== 'user';
            return (
              <div key={m.id} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                <div className={isAgent ? 'w-full' : 'max-w-[85%]'}>
                  {isAgent ? (
                    <div>
                      {m.isStreaming && m.content === '' ? (
                        <div className="inline-flex items-center gap-2 py-1">
                          <span className="w-3.5 h-3.5 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
                          <span className="text-xs text-zinc-400">Thinking…</span>
                        </div>
                      ) : (
                        <div className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-[13px]">
                          <div className="prose prose-invert prose-sm max-w-none
                            prose-p:my-1 prose-p:leading-relaxed
                            prose-headings:text-white prose-headings:font-semibold
                            prose-strong:text-white
                            prose-ul:my-1 prose-li:my-0.5
                            prose-code:text-xs prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                            {m.isStreaming && (
                              <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-zinc-400 rounded-sm animate-pulse align-middle" />
                            )}
                          </div>
                        </div>
                      )}
                      {m.charts && m.charts.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {m.charts.map((chart, i) => (
                            <ChartVisualization
                              key={`${m.id}-chart-${i}`}
                              chart={chart}
                              headerAction={<SaveToDashboardButton chart={chart} />}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-[13px] whitespace-pre-wrap">
                      {m.content}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-3 shrink-0">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 focus-within:border-zinc-600 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about plans or dashboards…"
            rows={2}
            className="flex-1 resize-none bg-transparent text-[13px] text-white placeholder-zinc-600 outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-white text-black hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
