'use client';

// Session display names + AI-rename plumbing for the chat surface.
//   - `sessionNames` is loaded from the backend on app change.
//   - `saveSessionName` is the persistence primitive (optimistic).
//   - `markAiRenamed` flags ids whose new name was AI-generated so the UI
//      can type them out instead of popping them in.
//   - `renameSession` regenerates a name via the session-naming agent.
//
// Extracted from useChat because it's a self-contained naming concern with
// its own lifecycle (load-on-app-change + per-id mark-and-decay), and the
// auto-rename flow inside sendMessage just consumes the returned API.

import { useEffect, useState } from 'react';
import { adkApi, type Session } from '../lib/agent/adk-api';
import { sessionNamesApi } from '../lib/agent/session-names-api';
import type { ChatMessage } from '../lib/agent/events';

const NAMING_AGENT = 'session_naming_agent';

/** Render the recent message exchanges as a plain-text dump for the
 *  naming agent's prompt. Keeps the input small (≤8 messages × 300 chars). */
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

interface UseSessionNamesArgs {
  selectedApp: string | null;
  userId: string;
  /** Live message list for the current session — fed into the naming-agent
   *  prompt when the user manually rerolls a name. Accepts a value OR a
   *  getter; the getter form lets callers wire this up after the messages
   *  hook initialises so the closure isn't stale. */
  messages: ChatMessage[] | (() => ChatMessage[]);
  currentSession: Session | null | (() => Session | null);
  /** Full session list for the active app — used to fall back to persisted
   *  events when the in-memory message list isn't this session's. */
  sessions: Session[] | (() => Session[]);
  /** Setter for hidden-session ids, called by callers when this hook detects
   *  a server-side rename change. Not used today; reserved for symmetry with
   *  the parent hook's other concerns. Pass through unused if unneeded. */
  onSessionNamesLoaded?: (names: Record<string, string>, hidden: Set<string>) => void;
  /** Surface user-actionable rename failures into the chat error banner.
   *  Only fires for manual-rename errors (renameSession). Auto-rename
   *  failures stay silent — that's a decorative flow. */
  onError?: (message: string) => void;
}

export interface UseSessionNames {
  sessionNames: Record<string, string>;
  /** Session ids whose name was just AI-generated; auto-clears after the
   *  typing animation duration. Consumers render TypingName when membership
   *  is true. */
  aiRenamedIds: Set<string>;
  /** Persist a session display name. Optimistic — server write is fire-and-forget. */
  saveSessionName: (sessionId: string, name: string) => void;
  /** Flag a session as just-AI-renamed so the display layer types out the new
   *  name. Pair with `saveSessionName(id, name)` then `markAiRenamed(id, name)`. */
  markAiRenamed: (sessionId: string, name: string) => void;
  /** Regenerate a name via the session-naming agent. Returns the new name on
   *  success, `null` if the session has no usable history or the agent fails. */
  renameSession: (sessionId: string) => Promise<string | null>;
  /** Auto-rename from a single just-delivered exchange (user msg + agent reply).
   *  Used by the chat-stream code at message milestones (1, 10, 20, …) where
   *  the session's persisted events may not yet include this turn.
   *  Retries once on empty replies (Gemini occasionally truncates 2-6 word
   *  titles to nothing). Errors are logged, not thrown — naming failures
   *  shouldn't break the chat flow. */
  autoRenameFromExchange: (sessionId: string, userMsg: string, agentMsg: string) => Promise<void>;
  /** Direct setter for the names map — the parent hook uses this when pruning
   *  stale empty sessions. */
  setSessionNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** Hidden-session ids — soft-deletes the user did. Loaded from the same
   *  endpoint as names. */
  hiddenSessions: Set<string>;
  setHiddenSessions: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useSessionNames({
  selectedApp,
  userId,
  messages,
  currentSession,
  sessions,
  onError,
}: UseSessionNamesArgs): UseSessionNames {
  const readMessages = (): ChatMessage[] =>
    typeof messages === 'function' ? messages() : messages;
  const readCurrentSession = (): Session | null =>
    typeof currentSession === 'function' ? currentSession() : currentSession;
  const readSessions = (): Session[] =>
    typeof sessions === 'function' ? sessions() : sessions;
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  const [hiddenSessions, setHiddenSessions] = useState<Set<string>>(new Set());
  const [aiRenamedIds, setAiRenamedIds] = useState<Set<string>>(new Set());

  // Load saved metadata (names + hidden ids) whenever the app changes.
  useEffect(() => {
    if (!selectedApp) {
      setSessionNames({});
      setHiddenSessions(new Set());
      return;
    }
    let cancelled = false;
    sessionNamesApi
      .list(selectedApp, userId)
      .then((meta) => {
        if (cancelled) return;
        setSessionNames(meta.names);
        setHiddenSessions(new Set(meta.hidden));
      })
      .catch((err) => {
        if (cancelled) return;
        // We still clear local state so the UI doesn't show stale data from
        // a previous app — log so a session-names endpoint regression is
        // visible instead of looking like "no saved names yet".
        console.warn('[useSessionNames] failed to load for', selectedApp, err);
        setSessionNames({});
        setHiddenSessions(new Set());
      });
    return () => { cancelled = true; };
  }, [selectedApp, userId]);

  const saveSessionName = (sessionId: string, name: string) => {
    setSessionNames((prev) => ({ ...prev, [sessionId]: name }));
    if (selectedApp) {
      sessionNamesApi.set(selectedApp, sessionId, name, userId).catch((err) => {
        // Optimistic — local rename stands; log so we notice when the
        // server write quietly stops working.
        console.warn('[useSessionNames] failed to persist', sessionId, err);
      });
    }
  };

  const markAiRenamed = (sessionId: string, name: string) => {
    setAiRenamedIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    // Clear after the TypingName animation completes (≈32ms/char + headroom).
    const ms = Math.max(800, name.length * 32 + 500);
    window.setTimeout(() => {
      setAiRenamedIds((prev) => {
        if (!prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }, ms);
  };

  const renameSession = async (sessionId: string): Promise<string | null> => {
    if (!selectedApp) return null;
    try {
      const sessionsList = readSessions();
      const session = sessionsList.find((s) => s.id === sessionId);
      if (!session) return null;

      // Session lists can carry lightweight metadata only — pull full events
      // when the in-memory list lacks them.
      let sourceEvents = session.events ?? [];
      if (!sourceEvents.some((e) => e.content?.parts?.some((p) => p.text))) {
        try {
          const fullSession = await adkApi.getSession(selectedApp, userId, sessionId);
          sourceEvents = fullSession.events ?? [];
        } catch (err) {
          // Best-effort enrichment — falls back to in-memory messages below.
          console.warn('[useSessionNames] getSession failed for', sessionId, err);
        }
      }

      const textEvents = sourceEvents.filter((e) =>
        e.content?.parts?.some((p) => p.text),
      );
      let msgs = textEvents.slice(0, 8).map((e) => ({
        content: e.content!.parts.find((p) => p.text)!.text!.slice(0, 300),
        role: (e.author === 'user' ? 'user' : 'model') as 'user' | 'model',
      }));

      // Fallback to in-memory rendered messages if session events are empty.
      const cur = readCurrentSession();
      if (msgs.length === 0 && cur?.id === sessionId) {
        msgs = readMessages()
          .filter((m) => m.content?.trim())
          .slice(0, 8)
          .map((m) => ({
            content: m.content.slice(0, 300),
            role: (m.author === 'user' ? 'user' : 'model') as 'user' | 'model',
          }));
      }

      if (msgs.length === 0) return null;
      const reply = await adkApi.runOneShot(NAMING_AGENT, userId, namingPrompt(msgs));
      const name = cleanName(reply);
      if (!name) return null;
      saveSessionName(sessionId, name);
      markAiRenamed(sessionId, name);
      return name;
    } catch (err) {
      console.warn('[useSessionNames] renameSession failed for', sessionId, err);
      onError?.(`Failed to rename session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  };

  const autoRenameFromExchange = async (
    sessionId: string,
    userMsg: string,
    agentMsg: string,
  ): Promise<void> => {
    const prompt = namingPrompt([
      { content: userMsg, role: 'user' },
      { content: agentMsg.slice(0, 300), role: 'model' },
    ]);
    const tryOnce = async (): Promise<string> => {
      const reply = await adkApi.runOneShot(NAMING_AGENT, userId, prompt);
      return cleanName(reply);
    };
    try {
      let name = await tryOnce();
      // Empty replies get ONE retry — Gemini occasionally truncates a short
      // title to nothing.
      if (!name || name.length < 2) name = await tryOnce();
      if (name) {
        saveSessionName(sessionId, name);
        markAiRenamed(sessionId, name);
      } else {
        console.warn('[useSessionNames] auto-rename returned empty after retry');
      }
    } catch (err) {
      // Naming is decorative — don't break the chat flow if it fails.
      console.warn('[useSessionNames] auto-rename failed', err);
    }
  };

  return {
    sessionNames,
    aiRenamedIds,
    saveSessionName,
    markAiRenamed,
    renameSession,
    autoRenameFromExchange,
    setSessionNames,
    hiddenSessions,
    setHiddenSessions,
  };
}
