'use client';

// Shared embedded chat panel for module-scoped assistants (AutoCorr, Market
// Radar, and any future module). Always visible (no FAB), wired to a specialised
// one-shot-context agent that reads the page's current state from a preamble the
// page builds. Every send prepends that preamble, so the agent always sees the
// freshest result.
//
// This is the single source of truth for the panel — modules supply only a
// small `AssistantPanelConfig` (agent id + copy). Any tenant that enables a
// module with an embedded assistant inherits every behaviour here (silent
// greeting, per-source re-greet, narrate-on-run, history, collapse) for free.

import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { useChatAutoScroll } from '../../hooks/useChatAutoScroll';
import ChatMessage from '../chat/ChatMessage';
import SessionHistoryMenu, { toMs, type SessionRow } from '../chat/SessionHistoryMenu';
import { AGENT_SILENT_PREFIX } from '../../lib/agent/silent';
import CollapsiblePanel from '../ui/CollapsiblePanel';
import { useSidebarCollapsed } from '../../contexts/SidebarContext';

/** Per-module copy + wiring. Everything the shared panel needs to specialise. */
export interface AssistantPanelConfig {
  /** ADK agent id, e.g. 'autocorr_assistant_agent'. */
  agent: string;
  /** Header title, e.g. 'AutoCorr Assistant'. */
  title: string;
  /** Header subtitle once a source is picked, e.g. 'Guiding your analysis'. */
  readySubtitle: string;
  /** Sent (silently) once a source is first selected — kicks off guided setup. */
  greetTrigger: string;
  /** Sent (silently) on mount / new-chat before any source is picked. */
  introTrigger: string;
  /** Sent (silently) after a manual Run so the agent narrates — no leading prefix. */
  narratePrompt: string;
  /** Textarea placeholder. */
  placeholder: string;
  /** Empty state before a source is selected. */
  emptyNotReady: { heading: string; body: string };
  /** Empty state once a source is selected (suggestion chips + a grounding hint). */
  emptyReady: { hint: string; suggestions: string[] };
}

interface PanelProps {
  config: AssistantPanelConfig;
  /** The current analysis preamble — empty string means "no source selected". */
  contextPrefix: string;
  /** Stable id of the selected source; a change re-greets for the new dataset. */
  sourceKey: string;
  /** Bumped by the page on a manual Run — the assistant narrates the result. */
  runSignal?: number;
}

const Sparkle = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z"
    />
  </svg>
);

export default function AssistantPanel({ config, contextPrefix, sourceKey, runSignal }: PanelProps) {
  const { agent } = config;
  const [input, setInput] = useState('');
  const {
    messages, isLoading, error, feedback, rateMessage, sendMessage,
    createNewSession, sessions, sessionNames, selectSession,
  } = useChat(agent);

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);
  const histBtn = useRef<HTMLButtonElement>(null);
  const initRef = useRef(false);
  const greetedKey = useRef<string | null>(null);
  const narratedRun = useRef(0);
  const [histOpen, setHistOpen] = useState(false);
  const [histPos, setHistPos] = useState<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useSidebarCollapsed('assistant');

  // Create one session per panel mount + open with a greeting so the assistant
  // feels alive immediately (no cold "empty" panel). Await the fresh session
  // before greeting — sending synchronously races ahead of session creation and
  // the intro message never lands.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    createNewSession(agent).then(() => sendMessage(AGENT_SILENT_PREFIX + config.introTrigger, ''));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = contextPrefix.length > 0;

  // Auto-greet once per data source: when a source's context first becomes
  // available, kick off the guided setup. Re-greets if the user switches source.
  useEffect(() => {
    if (!ready || !sourceKey || greetedKey.current === sourceKey) return;
    greetedKey.current = sourceKey;
    sendMessage(AGENT_SILENT_PREFIX + config.greetTrigger, contextPrefix);
  }, [ready, sourceKey, contextPrefix]); // eslint-disable-line react-hooks/exhaustive-deps

  // Narrate the result after a manual Run (silent prompt → visible reply).
  useEffect(() => {
    if (!runSignal || narratedRun.current === runSignal || !contextPrefix) return;
    narratedRun.current = runSignal;
    sendMessage(AGENT_SILENT_PREFIX + config.narratePrompt, contextPrefix);
  }, [runSignal, contextPrefix]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleNewChat = () => {
    setHistOpen(false);
    createNewSession(agent).then(() => sendMessage(AGENT_SILENT_PREFIX + config.introTrigger, ''));
  };

  const toggleHistory = () => {
    if (histOpen) {
      setHistOpen(false);
      return;
    }
    const r = histBtn.current?.getBoundingClientRect();
    if (r) setHistPos({ x: r.right, y: r.bottom + 4 });
    setHistOpen(true);
  };

  const historyRows: SessionRow[] = sessions
    .map((s) => ({ id: s.id, name: sessionNames[s.id] ?? 'Untitled chat', ts: toMs(s.lastUpdateTime) }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 10);

  return (
    <CollapsiblePanel
      collapsed={collapsed}
      resize={{ initial: 380, min: 320, max: 520 }}
      side="left"
      className="bg-surface-sunken border-transparent"
      rail={
        <>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="Expand assistant"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg text-accent-500" title={config.title}>
            <Sparkle className="h-4 w-4" />
          </div>
        </>
      }
    >
      {/* Header — no avatar; title + new-chat / history actions (Claude-Code style) */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line/45 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{config.title}</p>
          <p className="text-[11px] text-faint">
            {ready ? config.readySubtitle : 'Pick a data source to start'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewChat}
          title="New chat"
          className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          ref={histBtn}
          type="button"
          onClick={toggleHistory}
          title="Chat history"
          className={`rounded-md p-1.5 transition-colors hover:bg-surface-raised hover:text-foreground ${histOpen ? 'text-foreground' : 'text-faint'}`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 2M3 12a9 9 0 1018 0 9 9 0 00-18 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse assistant"
          className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <SessionHistoryMenu
        open={histOpen}
        anchor={histPos}
        title="Recent chats"
        rows={historyRows}
        onSelect={(id) => {
          selectSession(id);
          setHistOpen(false);
        }}
        onClose={() => setHistOpen(false)}
      />

      {/* Transcript */}
      <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <EmptyState config={config} ready={ready} onAsk={askSuggestion} />
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
            placeholder={config.placeholder}
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
    </CollapsiblePanel>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  config,
  ready,
  onAsk,
}: {
  config: AssistantPanelConfig;
  ready: boolean;
  onAsk: (q: string) => void;
}) {
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
        <p className="text-sm font-semibold text-foreground">{config.emptyNotReady.heading}</p>
        <p className="mt-1 text-xs leading-relaxed text-faint">{config.emptyNotReady.body}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col px-2 py-3">
      <p className="px-1 text-xs font-medium text-muted">Try asking</p>
      <p className="px-1 text-[11px] text-faint">{config.emptyReady.hint}</p>
      <div className="mt-3 space-y-1.5">
        {config.emptyReady.suggestions.map((s) => (
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
