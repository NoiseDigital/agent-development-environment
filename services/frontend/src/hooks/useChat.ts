'use client';

import { useState, useEffect, useRef } from 'react';
import { adkApi } from '../lib/agent/adk-api';
import type { Session, AgentRunRequest } from '../lib/agent/adk-api';
import { getAgentConfiguration } from '../config/agent-config';
import { feedbackApi, type Rating } from '../lib/agent/feedback-api';
import { sessionNamesApi } from '../lib/agent/session-names-api';
import { getCurrentUser } from '../lib/auth';
import { newId } from '../lib/id';
import {
  parseAgentResponse,
  streamingDisplayText,
} from '../lib/agent/response';
import { setNeuralThinking } from '../lib/agent/neural-pulse';
import type { UIBlock } from '../types/genui';
import {
  phaseFromEvent,
  extractToolCalls,
  dedupeToolCalls,
  type ChatMessage,
  type ToolCall,
} from '../lib/agent/events';
import {
  deriveMessages,
  type InFlightStream,
} from '../lib/agent/projection';

export type { ChatMessage, ToolCall };

// Shown when the agent errors out or returns nothing — never leave a turn blank.
const FALLBACK_REPLY =
  "I wasn't able to complete that — something went wrong on my end. " +
  'Please try again, or rephrase your question.';

// Internal one-shot ADK app for naming sessions. Same auth path as every
// other agent on the platform — ADC, via ADK.
const NAMING_AGENT = 'session_naming_agent';

/** Render the recent message exchanges as a plain-text dump for the naming
 *  agent's prompt. Keeps the input small (≤ 8 messages × 300 chars). */
function namingPrompt(messages: Array<{ content: string; role: string }>): string {
  return messages
    .slice(-8)
    .map((m) => `${m.role.toUpperCase()} ${m.content.slice(0, 300)}`)
    .join('\n');
}

/** Trim and sanitise the agent's response into a session-friendly title. */
function cleanName(text: string): string {
  return text.replace(/^["'`]+|["'`]+$/g, '').trim().slice(0, 50);
}

// Identity comes from the auth seam (lib/auth) — a fixed dev user today, the
// Firebase user once auth is live. Callers may still override `userId` for tests.
export function useChat(initialApp?: string, userId: string = getCurrentUser().uid) {
  const [availableApps, setAvailableApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(initialApp ?? null);
  // The raw session list from ADK includes soft-deleted ids; the public
  // `sessions` view (returned to consumers) filters by `hiddenSessions`.
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  // Session ids the user has soft-deleted — hidden from the UI but kept on
  // disk so they can be restored later.
  const [hiddenSessions, setHiddenSessions] = useState<Set<string>>(new Set());
  // Per-message thumb ratings for the active session, keyed by ADK event id.
  const [feedback, setFeedback] = useState<Record<string, Rating>>({});
  // Per-session in-flight stream state. Keyed by sessionId so an SSE that's
  // still running when the user navigates away can keep accumulating, and
  // the streaming bubble re-appears the moment they navigate back. The
  // displayed `messages` array is *derived* from
  //   committed events (from currentSession.events)  +
  //   inFlightStreams[currentSession.id]
  // so the bubble follows the session, not the in-memory React state.
  const [inFlightStreams, setInFlightStreams] = useState<Record<string, InFlightStream>>({});
  // Auto-cleanup ledger — sessions we CREATED in this tab and which have NOT
  // yet had a message sent through them. Only ids in this set are ever
  // eligible to be auto-deleted on the next "new chat" click. We can't trust
  // ADK's listSessions for this — its response carries metadata only (events
  // is empty for every session), so a length check would match content too.
  const localFreshSessions = useRef<Set<string>>(new Set());
  const supportsVisualization = selectedApp
    ? (getAgentConfiguration(selectedApp)?.supportsVisualization ?? false)
    : false;

  // Load saved session metadata (names + hidden ids) whenever the app changes.
  useEffect(() => {
    if (!selectedApp) {
      setSessionNames({});
      setHiddenSessions(new Set());
      return;
    }
    let cancelled = false;
    sessionNamesApi
      .list(selectedApp, userId)
      .then(meta => {
        if (cancelled) return;
        setSessionNames(meta.names);
        setHiddenSessions(new Set(meta.hidden));
      })
      .catch(err => {
        if (cancelled) return;
        // We still clear local state so the UI doesn't show stale data from
        // a previous app, but we log the failure so a regression in the
        // session-names endpoint surfaces in the console instead of just
        // looking like "no saved names yet".
        console.warn('[useChat] failed to load session names for', selectedApp, err);
        setSessionNames({});
        setHiddenSessions(new Set());
      });
    return () => { cancelled = true; };
  }, [selectedApp, userId]);

  // Persist a session display name — optimistic; the server write is fire-and-forget.
  const saveSessionName = (sessionId: string, name: string) => {
    setSessionNames(prev => ({ ...prev, [sessionId]: name }));
    if (selectedApp) {
      sessionNamesApi.set(selectedApp, sessionId, name, userId).catch(err => {
        // Optimistic — the local rename still stands, but log so we notice
        // when the server-side persistence quietly stops working.
        console.warn('[useChat] failed to persist session name', sessionId, err);
      });
    }
  };

  // Load available apps on mount
  useEffect(() => {
    const loadApps = async () => {
      try {
        setIsLoadingApps(true);
        const apps = await adkApi.listApps();
        setAvailableApps(apps);
      } catch (err) {
        console.error('Failed to load apps:', err);
        setError(`Failed to load available apps: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoadingApps(false);
      }
    };
    loadApps();
  }, []);

  // React to `initialApp` changes. The FloatingAssistant picks an agent based
  // on dashboard edit mode — when the user toggles edit on/off, `initialApp`
  // flips between media_performance_agent and dashboard_editor_agent. Without
  // this effect the hook stayed bound to whichever app was active on the
  // FIRST render, and `/run_sse` calls would 404 because the session was
  // created under one app but the request URL referenced the other.
  // We deliberately do NOT touch state when the prop matches the current
  // selection — that's the steady state.
  useEffect(() => {
    if (!initialApp || initialApp === selectedApp) return;
    setSelectedApp(initialApp);
    // Drop everything tied to the previous app — the new one will spawn its
    // own session via createNewSession on the consumer's mount effect.
    setCurrentSession(null);
    setMessages([]);
    setFeedback({});
    setError(null);
  }, [initialApp, selectedApp]);

  // Load sessions when app changes — no currentSession dep to avoid re-fetch loops.
  // After the listing arrives we also prune sessions with zero events (stale
  // "New chat" placeholders left behind by previous tabs); a session that has
  // any message at all is never touched.
  useEffect(() => {
    if (!selectedApp) return;
    let cancelled = false;
    const loadSessionsForApp = async () => {
      setIsLoadingSessions(true);
      try {
        const sessionList = await adkApi.listSessions(selectedApp, userId);
        if (cancelled) return;
        setAllSessions(sessionList);
        // listSessions returns metadata only (events is always empty there) —
        // so we cap getSession fan-out to a reasonable number and only act on
        // sessions where the FULL event list comes back empty.
        const PRUNE_CAP = 40;
        const candidates = sessionList.slice(0, PRUNE_CAP);
        const prunedIds: string[] = [];
        await Promise.all(
          candidates.map(async (s) => {
            try {
              const full = await adkApi.getSession(selectedApp, userId, s.id);
              if (!full.events || full.events.length === 0) {
                await adkApi.deleteSession(selectedApp, userId, s.id);
                prunedIds.push(s.id);
              }
            } catch (err) {
              // Best-effort — leave the session intact on failure (the prune
              // is housekeeping, not load-bearing), but log so a regression
              // in getSession/deleteSession doesn't go silent.
              console.warn('[useChat.startup-prune] check failed for', s.id, err);
            }
          }),
        );
        if (!cancelled && prunedIds.length > 0) {
          setAllSessions((cur) => cur.filter((s) => !prunedIds.includes(s.id)));
          // Also drop any of these from name/feedback maps + the local fresh-
          // session ledger so a follow-up "new chat" doesn't try to re-delete.
          for (const id of prunedIds) localFreshSessions.current.delete(id);
        }
      } catch (err) {
        if (!cancelled)
          setError(`Failed to load sessions: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        if (!cancelled) setIsLoadingSessions(false);
      }
    };
    loadSessionsForApp();
    return () => { cancelled = true; };
  }, [selectedApp, userId]);

  // The public session list — soft-deleted ids are filtered out so the UI
  // never shows them, while the backing rows survive for potential restore.
  const sessions = allSessions.filter(s => !hiddenSessions.has(s.id));

  // Derive the visible messages array whenever the active session OR its
  // in-flight stream changes. The user's send-bubble + the agent's streaming
  // bubble both come from `inFlightStreams[currentSession.id]`, not from
  // direct setMessages calls — so leaving the session and returning re-
  // projects the in-flight bubble seamlessly.
  useEffect(() => {
    setMessages(
      deriveMessages(
        currentSession,
        currentSession ? inFlightStreams[currentSession.id] : undefined,
        supportsVisualization,
      ),
    );
  }, [currentSession, inFlightStreams, supportsVisualization]);

  // Load per-message feedback whenever the active session changes.
  useEffect(() => {
    if (!selectedApp || !currentSession) {
      setFeedback({});
      return;
    }
    let cancelled = false;
    const sessionId = currentSession.id;
    feedbackApi
      .listForSession(selectedApp, sessionId, userId)
      .then(map => { if (!cancelled) setFeedback(map); })
      .catch(err => {
        if (cancelled) return;
        console.warn('[useChat] failed to load feedback for session', sessionId, err);
        setFeedback({});
      });
    return () => { cancelled = true; };
  }, [selectedApp, currentSession?.id, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set or clear (rating = null) the thumb rating for one message. Optimistic —
  // reverts if the request fails.
  const rateMessage = async (eventId: string, rating: Rating | null) => {
    if (!selectedApp || !currentSession) return;
    const previous = feedback[eventId] ?? null;
    setFeedback(prev => {
      const next = { ...prev };
      if (rating) next[eventId] = rating;
      else delete next[eventId];
      return next;
    });
    try {
      await feedbackApi.setRating(selectedApp, currentSession.id, eventId, rating, userId);
    } catch (err) {
      // The optimistic rating update gets reverted below — log so a
      // regression in the feedback endpoint is visible while the user just
      // sees the rating revert.
      console.warn('[useChat.rateMessage] failed for event', eventId, err);
      setFeedback(prev => {
        const next = { ...prev };
        if (previous) next[eventId] = previous;
        else delete next[eventId];
        return next;
      });
    }
  };

  const loadAvailableApps = async () => {
    try {
      setIsLoadingApps(true);
      const apps = await adkApi.listApps();
      setAvailableApps(apps);

      // Auto-select the first app if available
      if (apps.length > 0 && !selectedApp) {
        setSelectedApp(apps[0]);
      }
    } catch (err) {
      console.error('Failed to load apps:', err);
      setError(`Failed to load available apps: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingApps(false);
    }
  };

  const loadSessions = async () => {
    if (!selectedApp) return;

    try {
      const sessionList = await adkApi.listSessions(selectedApp, userId);
      setAllSessions(sessionList);

      // Auto-select the first visible session if none is current.
      const visible = sessionList.filter(s => !hiddenSessions.has(s.id));
      if (!currentSession && visible.length > 0) {
        setCurrentSession(visible[0]);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError(`Failed to load sessions: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Hard-delete only the sessions on the local fresh-sessions ledger — ones
  // WE created in this tab that have never had a message sent through them.
  // This is the only safe definition: listSessions doesn't carry events, and a
  // previous bug here meant the check matched every session in the list and
  // wiped the whole sidebar on every "new chat" click. We never touch
  // anything that isn't on the ledger.
  const cleanupFreshUnusedSessions = async (app: string): Promise<string[]> => {
    const ids = Array.from(localFreshSessions.current);
    if (ids.length === 0) return [];
    await Promise.all(
      ids.map(async id => {
        try {
          await adkApi.deleteSession(app, userId, id);
          // Best-effort companion cleanups — log per-id so a regression
          // doesn't silently leak session-names / feedback rows over time.
          sessionNamesApi.remove(app, id, userId).catch(err =>
            console.warn('[useChat.prune] session-name cleanup failed for', id, err),
          );
          feedbackApi.clearSession(app, id, userId).catch(err =>
            console.warn('[useChat.prune] feedback cleanup failed for', id, err),
          );
        } catch (err) {
          // The session itself failed to delete — keep the loop going so a
          // single bad id doesn't block the new-chat flow, but surface it.
          console.warn('[useChat.prune] session delete failed for', id, err);
        }
      }),
    );
    localFreshSessions.current = new Set();
    return ids;
  };

  // `appOverride` lets a caller create a session under a specific app even
  // when `selectedApp` state hasn't yet committed (e.g. the FloatingAssistant
  // swapping agents on edit-mode toggle — the state setter and this call fire
  // in the same render, so the closure's selectedApp is still stale).
  const createNewSession = async (appOverride?: string): Promise<Session | null> => {
    const app = appOverride ?? selectedApp;
    if (!app) return null;

    try {
      const cleanedIds = await cleanupFreshUnusedSessions(app);
      // The URL routes a session as /chat/<agent>/<id>, so the entity is
      // already implied by the path — the id itself is just a uuid, no prefix.
      const sessionId = newId();
      const newSession = await adkApi.createSession(app, userId, sessionId);
      // Mark the new session as "fresh, unused" — it graduates off the ledger
      // the moment sendMessage is invoked against it.
      localFreshSessions.current.add(newSession.id);
      setAllSessions(prev => [
        newSession,
        ...prev.filter(s => !cleanedIds.includes(s.id)),
      ]);
      setCurrentSession(newSession);
      setMessages([]);
      setError(null);
      return newSession;
    } catch (err) {
      setError(`Failed to create session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  };

  // `agentPrefix` is prepended to the text sent to the agent (e.g. an active-
  // sources manifest) but is not shown in the user's displayed message.
  const sendMessage = async (content: string, agentPrefix?: string) => {
    if (!currentSession || !content.trim() || !selectedApp) return;
    // Pin the origin session id at send-time so every stream-state write
    // targets the originating session regardless of where the user has
    // navigated since. The SSE drains on its own; ADK persists the reply
    // server-side; returning to the origin session re-projects the bubble.
    const originSessionId = currentSession.id;

    setIsLoading(true);
    setNeuralThinking(true);
    setError(null);
    // The moment a message is sent, this session has content — pull it off
    // the auto-cleanup ledger so the next "new chat" click can't touch it.
    localFreshSessions.current.delete(originSessionId);

    const userMessageId = `user-${Date.now()}`;
    const streamingId = `streaming-${Date.now()}`;
    const startedAt = Date.now();

    // Capture agent message count before this exchange (for auto-naming every N messages)
    const AUTO_RENAME_EVERY = 10;
    const agentMsgCountBefore = messages.filter(m => m.author !== 'user').length;
    const newAgentCount = agentMsgCountBefore + 1;
    const shouldAutoRename = newAgentCount === 1 || newAgentCount % AUTO_RENAME_EVERY === 0;

    // Seed the in-flight stream. The projection effect re-derives messages
    // from this immediately, so the user's bubble + the streaming placeholder
    // appear on the active session.
    setInFlightStreams(prev => ({
      ...prev,
      [originSessionId]: {
        userMessageId,
        userContent: content.trim(),
        streamingId,
        accumulated: '',
        agentAuthor: 'agent',
        working: '',
        uiKind: undefined,
        toolCalls: [],
        startedAt,
      },
    }));

    /** Patch the in-flight stream in place. No-op if the stream entry was
     *  already removed (e.g. the user reset the session) — defensive but not
     *  silent: we leave the prev value unchanged so React skips a re-render. */
    const patchStream = (patch: Partial<InFlightStream>) => {
      setInFlightStreams(prev => {
        const cur = prev[originSessionId];
        if (!cur) return prev;
        return { ...prev, [originSessionId]: { ...cur, ...patch } };
      });
    };

    try {
      const agentText = agentPrefix
        ? `${agentPrefix}\n\n${content.trim()}`
        : content.trim();
      const request: AgentRunRequest = {
        appName: selectedApp,
        userId,
        sessionId: currentSession.id,
        newMessage: { parts: [{ text: agentText }], role: 'user' },
        streaming: true,
      };

      let accumulated = '';
      let agentAuthor = 'agent';
      // The id of the persisted ADK event for this reply — feedback keys off it.
      let finalEventId: string | null = null;
      // In a multi-agent pipeline (worker → formatter) the response is the LAST
      // agent's output — reset accumulation when a new agent starts emitting text.
      let lastTextAuthor: string | null = null;
      // The agent's current process step + which UI block (if any) is coming.
      let working = '';
      let uiKind: 'chart' | 'choices' | 'filters' | undefined;
      // Tool calls made this turn — surfaced under the reply for admins.
      const toolCalls: ToolCall[] = [];
      // Fallback UI captured from any subagent's complete text event. The root
      // agent is INSTRUCTED to return a subagent's envelope verbatim — but
      // models paraphrase sometimes, which would otherwise drop the ChoicesAgent
      // / VegaChartsAgent UI block on the floor. This is the safety net.
      let fallbackUi: UIBlock[] | undefined;

      for await (const event of adkApi.sendMessageSSE(request)) {
        if (event.author && event.author !== 'user') agentAuthor = event.author;

        // Keep the loading label in step with the agent's actual activity.
        const next = phaseFromEvent(event);
        if (next) {
          if (next.working) working = next.working;
          if (next.uiKind) uiKind = next.uiKind;
        }
        toolCalls.push(...extractToolCalls(event));

        const textPart = event.content?.parts?.find(p => p.text);
        if (textPart?.text) {
          if (event.author && event.author !== lastTextAuthor) {
            accumulated = '';
            lastTextAuthor = event.author;
          }
          // partial === true → streaming delta, append.
          // partial === false / undefined (complete event) → full text, replace to avoid duplication.
          if (event.partial === true) {
            accumulated += textPart.text;
          } else {
            accumulated = textPart.text;
            finalEventId = event.id;
            // Safety net #1: a subagent emitted its envelope as a standalone
            // text event. Capture its UI as a fallback in case the root
            // paraphrases and drops it.
            if (
              supportsVisualization &&
              event.author &&
              event.author !== 'user' &&
              event.author !== 'MediaPerformanceAgent'
            ) {
              const subParsed = parseAgentResponse(textPart.text);
              if (subParsed.ui?.length) fallbackUi = subParsed.ui;
            }
          }
        }

        // Safety net #2: ADK's AgentTool wraps a subagent's output INTO the
        // tool response (functionResponse.response.result), instead of
        // streaming it as its own text. Pull that envelope out so a
        // ChoicesAgent or VegaChartsAgent UI block reaches the bubble even
        // when the root agent emits no text at all after the tool call.
        if (supportsVisualization) {
          for (const part of event.content?.parts ?? []) {
            const fr = part.functionResponse as { response?: unknown } | undefined;
            const resp = fr?.response;
            if (!resp || typeof resp !== 'object') continue;
            const result = (resp as Record<string, unknown>).result;
            if (typeof result !== 'string') continue;
            const subParsed = parseAgentResponse(result);
            if (subParsed.ui?.length) fallbackUi = subParsed.ui;
            // If the root never produced text of its own, surface the
            // subagent's text content too so the bubble isn't empty.
            if (!accumulated.trim() && subParsed.content) {
              accumulated = subParsed.content;
            }
          }
        }

        // Stream this event's accumulated state into the in-flight entry.
        // The projection effect derives the bubble from it — the user sees
        // the same stream whether they stayed on origin or navigated back.
        patchStream({ accumulated, agentAuthor, working, uiKind, toolCalls: [...toolCalls], fallbackUi });

        if (event.turnComplete) break;
      }

      // Parse the completed response for UI blocks / JSON wrapper
      const parsed = supportsVisualization
        ? parseAgentResponse(accumulated)
        : { content: accumulated, ui: undefined };
      // Final safety net: if parsing failed (case 3) and we're STILL holding a
      // raw `{ "text": ..., "ui": ... }` envelope as content, surface only the
      // text via the streaming extractor so a user never sees raw JSON. Hitting
      // this branch means parseAgentResponse couldn't recognise the agent's
      // output — log it loudly so a regression in the agent's envelope shape
      // is visible instead of just looking like a slightly-off bubble.
      const looksLikeEnvelope =
        supportsVisualization &&
        /^\s*\{[\s\S]*"text"\s*:/.test(parsed.content);
      if (looksLikeEnvelope) {
        console.warn(
          '[useChat] envelope parser fell through to text; agent likely returned a malformed JSON envelope',
          { sample: parsed.content.slice(0, 200) },
        );
        parsed.content = streamingDisplayText(parsed.content);
      }
      // If the root agent paraphrased away a subagent's UI block, recover it
      // from the fallback captured during the stream.
      if (!parsed.ui?.length && fallbackUi?.length) {
        parsed.ui = fallbackUi;
      }
      // A blank reply with nothing to render → a graceful fallback message.
      const finalText = parsed.content.trim() || (parsed.ui?.length ? '' : FALLBACK_REPLY);

      // Snapshot the parsed reply onto the in-flight stream FIRST. This is
      // what guarantees the bubble shows up: even if the session refetch
      // below is slow, fails, or races ADK's event persistence, the
      // projection still renders this completed snapshot. Previously we
      // relied on the refetch alone, which dropped replies whenever
      // `turnComplete` arrived before the event was persisted.
      const dedupedTools = toolCalls.length ? dedupeToolCalls(toolCalls) : undefined;
      patchStream({
        completed: {
          content: finalText,
          ui: parsed.ui,
          eventId: finalEventId,
          toolCalls: dedupedTools,
        },
      });

      // Refetch the session — by now ADK has usually persisted the agent's
      // reply event. We swap the session in regardless of whether it has
      // the new event yet (eventsToMessages handles partial states); the
      // stream's `completed` snapshot stays visible until the committed
      // events confirm the event id, at which point `deriveMessages`
      // dedupes it out and we clear the stream entry.
      let updatedSession: Session | null = null;
      try {
        updatedSession = await adkApi.getSession(selectedApp, userId, originSessionId);
      } catch (err) {
        console.warn(
          '[useChat] session refetch failed; in-flight snapshot is still visible',
          originSessionId,
          err,
        );
      }
      if (updatedSession) {
        setAllSessions(prev =>
          prev.map(s => (s.id === originSessionId ? updatedSession! : s)),
        );
        if (currentSession?.id === originSessionId) {
          setCurrentSession(updatedSession);
        }
        const hasAgentEvent =
          !!finalEventId &&
          updatedSession.events.some((e) => e.id === finalEventId);
        if (hasAgentEvent) {
          setInFlightStreams(prev => {
            const next = { ...prev };
            delete next[originSessionId];
            return next;
          });
        }
        // Else: the refetch raced persistence and didn't include the event.
        // We leave the stream's `completed` snapshot in place — the user
        // sees the reply, and a follow-up message will trigger another
        // refetch that picks up the persisted event.
      }

      // Auto-rename the session at message 1, 10, 20, 30… Empty replies
      // (Gemini occasionally truncates a 2-6 word title to nothing) get ONE
      // retry. Errors are surfaced as a console warning rather than swallowed
      // silently so a regression in the naming agent is visible.
      if (shouldAutoRename) {
        const prompt = namingPrompt([
          { content: content.trim(), role: 'user' },
          { content: parsed.content.slice(0, 300), role: 'model' },
        ]);
        const tryRename = async (): Promise<string> => {
          const reply = await adkApi.runOneShot(NAMING_AGENT, userId, prompt);
          return cleanName(reply);
        };
        try {
          let name = await tryRename();
          if (!name || name.length < 2) name = await tryRename();
          if (name) {
            // Bind to the origin session so a mid-flight session switch can't
            // misattribute the new title to whichever session is now active.
            saveSessionName(originSessionId, name);
            setAllSessions(prev =>
              prev.map(s => s.id === originSessionId ? { ...s } : s)
            );
          } else {
            console.warn('[session-naming] agent returned empty after retry');
          }
        } catch (e) {
          console.warn('[session-naming] failed', e);
        }
      }

    } catch (err) {
      console.error('[useChat.sendMessage] stream failed for session', originSessionId, err);
      // Build a specific fallback message — a 429 quota error reads very
      // differently from a generic "something went wrong" message, and the
      // user needs to know whether to retry or wait.
      const msg = err instanceof Error ? err.message : '';
      let fallback = FALLBACK_REPLY;
      if (/\b429\b|RESOURCE_EXHAUSTED|Too Many/i.test(msg)) {
        fallback =
          'The model is rate-limiting requests right now (Vertex AI quota). ' +
          'Wait a minute and try again — your message will still be here.';
      } else if (/\b404\b/.test(msg)) {
        fallback =
          "Your chat session was lost (404). Please click 'New chat' to start a fresh session.";
      } else if (msg) {
        fallback = `${FALLBACK_REPLY}\n\n_Error: ${msg.slice(0, 200)}_`;
      }
      // Mark the in-flight stream as failed — the projection effect renders
      // the bubble as a non-streaming final message. Stays visible whether
      // the user is on origin or navigates back, just like a real reply.
      patchStream({ failed: fallback, working: '', uiKind: undefined });
    } finally {
      // The thinking pulse + isLoading are GLOBAL to the chat surface, so
      // they should clear regardless of which session the user is on now.
      setIsLoading(false);
      setNeuralThinking(false);
    }
  };

  const renameSession = async (sessionId: string): Promise<string | null> => {
    if (!selectedApp) return null;
    try {
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return null;

      // Session lists can contain lightweight metadata only. Pull full session events when needed.
      let sourceEvents = session.events ?? [];
      if (!sourceEvents.some(e => e.content?.parts?.some(p => p.text))) {
        try {
          const fullSession = await adkApi.getSession(selectedApp, userId, sessionId);
          sourceEvents = fullSession.events ?? [];
        } catch (err) {
          // Best-effort enrichment for the naming agent. Falls back to the
          // in-memory rendered messages below, but log so a regression in
          // getSession isn't invisible.
          console.warn('[useChat.renameSession] failed to fetch full session', sessionId, err);
        }
      }

      const textEvents = sourceEvents.filter(e => e.content?.parts?.some(p => p.text));
      let msgs = textEvents.slice(0, 8).map(e => ({
        content: e.content!.parts.find(p => p.text)!.text!.slice(0, 300),
        role: e.author === 'user' ? 'user' : 'model' as const,
      }));

      // Fallback to in-memory rendered messages if session events are not available.
      if (msgs.length === 0 && currentSession?.id === sessionId) {
        msgs = messages
          .filter(m => m.content?.trim())
          .slice(0, 8)
          .map(m => ({
            content: m.content.slice(0, 300),
            role: m.author === 'user' ? 'user' : 'model' as const,
          }));
      }

      if (msgs.length === 0) return null;
      const reply = await adkApi.runOneShot(NAMING_AGENT, userId, namingPrompt(msgs));
      const name = cleanName(reply);
      if (!name) return null;
      saveSessionName(sessionId, name);
      return name;
    } catch (err) {
      setError(`Failed to rename session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  };

  const selectSession = async (sessionId: string) => {
    if (!selectedApp) return;
    // Don't reopen a soft-deleted session — the row still exists in ADK, so a
    // URL-driven re-select effect would otherwise undo the user's delete.
    if (hiddenSessions.has(sessionId)) {
      setCurrentSession(null);
      setMessages([]);
      return;
    }

    try {
      const session = await adkApi.getSession(selectedApp, userId, sessionId);
      setCurrentSession(session);
      setError(null);
    } catch (err) {
      setError(`Failed to select session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Soft-delete — the ADK session is left intact so it can be restored; the UI
  // just stops showing it. Hidden ids round-trip through the backend so the
  // soft-delete survives across devices and reloads.
  const deleteSession = async (sessionId: string) => {
    if (!selectedApp) return;

    // Optimistic — hide locally first so the UI updates immediately.
    setHiddenSessions(prev => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
      setMessages([]);
      setFeedback({});
    }
    setError(null);

    try {
      await sessionNamesApi.hide(selectedApp, sessionId, userId);
    } catch (err) {
      // Roll back the optimistic hide so the user can retry.
      setHiddenSessions(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      setError(`Failed to delete session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return {
    availableApps,
    selectedApp,
    setSelectedApp,
    sessions,
    currentSession,
    messages,
    isLoading,
    isLoadingApps,
    isLoadingSessions,
    error,
    sessionNames,
    feedback,
    rateMessage,
    supportsVisualization,
    sendMessage,
    createNewSession,
    selectSession,
    deleteSession,
    renameSession,
    saveSessionName,
    refreshSessions: loadSessions,
    refreshApps: loadAvailableApps,
  };
}
