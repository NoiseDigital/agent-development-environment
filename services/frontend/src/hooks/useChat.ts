'use client';

import { useState, useEffect, useRef } from 'react';
import { adkApi } from '../lib/adk-api';
import type { Session, AgentRunRequest, Event as AdkEvent } from '../lib/adk-api';
import type { ChartData } from '../types/chart';
import type { UIBlock } from '../types/genui';
import { getAgentConfiguration } from '../config/agent-config';
import { normalizeTimestamp } from '../utils/timestamps';
import { feedbackApi, type Rating } from '../lib/feedback-api';
import { sessionNamesApi } from '../lib/session-names-api';
import { getCurrentUser } from '../lib/auth';

/** One tool the agent invoked during a turn — name + arguments only; the SQL
 *  is reconstructed later from the toolbox catalog. */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
  ui?: UIBlock[];
  /** While streaming, before any text: a label for the process step underway. */
  status?: string;
  /** While streaming: the kind of UI block still being produced, if any. */
  uiKind?: 'chart' | 'choices';
  /** Tool calls made while producing this reply (admin "what ran" view). */
  toolCalls?: ToolCall[];
}

// Shown when the agent errors out or returns nothing — never leave a turn blank.
const FALLBACK_REPLY =
  "I wasn't able to complete that — something went wrong on my end. " +
  'Please try again, or rephrase your question.';

// ── Agent JSON response parser ───────────────────────────────────────────────

/**
 * Extract the first complete, balanced JSON object from a string.
 * Properly skips brace/bracket characters inside JSON string literals.
 */
const extractFirstJsonObject = (text: string): string | null => {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
};

// LLM-generated JSON occasionally blends in Python literals (True/False/None).
// Translate them to JSON — but only outside string content, so message text is
// left untouched.
const normalizePythonJson = (s: string): string => {
  const LITERALS: Record<string, string> = { True: 'true', False: 'false', None: 'null' };
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    let matched = false;
    for (const [py, json] of Object.entries(LITERALS)) {
      if (s.startsWith(py, i) && !/[A-Za-z0-9_]/.test(s[i + py.length] ?? '')) {
        out += json;
        i += py.length - 1;
        matched = true;
        break;
      }
    }
    if (!matched) out += ch;
  }
  return out;
};

/** JSON.parse, retried once with Python literals normalised to JSON. */
const parseJsonLoose = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    /* malformed — retry leniently below */
  }
  try {
    return JSON.parse(normalizePythonJson(s));
  } catch {
    return null;
  }
};

/** Parse an agent's JSON response — the GenUI `{ text, ui }` contract, also
 *  accepting the legacy `{ text, visualization }` shape (mapped to chart blocks). */
const tryParseAgentJson = (raw: string): { content: string; ui?: UIBlock[] } | null => {
  const parsed = parseJsonLoose(raw.trim());
  if (!parsed || typeof parsed !== 'object' || parsed.text === undefined) return null;

  const result: { content: string; ui?: UIBlock[] } = { content: parsed.text };

  if (Array.isArray(parsed.ui)) {
    result.ui = parsed.ui as UIBlock[];
  } else if (parsed.visualization) {
    // Legacy shape: one or more charts under `visualization` → chart blocks.
    const viz = parsed.visualization;
    const charts: ChartData[] = Array.isArray(viz) ? viz : [viz];
    result.ui = charts.map((props) => ({ component: 'chart', props }));
  }
  return result;
};

const parseAgentResponse = (text: string): { content: string; ui?: UIBlock[] } => {
  // Try the first balanced JSON object found anywhere in the response
  const jsonStr = extractFirstJsonObject(text);
  if (jsonStr) {
    const result = tryParseAgentJson(jsonStr);
    if (result) return result;
  }
  // Fallback: treat as plain text
  return { content: text };
};

// While a structured ({ text, ui }) response streams in, show only the partial
// `text` value so the user never sees raw JSON. Best-effort extraction of the
// first "text" string from a possibly-incomplete JSON object.
const streamingDisplayText = (raw: string): string => {
  // The reply is the { text, ui } JSON envelope — possibly fenced, or with the
  // ui block first. Show only the partial `text`; until it appears show nothing
  // so the JSON envelope and ui blocks never leak into the bubble.
  const key = raw.indexOf('"text"');
  if (key === -1) return '';
  let i = key + 6;
  while (i < raw.length && raw[i] !== ':') i++;
  i++;
  while (i < raw.length && raw[i] !== '"') i++;
  i++; // past the opening quote
  const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/' };
  let out = '';
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') {
      const next = raw[i + 1];
      if (next === undefined) break; // escape split across stream chunks
      if (next === 'u') {
        const hex = raw.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '"') break; // closing quote — text field complete
    out += ch;
    i++;
  }
  return out;
};

// What the agent is doing right now, derived from an event. `working` is the
// process label shown by the spinner BEFORE any text streams. `uiKind` means a
// chart / choices block is on the way — it drives the more specific label shown
// AFTER text has appeared, never before it.
const phaseFromEvent = (
  event: AdkEvent,
): { working?: string; uiKind?: 'chart' | 'choices' } | null => {
  if (event.author === 'ReactChartsAgent') return { uiKind: 'chart' };
  if (event.author === 'ChoicesAgent') return { uiKind: 'choices' };
  if (event.author === 'ResponseFormatter') return { working: 'Finalizing the response' };

  const call = event.content?.parts?.find(p => p.functionCall)?.functionCall as
    | { name?: string }
    | undefined;
  const fnName = call?.name;
  if (fnName) {
    if (/charts?/i.test(fnName)) return { uiKind: 'chart' };
    if (/choices/i.test(fnName)) return { uiKind: 'choices' };
    return { working: 'Querying the data' };
  }
  return null;
};

// The tool calls an event records (its function_call parts). The SQL is not
// here — the agent never sees it; ToolQueries reconstructs it from the catalog.
const extractToolCalls = (event: AdkEvent): ToolCall[] =>
  (event.content?.parts ?? [])
    .map(p => p.functionCall)
    .filter((fc): fc is Record<string, unknown> => !!fc)
    .map(fc => ({
      name: typeof fc.name === 'string' ? fc.name : '',
      args: (fc.args && typeof fc.args === 'object' ? fc.args : {}) as Record<string, unknown>,
    }))
    .filter(c => c.name);

// The stream emits each call more than once (partial + complete events) — keep
// one entry per distinct name+args so the "N queries" count is accurate.
const dedupeToolCalls = (calls: ToolCall[]): ToolCall[] => {
  const seen = new Set<string>();
  return calls.filter(c => {
    const key = `${c.name}|${JSON.stringify(c.args)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Convert persisted ADK events into chat messages.
const eventsToMessages = (events: AdkEvent[], supportsVisualization: boolean): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  // Tool calls precede the turn's reply — gather them, attach to that reply.
  let pendingCalls: ToolCall[] = [];

  for (const event of events) {
    const calls = extractToolCalls(event);
    if (calls.length) pendingCalls.push(...calls);

    const part = event.content?.parts?.find(part => part.text);
    if (!part?.text) continue;

    if (event.author === 'user') {
      messages.push({
        id: event.id,
        content: part.text,
        author: 'user',
        timestamp: normalizeTimestamp(event.timestamp),
      });
      pendingCalls = [];
      continue;
    }

    // An agent text event. A multi-agent turn (worker → formatter) persists
    // several; collapse each run of consecutive agent events down to the last
    // one (the final reply) so reload shows no raw draft or duplicate bubble.
    const parsed = supportsVisualization
      ? parseAgentResponse(part.text)
      : { content: part.text, ui: undefined };
    const message: ChatMessage = {
      id: event.id,
      content: parsed.content,
      author: event.author,
      timestamp: normalizeTimestamp(event.timestamp),
      ui: parsed.ui,
      toolCalls: pendingCalls.length ? dedupeToolCalls(pendingCalls) : undefined,
    };
    const prev = messages[messages.length - 1];
    if (prev && prev.author !== 'user') {
      // Replacing the draft with the later output — keep the turn's tool calls.
      messages[messages.length - 1] = {
        ...message,
        toolCalls: message.toolCalls ?? prev.toolCalls,
      };
    } else {
      messages.push(message);
    }
    pendingCalls = [];
  }

  return messages;
};

// Identity comes from the auth seam (lib/auth) — a fixed dev user today, the
// Firebase user once auth is live. Callers may still override `userId` for tests.
export function useChat(initialApp?: string, userId: string = getCurrentUser().uid) {
  const [availableApps, setAvailableApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(initialApp ?? null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  // Per-message thumb ratings for the active session, keyed by ADK event id.
  const [feedback, setFeedback] = useState<Record<string, Rating>>({});
  // Prevent the currentSession useEffect from overwriting messages that were
  // just parsed correctly by sendMessage (the session sync happens right after).
  const skipNextSessionSync = useRef(false);
  const supportsVisualization = selectedApp
    ? (getAgentConfiguration(selectedApp)?.supportsVisualization ?? false)
    : false;

  // Load saved session display names whenever the active app changes.
  useEffect(() => {
    if (!selectedApp) {
      setSessionNames({});
      return;
    }
    let cancelled = false;
    sessionNamesApi
      .list(selectedApp, userId)
      .then(names => { if (!cancelled) setSessionNames(names); })
      .catch(() => { if (!cancelled) setSessionNames({}); });
    return () => { cancelled = true; };
  }, [selectedApp, userId]);

  // Persist a session display name — optimistic; the server write is fire-and-forget.
  const saveSessionName = (sessionId: string, name: string) => {
    setSessionNames(prev => ({ ...prev, [sessionId]: name }));
    if (selectedApp) {
      sessionNamesApi.set(selectedApp, sessionId, name, userId).catch(() => {});
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

  // Load sessions when app changes — no currentSession dep to avoid re-fetch loops
  useEffect(() => {
    if (!selectedApp) return;
    let cancelled = false;
    const loadSessionsForApp = async () => {
      setIsLoadingSessions(true);
      try {
        const sessionList = await adkApi.listSessions(selectedApp, userId);
        if (!cancelled) setSessions(sessionList);
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

  // Update messages when current session changes (e.g. navigating to a session)
  // Skip the sync when sendMessage just updated messages — it already parsed correctly.
  useEffect(() => {
    if (currentSession) {
      if (skipNextSessionSync.current) {
        skipNextSessionSync.current = false;
        return;
      }
      const chatMessages = eventsToMessages(currentSession.events, supportsVisualization);
      setMessages(chatMessages);
    }
  }, [currentSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load per-message feedback whenever the active session changes.
  useEffect(() => {
    if (!selectedApp || !currentSession) {
      setFeedback({});
      return;
    }
    let cancelled = false;
    feedbackApi
      .listForSession(selectedApp, currentSession.id, userId)
      .then(map => { if (!cancelled) setFeedback(map); })
      .catch(() => { if (!cancelled) setFeedback({}); });
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
    } catch {
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
      setSessions(sessionList);

      // If no current session, select the first one or create a new one
      if (!currentSession && sessionList.length === 0) {
        // Don't auto-create session, let user do it manually
      } else if (!currentSession && sessionList.length > 0) {
        setCurrentSession(sessionList[0]);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError(`Failed to load sessions: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const createNewSession = async (): Promise<Session | null> => {
    if (!selectedApp) return null;

    try {
      const sessionId = `session-${Date.now()}`;
      const newSession = await adkApi.createSession(selectedApp, userId, sessionId);
      setSessions(prev => [newSession, ...prev]);
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

    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content: content.trim(),
      author: 'user',
      timestamp: Date.now(),
    };

    const streamingId = `streaming-${Date.now()}`;
    const streamingPlaceholder: ChatMessage = {
      id: streamingId,
      content: '',
      author: 'agent',
      timestamp: Date.now(),
      isStreaming: true,
    };

    // Capture agent message count before this exchange (for auto-naming every N messages)
    const AUTO_RENAME_EVERY = 10;
    const agentMsgCountBefore = messages.filter(m => m.author !== 'user').length;
    const newAgentCount = agentMsgCountBefore + 1;
    const shouldAutoRename = newAgentCount === 1 || newAgentCount % AUTO_RENAME_EVERY === 0;

    setMessages(prev => [...prev, userMessage, streamingPlaceholder]);

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
      let uiKind: 'chart' | 'choices' | undefined;
      // Tool calls made this turn — surfaced under the reply for admins.
      const toolCalls: ToolCall[] = [];

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
          }
        }

        // Show partial `text` only — never the raw JSON envelope mid-stream.
        const display = supportsVisualization ? streamingDisplayText(accumulated) : accumulated;
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingId
              ? { ...m, content: display, author: agentAuthor, status: working || undefined, uiKind }
              : m
          )
        );

        if (event.turnComplete) break;
      }

      // Parse the completed response for UI blocks / JSON wrapper
      const parsed = supportsVisualization
        ? parseAgentResponse(accumulated)
        : { content: accumulated, ui: undefined };
      // A blank reply with nothing to render → a graceful fallback message.
      const finalText = parsed.content.trim() || (parsed.ui?.length ? '' : FALLBACK_REPLY);
      // Adopt the real ADK event id so feedback (keyed by event id) survives a reload.
      setMessages(prev =>
        prev.map(m =>
          m.id === streamingId
            ? {
                ...m,
                id: finalEventId ?? streamingId,
                content: finalText,
                ui: parsed.ui,
                isStreaming: false,
                status: undefined,
                uiKind: undefined,
                toolCalls: toolCalls.length ? dedupeToolCalls(toolCalls) : undefined,
              }
            : m
        )
      );

      // Sync session state — skip the currentSession useEffect message overwrite
      // since we've already parsed and set messages correctly above.
      skipNextSessionSync.current = true;
      const updatedSession = await adkApi.getSession(selectedApp, userId, currentSession.id);
      setCurrentSession(updatedSession);

      // Auto-rename the session at message 1, 10, 20, 30… so the name stays
      // fresh as the conversation evolves.
      if (shouldAutoRename) {
        try {
          const name = await adkApi.nameSession(selectedApp, [
            { content: content.trim(), role: 'user' },
            { content: parsed.content.slice(0, 300), role: 'model' },
          ]);
          saveSessionName(currentSession.id, name);
          setSessions(prev =>
            prev.map(s => s.id === currentSession.id ? { ...s } : s)
          );
        } catch { /* non-fatal */ }
      }

    } catch (err) {
      console.error('Failed to send message:', err);
      // Keep the user's message; turn the streaming placeholder into a graceful
      // fallback reply rather than dropping the exchange entirely.
      setMessages(prev =>
        prev.map(m =>
          m.id === streamingId
            ? { ...m, content: FALLBACK_REPLY, isStreaming: false, status: undefined, uiKind: undefined }
            : m
        )
      );
    } finally {
      setIsLoading(false);
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
        } catch {
          // Fallback to whatever is already loaded below.
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
      const name = await adkApi.nameSession(selectedApp, msgs);
      saveSessionName(sessionId, name);
      return name;
    } catch (err) {
      setError(`Failed to rename session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  };

  const selectSession = async (sessionId: string) => {
    if (!selectedApp) return;

    try {
      const session = await adkApi.getSession(selectedApp, userId, sessionId);
      setCurrentSession(session);
      setError(null);
    } catch (err) {
      setError(`Failed to select session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!selectedApp) return;

    try {
      await adkApi.deleteSession(selectedApp, userId, sessionId);
      // Drop this session's feedback + saved name — ADK's cascade won't reach our tables.
      feedbackApi.clearSession(selectedApp, sessionId, userId).catch(() => {});
      sessionNamesApi.remove(selectedApp, sessionId, userId).catch(() => {});

      // Remove the session from the local list
      setSessions(prev => prev.filter(session => session.id !== sessionId));

      // If the deleted session was the current one, clear it
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
        setFeedback({});
      }

      setError(null);
    } catch (err) {
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
