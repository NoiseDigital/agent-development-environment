'use client';

// Pinned chat panel that lives on the right side of /autocorr. Different
// from the FloatingAssistant: this one is ALWAYS visible (no FAB toggle)
// and is wired to a specialised agent — `autocorr_assistant_agent` — that
// reads the current correlation result as a context preamble.
//
// The page passes in `contextPrefix` — a multi-line "[AutoCorr context]"
// preamble built by `lib/agent/autocorr-context.ts`. Every send prepends it, so
// the agent always has the freshest result in view even after the user
// re-runs the analysis.

import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { useChatAutoScroll } from '../../hooks/useChatAutoScroll';
import ChatMessage from '../chat/ChatMessage';

const ASSISTANT_AGENT = 'autocorr_assistant_agent';

// Sent automatically the first time a data source is selected, so the assistant
// opens with a guided greeting instead of waiting. The [AutoCorr context]
// preamble (columns + qa) rides along hidden, so this is all the user sees.
const GREET_TRIGGER = "I just selected a data source — what should I analyze, and how?";

// Sent once on mount so the panel opens with a warm welcome instead of a cold
// empty state — even before a data source is picked.
const INTRO_TRIGGER =
  "No data source is selected yet. Greet me in 1-2 short sentences as the AutoCorr " +
  "assistant, say in plain terms what this tool does, and ask me to pick a data " +
  "source on the left to begin. Do not invent any data or column names.";

interface PanelProps {
  /** The current analysis preamble — empty string means "no source selected". */
  contextPrefix: string;
  /** Stable id of the selected source; a change re-greets for the new dataset. */
  sourceKey: string;
}

export default function AutocorrAssistantPanel({ contextPrefix, sourceKey }: PanelProps) {
  const [input, setInput] = useState('');
  const { messages, isLoading, error, feedback, rateMessage, sendMessage, createNewSession } =
    useChat(ASSISTANT_AGENT);

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const greetedKey = useRef<string | null>(null);

  // Create one session per panel mount + open with a greeting so the assistant
  // feels alive immediately (no cold "empty" panel).
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    createNewSession(ASSISTANT_AGENT);
    sendMessage(INTRO_TRIGGER, '');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = contextPrefix.length > 0;

  // Auto-greet once per data source: when a source's context first becomes
  // available, kick off the guided setup. Re-greets if the user switches source.
  useEffect(() => {
    if (!ready || !sourceKey || greetedKey.current === sourceKey) return;
    greetedKey.current = sourceKey;
    sendMessage(GREET_TRIGGER, contextPrefix);
  }, [ready, sourceKey, contextPrefix]); // eslint-disable-line react-hooks/exhaustive-deps

  useChatAutoScroll({ containerRef, endRef: messagesEndRef, lastMsgRef, messages });

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage(text, contextPrefix);
  };

  const askSuggestion = (text: string) => {
    if (isLoading) return;
    setInput('');
    sendMessage(text, contextPrefix);
  };

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-line/45 bg-surface-sunken">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line/45 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
              d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
              d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7 .7-2z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">AutoCorr Assistant</p>
          <p className="text-[11px] text-faint">
            {ready ? 'Guiding your analysis' : 'Pick a data source to start'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => createNewSession(ASSISTANT_AGENT)}
          title="New chat"
          className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Transcript */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <EmptyState ready={ready} onAsk={askSuggestion} />
        ) : (
          messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              variant="floating"
              showUi={false}
              rowRef={i === messages.length - 1 ? lastMsgRef : undefined}
              rating={feedback[m.id] ?? null}
              onRate={(rating) => rateMessage(m.id, rating)}
              onAction={(text) => sendMessage(text, contextPrefix)}
            />
          ))
        )}
        {error && <p className="px-1 text-[11px] text-danger">{error}</p>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-line/45 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface px-3 py-2 focus-within:border-line-strong">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about your data or this analysis…"
            rows={2}
            className="flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder-disabled outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-inverse text-inverse-foreground transition-colors hover:bg-inverse/90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ ready, onAsk }: { ready: boolean; onAsk: (q: string) => void }) {
  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-accent-500">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
              d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
              d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7 .7-2z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-foreground">Pick a data source</p>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          Choose a source on the left and I&apos;ll greet you, suggest which columns are drivers vs KPIs, and walk you through running the analysis.
        </p>
      </div>
    );
  }
  const suggestions = [
    'Which signals are worth focusing on?',
    'Why is the strongest correlation strong?',
    'What should I try next — different method, lag, or preprocessing?',
    'Are any of these correlations just leakage?',
  ];
  return (
    <div className="flex h-full flex-col px-2 py-3">
      <p className="px-1 text-xs font-medium text-muted">Try asking</p>
      <p className="px-1 text-[11px] text-faint">
        I&apos;m grounded in your current heatmap + top signals.
      </p>
      <div className="mt-3 space-y-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onAsk(s)}
            className="w-full rounded-lg border border-line bg-surface/50 px-3 py-2 text-left text-[12px] text-muted transition-colors hover:border-line-strong hover:bg-surface hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
