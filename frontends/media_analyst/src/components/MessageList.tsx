'use client';

import { useRef, useEffect } from 'react';
import { getAgentConfiguration } from '../config/agentConfig';

interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  selectedApp?: string | null;
}

export default function MessageList({ messages, isLoading, selectedApp }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get agent configuration for display
  const agentConfig = selectedApp ? getAgentConfiguration(selectedApp) : null;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-black">
      {messages.length === 0 ? (
        <div className="flex justify-center items-center h-full">
          <div className="text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 mx-auto mb-6 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                {agentConfig?.icon || (
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                )}
              </div>
              <h3 className="text-xl font-medium text-white mb-3">
                Welcome to {agentConfig?.displayName || 'Assistant'}
              </h3>
              <p className="text-zinc-400 leading-relaxed">
                {agentConfig?.description || 'Start a conversation by typing a message below. I\'m here to help you with your tasks.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.author === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
              message.author === 'user'
                ? 'bg-zinc-900 text-white border border-zinc-800'
                : 'bg-zinc-800 text-white border border-zinc-700'
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              <p className={`text-xs mt-2 ${
                message.author === 'user'
                  ? 'text-zinc-400'
                  : 'text-zinc-500'
              }`}>
                {formatTimestamp(message.timestamp)}
              </p>
            </div>
          </div>
        ))
      )}
      
      {isLoading && (
        <div className="flex justify-start">
          <div className="max-w-xs lg:max-w-md px-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700">
            <div className="flex items-center space-x-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
              <span className="text-zinc-400 text-sm">Thinking...</span>
            </div>
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
}
