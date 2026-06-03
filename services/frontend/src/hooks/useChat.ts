'use client';

// Chat surface glue.
//   - Owns app selection (which agent the chat surface is bound to).
//   - Wires together: useSessions (ownership) + useChatStream (SSE +
//     messages) + useChatFeedback (per-message ratings) + useSessionNames
//     (display names + AI rename). Each concern is its own hook; this file
//     is just glue.
//   - Mirrors the consumer-facing API the chat UI has used historically so
//     the surface stays a one-import dependency.

import { useEffect, useRef, useState } from 'react';
import { adkApi, type Session } from '../lib/agent/adk-api';
import { getAgentConfiguration } from '../config/agent-config';
import { getCurrentUser } from '../lib/auth';
import {
  type ChatMessage,
  type ToolCall,
} from '../lib/agent/events';
import { useChatFeedback } from './useChatFeedback';
import { useChatStream } from './useChatStream';
import { useSessionNames } from './useSessionNames';
import { useSessions } from './useSessions';

export type { ChatMessage, ToolCall };

// Identity comes from the auth seam (lib/auth) — a fixed dev user today, the
// Firebase user once auth is live. Callers may still override `userId` for tests.
export function useChat(initialApp?: string, userId: string = getCurrentUser().uid) {
  const [availableApps, setAvailableApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(initialApp ?? null);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supportsVisualization = selectedApp
    ? (getAgentConfiguration(selectedApp)?.supportsVisualization ?? false)
    : false;

  // Session naming + AI-rename animation flag. Lives upstream of the
  // sessions hook because it owns the hidden-sessions set (loaded from the
  // backend on app change) which sessions consumes.
  //
  // The `messages` / `currentSession` / `sessions` args are getters because
  // the naming hook is called BEFORE the sessions + stream hooks (they need
  // hiddenSessions from naming). Getters let renameSession read live state
  // from those hooks at call time without a circular dependency.
  const liveMessagesRef = useRef<ChatMessage[]>([]);
  const liveSessionRef = useRef<Session | null>(null);
  const liveSessionsRef = useRef<Session[]>([]);
  const naming = useSessionNames({
    selectedApp,
    userId,
    messages: () => liveMessagesRef.current,
    currentSession: () => liveSessionRef.current,
    sessions: () => liveSessionsRef.current,
    onError: setError,
  });

  // Session list / current selection / CRUD. Reads the hidden set from
  // naming; the streaming layer writes back through the setters it returns.
  const sessionsHook = useSessions({
    selectedApp,
    userId,
    hiddenSessions: naming.hiddenSessions,
    setHiddenSessions: naming.setHiddenSessions,
    onError: setError,
  });

  // SSE + messages projection. Writes session updates back through the
  // sessions hook's setters.
  const stream = useChatStream({
    selectedApp,
    userId,
    currentSession: sessionsHook.currentSession,
    supportsVisualization,
    setAllSessions: sessionsHook.setAllSessions,
    setCurrentSession: sessionsHook.setCurrentSession,
    localFreshSessions: sessionsHook.localFreshSessions,
    autoRenameFromExchange: naming.autoRenameFromExchange,
    onError: setError,
  });

  // Keep the live-state refs in sync so naming.renameSession can read
  // fresh values when invoked. (Cheap; just pointer writes.)
  liveMessagesRef.current = stream.messages;
  liveSessionRef.current = sessionsHook.currentSession;
  liveSessionsRef.current = sessionsHook.allSessions;

  // Per-message feedback (thumb ratings).
  const { feedback, rateMessage } = useChatFeedback({
    selectedApp,
    currentSession: sessionsHook.currentSession,
    userId,
  });

  // Load available apps on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoadingApps(true);
        const apps = await adkApi.listApps();
        if (!cancelled) setAvailableApps(apps);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load apps:', err);
          setError(`Failed to load available apps: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      } finally {
        if (!cancelled) setIsLoadingApps(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // React to `initialApp` changes (FloatingAssistant swaps agents on edit-
  // mode toggle). Drop everything tied to the previous app — the new one
  // spawns its own session via the consumer's mount effect.
  useEffect(() => {
    if (!initialApp || initialApp === selectedApp) return;
    setSelectedApp(initialApp);
    sessionsHook.setCurrentSession(null);
    setError(null);
  }, [initialApp, selectedApp]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAvailableApps = async () => {
    try {
      setIsLoadingApps(true);
      const apps = await adkApi.listApps();
      setAvailableApps(apps);
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

  return {
    availableApps,
    selectedApp,
    setSelectedApp,
    sessions: sessionsHook.sessions,
    currentSession: sessionsHook.currentSession,
    messages: stream.messages,
    isLoading: stream.isLoading,
    isLoadingApps,
    isLoadingSessions: sessionsHook.isLoadingSessions,
    error,
    sessionNames: naming.sessionNames,
    /** Session ids whose name was just AI-generated. Consumers gate the
     *  typing animation on membership in this set; it auto-clears after the
     *  animation duration. */
    aiRenamedIds: naming.aiRenamedIds,
    feedback,
    rateMessage,
    supportsVisualization,
    sendMessage: stream.sendMessage,
    createNewSession: sessionsHook.createNewSession,
    selectSession: sessionsHook.selectSession,
    deleteSession: sessionsHook.deleteSession,
    renameSession: naming.renameSession,
    saveSessionName: naming.saveSessionName,
    refreshSessions: sessionsHook.refreshSessions,
    refreshApps: loadAvailableApps,
  };
}
