'use client';

import { useState } from 'react';
import { Session } from '../lib/adk-api';

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
  onSendMessage 
}: MessageInputProps) {
  const [inputMessage, setInputMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || !selectedApp || !currentSession) return;
    
    await onSendMessage(inputMessage);
    setInputMessage('');
  };

  return (
    <div className="border-t border-zinc-800 p-6 bg-black">
      <form onSubmit={handleSubmit} className="flex space-x-3">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={selectedApp && currentSession ? "Type your message..." : "Select an agent and create a session first..."}
          disabled={isLoading || !selectedApp || !currentSession}
          className="flex-1 px-4 py-3 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        />
        <button
          type="submit"
          disabled={isLoading || !inputMessage.trim() || !selectedApp || !currentSession}
          className="px-6 py-3 bg-zinc-900 text-white rounded-2xl hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-800 transition-all duration-200 font-medium"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
