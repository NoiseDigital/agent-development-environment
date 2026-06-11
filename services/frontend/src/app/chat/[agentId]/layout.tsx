'use client';

import { useParams } from 'next/navigation';
import { ChatProvider } from '../../../contexts/ChatContext';

// One ChatProvider per agent. `key={agentId}` re-initialises useChat when the
// user switches agents, but keeps it shared across the agent's index and
// session pages so they don't each re-fetch apps + sessions.
export default function ChatAgentLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const agentId = typeof params.agentId === 'string' ? params.agentId : '';
  return (
    <ChatProvider key={agentId} agentId={agentId}>
      {children}
    </ChatProvider>
  );
}
