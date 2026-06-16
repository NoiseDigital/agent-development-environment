'use client';

import { Session } from '../../lib/agent/adk-api';
import { getAgentConfiguration } from '../../config/agent-config';
import TypingName from './TypingName';

interface ChatHeaderProps {
  selectedApp: string | null;
  currentSession: Session | null;
  error: string | null;
  sessionNames?: Record<string, string>;
  /** Session ids whose name was just AI-generated — the header types out
   *  the name char-by-char while membership lasts. */
  aiRenamedIds?: Set<string>;
}

export default function ChatHeader({
  selectedApp,
  currentSession,
  error,
  sessionNames = {},
  aiRenamedIds,
}: ChatHeaderProps) {
  const agentConfig = selectedApp ? getAgentConfiguration(selectedApp) : null;
  const sessionLabel = currentSession
    ? (sessionNames[currentSession.id] || agentConfig?.displayName || '')
    : (agentConfig?.displayName || '');
  // Only the active session's name should type — the header has one slot.
  const animateLabel =
    !!currentSession &&
    !!aiRenamedIds?.has(currentSession.id) &&
    sessionLabel === sessionNames[currentSession.id];

  return (
    <div className="px-4 h-14 shrink-0 border-b border-line/60 bg-canvas flex items-center">
      <div className="flex items-center gap-3">
        {selectedApp && sessionLabel && (
          <h2 className="text-sm font-medium text-foreground truncate">
            <TypingName name={sessionLabel} animate={animateLabel} />
          </h2>
        )}
      </div>

      {error && (
        <div className="mt-2 p-3 bg-danger/10 border border-danger/30 rounded-xl">
          <div className="text-danger text-sm">{error}</div>
        </div>
      )}
    </div>
  );
}
