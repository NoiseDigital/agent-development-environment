'use client';

import { useState } from 'react';
import { Session } from '../../lib/agent/adk-api';

// Borderless centred input. Sits in a soft, faded gradient at the page
// bottom so the input area reads as part of the chat surface — no visible
// hairline between the message list and the composer.

interface MessageInputProps {
  selectedApp: string | null;
  currentSession: Session | null;
  isLoading: boolean;
  onSendMessage: (message: string) => Promise<void>;
}

export default function MessageInput({
  selectedApp,
  currentSession,
  isLoading,
  onSendMessage,
}: MessageInputProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [justSent, setJustSent] = useState(false);

  const disabled = isLoading || !selectedApp || !currentSession;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || disabled) return;
    const text = inputMessage;
    setInputMessage('');
    setJustSent(true);
    window.setTimeout(() => setJustSent(false), 1500);
    await onSendMessage(text);
  };

  return (
    // The input shares the page's radial-wash backdrop with the message list
    // above — no veil, no opaque divider, no hairline. Visual weight on the
    // input pill comes from its own backdrop-blur + ring + shadow.
    <div className="pointer-events-none relative">
      <div className="pointer-events-auto px-4 pb-6 pt-2">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl">
          <div
            className={`group relative flex items-center gap-2 rounded-full bg-surface/60 pl-5 pr-2 py-2 backdrop-blur-md transition-all duration-300 ring-1 ring-white/5 focus-within:ring-white/15 focus-within:bg-surface/80 ${
              justSent ? 'shadow-[0_0_36px_-4px_rgba(255,255,255,0.22)]' : 'shadow-[0_8px_30px_-12px_rgba(0,0,0,0.7)]'
            }`}
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={selectedApp && currentSession ? 'Send Message…' : 'Select an agent to start…'}
              disabled={disabled}
              className="flex-1 bg-transparent text-sm text-foreground placeholder-faint outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || !inputMessage.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inverse text-inverse-foreground transition-all duration-200 hover:bg-inverse/90 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
          {/* Subtle, persistent AI-fallibility disclaimer — small and out of the
              way, but always visible beneath the composer. */}
          <p className="mt-2 text-center text-[10px] leading-none text-disabled select-none">
            Generative AI can make mistakes, review responses thoroughly.
          </p>
        </form>
      </div>
    </div>
  );
}
