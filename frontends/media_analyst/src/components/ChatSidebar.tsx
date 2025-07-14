'use client';

import { Session } from '../lib/adk-api';

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
          <h1 className="text-xl font-medium text-white">
            Media Analyst
          </h1>
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
              {availableApps.map((app) => (
                <option key={app} value={app} className="bg-zinc-900">
                  {app.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
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
            sessions.map((session) => (
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
                  Session {session.id.split('-').pop()}
                </h3>
                <p className="text-xs text-zinc-400 mb-2">
                  {session.events.length} messages
                </p>
                <p className="text-xs text-zinc-500">
                  {new Date(session.lastUpdateTime).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
