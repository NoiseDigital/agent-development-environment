'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChatContext } from '../../../contexts/ChatContext';
import type { Session } from '../../../lib/adk-api';

/**
 * /chat/[agentId] — picks a session for the agent:
 * resume the most recent chat if it saw activity within RESUME_WINDOW,
 * otherwise start a fresh one. So a returning user lands in their active
 * conversation unless they've been dormant for a while.
 */
const RESUME_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

function lastActivityMs(session: Session): number {
  let ts = session.lastUpdateTime || 0;
  if (ts > 0 && ts < 1_000_000_000_000) ts *= 1000; // ADK reports seconds
  return ts;
}

export default function AgentIndexPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = typeof params.agentId === 'string' ? params.agentId : '';
  const didInit = useRef(false);

  const { selectedApp, sessions, isLoadingApps, isLoadingSessions, availableApps, createNewSession } =
    useChatContext();

  useEffect(() => {
    // Wait for both apps and sessions to finish loading.
    if (!selectedApp || isLoadingApps || isLoadingSessions) return;
    // Run once — createNewSession changes sessions.length which would re-fire.
    if (didInit.current) return;
    didInit.current = true;

    // Unknown agent → back to library.
    if (availableApps.length > 0 && !availableApps.includes(agentId)) {
      router.replace('/agents');
      return;
    }

    const mostRecent = sessions.reduce<Session | null>(
      (best, s) => (!best || lastActivityMs(s) > lastActivityMs(best) ? s : best),
      null,
    );
    const resumable =
      mostRecent !== null && Date.now() - lastActivityMs(mostRecent) < RESUME_WINDOW_MS;

    if (mostRecent && resumable) {
      router.replace(`/chat/${agentId}/${mostRecent.id}`);
    } else {
      createNewSession().then((s) => {
        if (s) router.replace(`/chat/${agentId}/${s.id}`);
      });
    }
  }, [selectedApp, isLoadingApps, isLoadingSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // pure redirect — renders nothing
}
