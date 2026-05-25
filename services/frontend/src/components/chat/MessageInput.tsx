'use client';

import { useState } from 'react';
import { Session } from '../../lib/adk-api';

// Centered, floating message bar — single rounded pill that hovers above the
// page surface with a soft glow that pulses on send. The container is the
// entire row; the input + the send button sit inside one pill so the visual
// reads as one element. Width is centered and capped (max-w-2xl) so the bar
// holds its proportions on wide screens; on narrow screens it stretches.

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
  // Brief send-glow pulse so the user gets visual confirmation a message
  // left the bar. Triggers on submit, decays via a CSS transition.
  const [justSent, setJustSent] = useState(false);

  const disabled = isLoading || !selectedApp || !currentSession;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || disabled) return;
    const text = inputMessage;
    setInputMessage('');
    setJustSent(true);
    window.setTimeout(() => setJustSent(false), 700);
    await onSendMessage(text);
  };

  return (
    <div className="relative px-4 pb-6 pt-2">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-2xl"
      >
        <div
          className={`group relative flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 pl-5 pr-2 py-2 backdrop-blur-md transition-all duration-300 focus-within:border-zinc-600 focus-within:bg-zinc-950 ${
            justSent ? 'shadow-[0_0_30px_-2px_rgba(255,255,255,0.18)]' : 'shadow-[0_4px_24px_-8px_rgba(0,0,0,0.6)]'
          }`}
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={selectedApp && currentSession ? 'Send Message…' : 'Select an agent to start…'}
            disabled={disabled}
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || !inputMessage.trim()}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all duration-200 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
