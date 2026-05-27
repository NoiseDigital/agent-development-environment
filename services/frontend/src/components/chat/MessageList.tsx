'use client';

import { useRef, useEffect, useState } from 'react';
import { getAgentConfiguration } from '../../config/agent-config';
import ChatMessage from './ChatMessage';
import type { ChatMessage as ChatMessageData } from '../../hooks/useChat';
import { useChatAutoScroll } from '../../hooks/useChatAutoScroll';
import type { Rating } from '../../lib/feedback-api';

// MessageList — the full-height chat transcript. Owns scroll behaviour and the
// cycling "thinking" verb; each row is rendered by the shared ChatMessage.

interface MessageListProps {
  messages: ChatMessageData[];
  selectedApp?: string | null;
  supportsVisualization?: boolean;
  /** Thumb ratings for the session, keyed by ADK event id. */
  feedback?: Record<string, Rating>;
  /** Set or clear (null) a message's rating. */
  onRate?: (eventId: string, rating: Rating | null) => void;
  /** Send a message back to the agent — used by interactive UI blocks. */
  onAction?: (text: string) => void;
}

const THINKING_VERBS = [
  'Thinking', 'Analyzing', 'Reasoning', 'Researching', 'Processing',
  'Synthesizing', 'Exploring', 'Calculating', 'Reviewing', 'Crafting',
  'Connecting the dots', 'Consulting the oracle', 'Digging in',
  'On it', 'Unpacking that', 'Investigating',
];

export default function MessageList({
  messages,
  selectedApp,
  supportsVisualization = false,
  feedback,
  onRate,
  onAction,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);
  const [verbIndex, setVerbIndex] = useState(0);

  // Cycle verbs while any message is loading
  const isLoading = messages.some(m => m.isStreaming && m.content === '');
  useEffect(() => {
    if (!isLoading) return;
    setVerbIndex(Math.floor(Math.random() * THINKING_VERBS.length));
    const id = setInterval(() => {
      setVerbIndex(i => (i + 1) % THINKING_VERBS.length);
    }, 1800);
    return () => clearInterval(id);
  }, [isLoading]);

  // All four scroll behaviours — session-load jump, send-pin, top-of-reply,
  // and sticky-stream — live in the shared hook so the floating assistant
  // can mirror them exactly.
  useChatAutoScroll({ containerRef, endRef: messagesEndRef, lastMsgRef, messages });

  // Get agent configuration for display
  const agentConfig = selectedApp ? getAgentConfiguration(selectedApp) : null;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
      {messages.length === 0 ? (
        <div className="flex justify-center items-center h-full">
          <div className="text-center max-w-sm mx-auto">
            <div className="w-14 h-14 mx-auto mb-5 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
              {agentConfig?.icon || (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              )}
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {agentConfig?.displayName || 'Assistant'}
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              {agentConfig?.description || 'Start a conversation by typing a message below.'}
            </p>
          </div>
        </div>
      ) : (
        messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            variant="panel"
            showUi={supportsVisualization}
            loadingLabel={THINKING_VERBS[verbIndex]}
            rowRef={index === messages.length - 1 ? lastMsgRef : undefined}
            rating={feedback?.[message.id] ?? null}
            onRate={onRate ? (rating) => onRate(message.id, rating) : undefined}
            onAction={onAction}
          />
        ))
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
