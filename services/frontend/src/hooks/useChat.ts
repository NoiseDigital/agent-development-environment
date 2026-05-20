'use client';

import { useState, useEffect, useRef } from 'react';
import { adkApi } from '../lib/adk-api';
import type { Session, AgentRunRequest, Event as AdkEvent } from '../lib/adk-api';
import { ChartData } from '../types/chart';
import type { AgentJsonResponse } from '../types/agent-response';
import { getAgentConfiguration } from '../config/agentConfig';

interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
  charts?: ChartData[];
}

// ── Timestamp normalisation ──────────────────────────────────────────────────

const normalizeTimestamp = (timestamp: number | string): number => {
  let ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (ts < 1_000_000_000_000) ts *= 1000; // seconds → ms
  if (!ts || isNaN(ts) || ts <= 0) ts = Date.now();
  return ts;
};

// ── Session name persistence (localStorage) ──────────────────────────────────

const NAMES_KEY = 'agent-platform-session-names';

const loadStoredNames = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY) ?? '{}'); } catch { return {}; }
};

const persistName = (sessionId: string, name: string) => {
  try {
    const names = loadStoredNames();
    names[sessionId] = name;
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch { /* ignore */ }
};

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

/** Try to parse a string as a valid AgentJsonResponse with a `text` field. */
const tryParseAgentJson = (raw: string): { content: string; charts?: ChartData[] } | null => {
  try {
    const parsed: AgentJsonResponse = JSON.parse(raw.trim());
    if (!parsed || typeof parsed !== 'object' || parsed.text === undefined) return null;

    const result: { content: string; charts?: ChartData[] } = { content: parsed.text };

    if (parsed.visualization) {
      // Series charts carry `data`; heatmaps carry a correlation `matrix`.
      const viz = parsed.visualization;
      result.charts = Array.isArray(viz) ? viz : [viz];
    }
    return result;
  } catch {
    return null;
  }
};

const parseAgentResponse = (text: string): { content: string; charts?: ChartData[] } => {
  // Try the first balanced JSON object found anywhere in the response
  const jsonStr = extractFirstJsonObject(text);
  if (jsonStr) {
    const result = tryParseAgentJson(jsonStr);
    if (result) return result;
  }
  // Fallback: treat as plain text
  return { content: text };
};

// Helper function to convert ADK events to chat messages
const eventsToMessages = (events: AdkEvent[], supportsVisualization: boolean): ChatMessage[] => {
  return events
    .filter(event => event.content?.parts?.some(part => part.text))
    .map(event => {
      const part = event.content?.parts?.find(part => part.text);
      const rawText = part?.text || '';
      const parsedResponse = supportsVisualization
        ? parseAgentResponse(rawText)
        : { content: rawText, charts: undefined };
      return {
        id: event.id,
        content: parsedResponse.content,
        author: event.author,
        timestamp: normalizeTimestamp(event.timestamp),
        charts: parsedResponse.charts,
      };
    });
};

// Replace with auth to get userId
export function useChat(initialApp?: string, userId: string = 'user-1') {
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
  // Prevent the currentSession useEffect from overwriting messages that were
  // just parsed correctly by sendMessage (the session sync happens right after).
  const skipNextSessionSync = useRef(false);
  const supportsVisualization = selectedApp
    ? (getAgentConfiguration(selectedApp)?.supportsVisualization ?? false)
    : false;

  // Load stored session names from localStorage on mount
  useEffect(() => {
    setSessionNames(loadStoredNames());
  }, []);

  const saveSessionName = (sessionId: string, name: string) => {
    persistName(sessionId, name);
    setSessionNames(prev => ({ ...prev, [sessionId]: name }));
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

  const loadAvailableApps = async () => {
    try {
      setIsLoadingApps(true);
      console.log('Fetching available apps from ADK server...');
      const apps = await adkApi.listApps();
      console.log('Available apps:', apps);
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
      console.log(`Loading sessions for app: ${selectedApp}`);
      const sessionList = await adkApi.listSessions(selectedApp, userId);
      console.log('Sessions loaded:', sessionList);
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

      for await (const event of adkApi.sendMessageSSE(request)) {
        if (event.author && event.author !== 'user') agentAuthor = event.author;
        const textPart = event.content?.parts?.find(p => p.text);
        if (textPart?.text) {
          // partial === true → streaming delta, append.
          // partial === false / undefined (complete event) → full text, replace to avoid duplication.
          if (event.partial === true) {
            accumulated += textPart.text;
          } else {
            accumulated = textPart.text;
          }
          setMessages(prev =>
            prev.map(m =>
              m.id === streamingId ? { ...m, content: accumulated, author: agentAuthor } : m
            )
          );
        }
        if (event.turnComplete) break;
      }

      // Parse the completed response for charts / JSON wrapper
      const parsed = supportsVisualization
        ? parseAgentResponse(accumulated)
        : { content: accumulated, charts: undefined };
      setMessages(prev =>
        prev.map(m =>
          m.id === streamingId
            ? { ...m, content: parsed.content, charts: parsed.charts, isStreaming: false }
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
      setError(`Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setMessages(prev => prev.filter(m => m.id !== streamingId && m.id !== userMessage.id));
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

      // Remove the session from the local list
      setSessions(prev => prev.filter(session => session.id !== sessionId));

      // If the deleted session was the current one, clear it
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
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
