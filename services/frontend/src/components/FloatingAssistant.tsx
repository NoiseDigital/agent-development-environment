'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useChat } from '../hooks/useChat';
import ChatMessage from './ChatMessage';

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
  const { messages, isLoading, error, feedback, rateMessage, sendMessage, createNewSession } = useChat(AGENT_ID);
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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
          messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              variant="floating"
              rating={feedback[m.id] ?? null}
              onRate={(rating) => rateMessage(m.id, rating)}
              onAction={(text) => sendMessage(text)}
            />
          ))
        )}
        {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800/60 p-3 shrink-0">
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
