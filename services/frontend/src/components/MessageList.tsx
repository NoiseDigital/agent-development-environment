'use client';

import { useRef, useEffect, useState } from 'react';
import { getAgentConfiguration } from '../config/agent-config';
import ChatMessage from './ChatMessage';
import type { ChatMessage as ChatMessageData } from '../hooks/useChat';

// MessageList — the full-height chat transcript. Owns scroll behaviour and the
// cycling "thinking" verb; each row is rendered by the shared ChatMessage.

interface MessageListProps {
  messages: ChatMessageData[];
  selectedApp?: string | null;
  supportsVisualization?: boolean;
}

const THINKING_VERBS = [
  'Thinking', 'Analyzing', 'Reasoning', 'Researching', 'Processing',
  'Synthesizing', 'Exploring', 'Calculating', 'Reviewing', 'Crafting',
  'Connecting the dots', 'Consulting the oracle', 'Digging in',
  'On it', 'Unpacking that', 'Investigating',
];

export default function MessageList({ messages, selectedApp, supportsVisualization = false }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMsgRef = useRef<HTMLDivElement>(null);
  const lastStreamingId = useRef<string | null>(null);
  const prevLengthRef = useRef(messages.length);
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

  // When a new streaming message starts, scroll its top into view so the user
  // can read from the beginning as tokens arrive. Don't force-scroll to bottom
  // during streaming — let the user read at their own pace.
  useEffect(() => {
    const streamingMsg = messages.find(m => m.isStreaming);

    if (streamingMsg) {
      if (streamingMsg.id !== lastStreamingId.current) {
        // New streaming message just appeared — scroll to its top
        lastStreamingId.current = streamingMsg.id;
        setTimeout(() => {
          streamingMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
      // While streaming, don't scroll further
    } else {
      lastStreamingId.current = null;
    }
  }, [messages]);

  // Scroll to bottom only when the user sends a message (last message is from user)
  useEffect(() => {
    const added = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (added && messages[messages.length - 1]?.author === 'user') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Get agent configuration for display
  const agentConfig = selectedApp ? getAgentConfiguration(selectedApp) : null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5 bg-black">
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
        messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            variant="panel"
            showCharts={supportsVisualization}
            loadingLabel={THINKING_VERBS[verbIndex]}
            rowRef={message.isStreaming ? streamingMsgRef : undefined}
          />
        ))
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
