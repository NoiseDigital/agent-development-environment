'use client';

// Session ownership + lifecycle for the chat surface.
//   - Owns the raw ADK session list + the currently-selected session.
//   - Owns the soft-delete (hidden) set + the "fresh, unused" ledger used by
//     the new-chat cleanup flow.
//   - Owns the startup prune effect (drop zero-event sessions left behind
//     by previous tabs).
//   - Exposes setters so the streaming layer can refresh a session after an
//     SSE turn lands.
//
// Extracted from useChat to separate the "what sessions exist + which is
// active" concern from the SSE / stream / message-projection concern.

import { useEffect, useRef, useState } from 'react';
import { adkApi, type Session } from '../lib/agent/adk-api';
import { track } from '../lib/analytics/track';
import { feedbackApi } from '../lib/agent/feedback-api';
import { sessionNamesApi } from '../lib/agent/session-names-api';
import { newId } from '../lib/id';

interface UseSessionsArgs {
  selectedApp: string | null;
  userId: string;
  /** Soft-delete set sourced from the names hook (round-trips through the
   *  backend so a hide survives across tabs/devices). Passed in so this hook
   *  can update it on hard-delete fallback and read it for the prune logic. */
  hiddenSessions: Set<string>;
  setHiddenSessions: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Surface user-actionable session errors into the chat error banner. */
  onError: (message: string) => void;
}

export interface UseSessions {
  /** Public list — hidden ids filtered out. */
  sessions: Session[];
  /** Raw list including hidden — needed by the naming hook for events lookup. */
  allSessions: Session[];
  currentSession: Session | null;
  isLoadingSessions: boolean;
  /** Sessions we CREATED in this tab and have NOT yet sent a message through.
   *  Only ids in this set are eligible for auto-deletion on the next "new
   *  chat" click. Used by the streaming layer to "graduate" the active
   *  session off the ledger once a message goes out. */
  localFreshSessions: React.MutableRefObject<Set<string>>;
  /** Direct setters exposed for the streaming layer's refetch path. */
  setAllSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setCurrentSession: React.Dispatch<React.SetStateAction<Session | null>>;
  /** `appOverride` lets the caller create a session under a specific app even
   *  when `selectedApp` state hasn't yet committed (FloatingAssistant agent
   *  swap on edit-mode toggle). */
  createNewSession: (appOverride?: string) => Promise<Session | null>;
  selectSession: (sessionId: string) => Promise<void>;
  /** Soft-delete — the ADK row stays; UI just stops showing it. */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Refresh the session list against the agent service. */
  refreshSessions: () => Promise<void>;
}

export function useSessions({
  selectedApp,
  userId,
  hiddenSessions,
  setHiddenSessions,
  onError,
}: UseSessionsArgs): UseSessions {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  // Sessions WE created in this tab + haven't sent a message through. Only
  // these are ever eligible for auto-deletion. Anything else is permanent
  // until the user explicitly deletes it.
  const localFreshSessions = useRef<Set<string>>(new Set());

  // Load sessions when app changes — no currentSession dep to avoid re-fetch
  // loops. After the listing arrives we also prune sessions with zero events
  // (stale "New chat" placeholders left behind by previous tabs); a session
  // that has any message at all is never touched.
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
        // cap the getSession fan-out to a reasonable number and only act on
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
              // Best-effort — leave the session intact on failure, but log
              // so a regression in getSession/deleteSession doesn't go silent.
              console.warn('[useSessions.startup-prune] check failed for', s.id, err);
            }
          }),
        );
        if (!cancelled && prunedIds.length > 0) {
          setAllSessions((cur) => cur.filter((s) => !prunedIds.includes(s.id)));
          for (const id of prunedIds) localFreshSessions.current.delete(id);
        }
      } catch (err) {
        if (!cancelled) onError(`Failed to load sessions: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        if (!cancelled) setIsLoadingSessions(false);
      }
    };
    loadSessionsForApp();
    return () => { cancelled = true; };
  }, [selectedApp, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The public list — soft-deleted ids are filtered out so the UI never shows
  // them, while the backing rows survive for potential restore.
  const sessions = allSessions.filter((s) => !hiddenSessions.has(s.id));

  // Hard-delete only the sessions on the local fresh-sessions ledger — ones
  // WE created in this tab that have never had a message sent through them.
  // This is the only safe definition (listSessions doesn't carry events, and
  // a previous bug here wiped the whole sidebar on every "new chat" click).
  const cleanupFreshUnusedSessions = async (app: string): Promise<string[]> => {
    const ids = Array.from(localFreshSessions.current);
    if (ids.length === 0) return [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          await adkApi.deleteSession(app, userId, id);
          // Best-effort companion cleanups — log per-id so a regression
          // doesn't silently leak metadata over time.
          sessionNamesApi.remove(app, id, userId).catch((err) =>
            console.warn('[useSessions.prune] session-name cleanup failed for', id, err),
          );
          feedbackApi.clearSession(app, id, userId).catch((err) =>
            console.warn('[useSessions.prune] feedback cleanup failed for', id, err),
          );
        } catch (err) {
          // The session itself failed to delete — keep the loop going so a
          // single bad id doesn't block the new-chat flow.
          console.warn('[useSessions.prune] session delete failed for', id, err);
        }
      }),
    );
    localFreshSessions.current = new Set();
    return ids;
  };

  const createNewSession = async (appOverride?: string): Promise<Session | null> => {
    const app = appOverride ?? selectedApp;
    if (!app) return null;
    try {
      const cleanedIds = await cleanupFreshUnusedSessions(app);
      // URL routes /chat/<agent>/<id>; the id itself is just a uuid.
      const sessionId = newId();
      const newSession = await adkApi.createSession(app, userId, sessionId);
      // Mark the new session "fresh, unused" — graduates off when sendMessage runs.
      localFreshSessions.current.add(newSession.id);
      setAllSessions((prev) => [
        newSession,
        ...prev.filter((s) => !cleanedIds.includes(s.id)),
      ]);
      setCurrentSession(newSession);
      track('new_conversation', { app });
      return newSession;
    } catch (err) {
      onError(`Failed to create session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  };

  const selectSession = async (sessionId: string): Promise<void> => {
    if (!selectedApp) return;
    // Don't reopen a soft-deleted session.
    if (hiddenSessions.has(sessionId)) {
      setCurrentSession(null);
      return;
    }
    try {
      const session = await adkApi.getSession(selectedApp, userId, sessionId);
      setCurrentSession(session);
    } catch (err) {
      onError(`Failed to select session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    if (!selectedApp) return;
    // Optimistic — hide locally first so the UI updates immediately.
    setHiddenSessions((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
    }
    try {
      await sessionNamesApi.hide(selectedApp, sessionId, userId);
    } catch (err) {
      // Roll back the optimistic hide so the user can retry.
      setHiddenSessions((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      onError(`Failed to delete session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const refreshSessions = async (): Promise<void> => {
    if (!selectedApp) return;
    try {
      const sessionList = await adkApi.listSessions(selectedApp, userId);
      setAllSessions(sessionList);
      const visible = sessionList.filter((s) => !hiddenSessions.has(s.id));
      if (!currentSession && visible.length > 0) {
        setCurrentSession(visible[0]);
      }
    } catch (err) {
      onError(`Failed to load sessions: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return {
    sessions,
    allSessions,
    currentSession,
    isLoadingSessions,
    localFreshSessions,
    setAllSessions,
    setCurrentSession,
    createNewSession,
    selectSession,
    deleteSession,
    refreshSessions,
  };
}
