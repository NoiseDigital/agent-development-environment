'use client';

import Image from 'next/image';
import { Session } from '../lib/adk-api';
import { getAgentConfiguration } from '../config/agentConfig';

// Helper function to normalize timestamps (same as in useChat.ts)
const normalizeTimestamp = (timestamp: number | string): number => {
  let normalizedTimestamp = timestamp;
  
  // If timestamp is a string, try to parse it
  if (typeof normalizedTimestamp === 'string') {
    normalizedTimestamp = new Date(normalizedTimestamp).getTime();
  }
  
  // If timestamp seems to be in seconds instead of milliseconds (Unix timestamp)
  if (normalizedTimestamp < 1000000000000) { // Less than year 2001 in milliseconds
    normalizedTimestamp = normalizedTimestamp * 1000;
  }
  
  // Fallback to current time if timestamp is invalid
  if (!normalizedTimestamp || isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
    console.warn('Invalid timestamp detected, using current time:', timestamp);
    normalizedTimestamp = Date.now();
  }
  
  return normalizedTimestamp;
};

interface ChatSidebarProps {
  availableApps: string[];
  selectedApp: string | null;
  setSelectedApp: (app: string) => void;
  sessions: Session[];
  currentSession: Session | null;
  isLoadingApps: boolean;
  createNewSession: () => void;
  selectSession: (sessionId: string) => void;
  onBackToLibrary?: () => void;
}

export default function ChatSidebar({
  availableApps,
  selectedApp,
  setSelectedApp,
  sessions,
  currentSession,
  isLoadingApps,
  createNewSession,
  selectSession,
  onBackToLibrary,
}: ChatSidebarProps) {
  return (
    <div className="h-full bg-black flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Image 
              src="/logo.png" 
              alt="Noise Digital Logo" 
              width={240}
              height={64}
              className="h-15 w-auto"
            />
          </div>
          {selectedApp && onBackToLibrary && (
            <button
              onClick={onBackToLibrary}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors duration-200"
              title="Back to Agent Library"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          )}
        </div>
        
        {/* App Selection */}
        {isLoadingApps ? (
          <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="text-sm text-zinc-400">
              Loading agents...
            </div>
          </div>
        ) : availableApps.length > 0 ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-300">
              Select Agent
            </label>
            <select
              value={selectedApp || ''}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent"
            >
              <option value="">Choose an agent...</option>
              {availableApps.map((app) => {
                const agentConfig = getAgentConfiguration(app);
                return (
                  <option key={app} value={app} className="bg-zinc-900">
                    {agentConfig.displayName}
                  </option>
                );
              })}
            </select>
          </div>
        ) : (
          <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="text-sm text-zinc-400">
              No agents available
            </div>
          </div>
        )}
        
        {selectedApp && (
          <button
            onClick={createNewSession}
            className="mt-4 w-full px-4 py-3 bg-white text-black rounded-xl hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors font-medium"
          >
            New Chat
          </button>
        )}
      </div>
      
      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-2">
          {sessions.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">
              {selectedApp ? 'No conversations yet' : 'Select an agent to start'}
            </div>
          ) : (
            sessions.map((session) => {
              // Debug log to see what timestamp we're getting
              console.log('Session lastUpdateTime:', session.lastUpdateTime, 'Type:', typeof session.lastUpdateTime);
              
              return (
              <div
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={`p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                  currentSession?.id === session.id
                    ? 'bg-zinc-800 border border-zinc-700'
                    : 'bg-zinc-900 hover:bg-zinc-800 border border-transparent'
                }`}
              >
                <h3 className="font-medium text-white text-sm mb-1">
                  {session.id.split('-').pop()}
                </h3>
                <p className="text-xs text-zinc-500">
                  {new Date(normalizeTimestamp(session.lastUpdateTime)).toLocaleDateString()}
                </p>
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
