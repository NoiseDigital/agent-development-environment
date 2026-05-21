'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useChat } from '../hooks/useChat';

// useChat is instantiated once per agent, here, by the chat/[agentId] layout —
// so the agent's index page and its session pages share one instance instead
// of each re-fetching apps + sessions on every navigation between them.

type ChatValue = ReturnType<typeof useChat>;

const ChatContext = createContext<ChatValue | null>(null);

export function ChatProvider({ agentId, children }: { agentId: string; children: ReactNode }) {
  const chat = useChat(agentId);
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within a ChatProvider');
  return ctx;
}
