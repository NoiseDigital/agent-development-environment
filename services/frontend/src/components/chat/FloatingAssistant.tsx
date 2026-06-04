'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useChat } from '../../hooks/useChat';
import { useChatAutoScroll } from '../../hooks/useChatAutoScroll';
import { useDashboardEdit, useAddVizIntent } from '../../lib/dashboards/edit-context';
import { buildDashboardContext } from '../../lib/dashboards/context';
import ChatMessage from './ChatMessage';

// Two agents power the floating assistant, picked by context:
//   - dashboard_editor_agent → in dashboard edit mode; can pin charts,
//     recolour the banner, rename. Delegates analysis to media-performance.
//   - media_performance_agent → otherwise; the analyst.
const ANALYST_AGENT = 'media_performance_agent';
const EDITOR_AGENT = 'dashboard_editor_agent';

export default function FloatingAssistant() {
  const pathname = usePathname();
  const onSupportedPage = pathname.startsWith('/dashboards');

  // Mounting only on supported routes keeps the chat session alive while moving
  // between Plan and Dashboards, and avoids backend calls on other pages.
  if (!onSupportedPage) return null;
  return <AssistantWidget />;
}

function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const editCtx = useDashboardEdit();
  // Picking the agent at the hook level means switching modes spawns a
  // fresh session — the previous mode's history doesn't leak. useChat
  // watches `agentId` for changes and clears state; we then create a fresh
  // session below.
  const agentId = editCtx?.canGenerate ? EDITOR_AGENT : ANALYST_AGENT;
  const { messages, isLoading, error, feedback, rateMessage, sendMessage, createNewSession } = useChat(agentId);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);
  const lastInitializedAgent = useRef<string | null>(null);
  const addVizIntent = useAddVizIntent();
  // Suggestion chips shown above the input while an intent is pending. Cleared
  // the moment the user sends ANY message so the chips don't linger across turns.
  const [pendingSuggestions, setPendingSuggestions] = useState<string[]>([]);

  // Create a session for the active agent so the first message can send
  // without a round-trip wait. Re-runs when the agent changes (edit-mode
  // toggle) so the new agent gets its own session — without this, requests
  // would target a session that lives under the OTHER agent and 404 on
  // `/run_sse`. The `agentId` is passed explicitly because the underlying
  // useChat state may not have committed the swap yet in the same render.
  useEffect(() => {
    if (lastInitializedAgent.current === agentId) return;
    lastInitializedAgent.current = agentId;
    createNewSession(agentId);
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The first time the user enters dashboard edit mode in a session, auto-pop
  // the chat open so the "save to dashboard" workflow is discoverable. We
  // remember that we've done it so the user can close it back down without it
  // re-opening on every render.
  const autoOpenedForEdit = useRef(false);
  useEffect(() => {
    if (editCtx?.canGenerate && !autoOpenedForEdit.current) {
      autoOpenedForEdit.current = true;
      setOpen(true);
    }
    if (!editCtx?.canGenerate) {
      // Reset when leaving edit mode so re-entering re-arms the auto-open.
      autoOpenedForEdit.current = false;
    }
  }, [editCtx?.canGenerate]);

  // All chat scroll behaviour — session-load jump, scroll-on-send, top-of-
  // new-reply, sticky-stream — comes from the shared hook so the floating
  // surface and the full-chat panel scroll identically.
  useChatAutoScroll({ containerRef, endRef: messagesEndRef, lastMsgRef, messages });

  // The add-viz button in the dashboard's edit toolbar fires an intent — open
  // the assistant, drop a starter prompt into the input, and surface a few
  // suggestion chips so the user can one-click into a viz request. The intent's
  // `tick` is the dependency so re-clicking the button refires the effect.
  useEffect(() => {
    if (!addVizIntent) return;
    setOpen(true);
    setInput(addVizIntent.prompt);
    setPendingSuggestions(addVizIntent.suggestions);
  }, [addVizIntent?.tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dashboard context — prefixed onto every user message so both agents
  // (editor in edit mode, analyst in view mode) always know which
  // dashboard + tab the user is on, what tiles are visible, and which other
  // tabs exist. The prefix is hidden in the rendered bubble (useChat strips
  // it from the displayed user message — only the agent sees it).
  const dashboardPrefix = editCtx
    ? buildDashboardContext({
        dashboardId: editCtx.dashboardId,
        dashboardName: editCtx.dashboardName,
        activeTab: editCtx.activeTab,
        tabs: editCtx.tabs,
        mode: editCtx.canGenerate ? 'edit' : 'view',
      })
    : undefined;

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    setPendingSuggestions([]);
    sendMessage(text, dashboardPrefix);
  };

  // Click a suggestion → send immediately (skip the input). Mirrors how the
  // empty-state suggestion chips elsewhere in the platform behave.
  const handleSuggestion = (text: string) => {
    if (isLoading) return;
    setInput('');
    setPendingSuggestions([]);
    sendMessage(text, dashboardPrefix);
  };

  // ── Collapsed: floating action button ──────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-full bg-inverse text-inverse-foreground shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:bg-inverse/90 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-sm font-semibold">Ask Agent</span>
      </button>
    );
  }

  // ── Expanded: chat panel ───────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-3rem)] rounded-2xl border border-line bg-surface-sunken shadow-[0_16px_50px_rgba(0,0,0,0.6)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line/60 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-surface-raised border border-line-strong flex items-center justify-center text-foreground shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">
            {editCtx?.canGenerate ? 'Generate a visualization' : 'Media Analyst'}
          </p>
          <p className="truncate text-[11px] text-faint leading-tight">
            {editCtx?.canGenerate
              ? `Charts you make can be saved to ${editCtx.tabLabel}`
              : 'Plan & dashboard assistant'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => createNewSession()}
          title="New chat"
          className="p-1.5 text-faint hover:text-foreground hover:bg-surface-raised rounded-md transition-colors"
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
          className="p-1.5 text-faint hover:text-foreground hover:bg-surface-raised rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-11 h-11 rounded-full bg-surface border border-line flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {editCtx?.canGenerate ? 'Describe a viz to add' : 'How can I help?'}
            </p>
            <p className="text-xs text-faint mt-1 leading-relaxed">
              {editCtx?.canGenerate
                ? `Try "weekly spend in 2024 as a line chart" or "spend by publisher". Use the Save button beneath each chart to add it to ${editCtx.tabLabel}.`
                : 'Ask me to analyze media performance, explain a dashboard, or build a new visualization.'}
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              variant="floating"
              rowRef={i === messages.length - 1 ? lastMsgRef : undefined}
              rating={feedback[m.id] ?? null}
              onRate={(rating) => rateMessage(m.id, rating)}
              onAction={(text) => sendMessage(text)}
            />
          ))
        )}
        {error && <p className="text-[11px] text-danger px-1">{error}</p>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-line/60 p-3 shrink-0">
        {pendingSuggestions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent-400 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface px-3 py-2 focus-within:border-line-strong transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              editCtx?.canGenerate
                ? 'Describe the chart you want…'
                : 'Ask about plans or dashboards…'
            }
            rows={2}
            className="flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder-disabled outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-inverse text-inverse-foreground hover:bg-inverse/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
