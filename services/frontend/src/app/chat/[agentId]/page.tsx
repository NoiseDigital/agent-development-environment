'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useChat } from '../../../hooks/useChat';

/**
 * /chat/[agentId] — redirects to the most recent session for that agent,
 * or creates a new one if coming from the library (?new=1) or none exist.
 */
export default function AgentIndexPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = typeof params.agentId === 'string' ? params.agentId : '';
  const didInit = useRef(false);

  const { selectedApp, sessions, isLoadingApps, isLoadingSessions, availableApps, createNewSession } = useChat(agentId);

  useEffect(() => {
    // Wait for both apps and sessions to finish loading
    if (!selectedApp || isLoadingApps || isLoadingSessions) return;
    // Only run once — createNewSession changes sessions.length which would re-fire without this guard
    if (didInit.current) return;
    didInit.current = true;

    // Unknown agent → back to library
    if (availableApps.length > 0 && !availableApps.includes(agentId)) {
      router.replace('/agents');
      return;
    }

    const wantsNew = searchParams.get('new') === '1';

    if (wantsNew || sessions.length === 0) {
      createNewSession().then(s => {
        if (s) router.replace(`/chat/${agentId}/${s.id}`);
      });
    } else {
      router.replace(`/chat/${agentId}/${sessions[0].id}`);
    }
  }, [selectedApp, isLoadingApps, isLoadingSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // pure redirect — renders nothing
}
