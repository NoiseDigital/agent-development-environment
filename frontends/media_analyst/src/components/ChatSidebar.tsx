'use client';

import { useState } from 'react';
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
  deleteSession: (sessionId: string) => void;
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
  deleteSession,
  onBackToLibrary,
}: ChatSidebarProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation(); // Prevent session selection
    setSessionToDelete(sessionId);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (sessionToDelete) {
      await deleteSession(sessionToDelete);
      setDeleteModalOpen(false);
      setSessionToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalOpen(false);
    setSessionToDelete(null);
  };
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
                className={`p-4 rounded-xl cursor-pointer transition-all duration-200 relative group ${
                  currentSession?.id === session.id
                    ? 'bg-zinc-800 border border-zinc-700'
                    : 'bg-zinc-900 hover:bg-zinc-800 border border-transparent'
                }`}
              >
                <div onClick={() => selectSession(session.id)} className="flex-1 pr-8">
                  <h3 className="font-medium text-white text-sm mb-1">
                    {session.id.split('-').pop()}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {new Date(normalizeTimestamp(session.lastUpdateTime)).toLocaleDateString()}
                  </p>
                </div>
                
                {/* Delete button */}
                <button
                  onClick={(e) => handleDeleteClick(e, session.id)}
                  className="absolute top-1/2 right-2 transform -translate-y-1/2 p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  title="Delete session"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-white mb-3">
              Delete Session
            </h3>
            <p className="text-zinc-400 mb-6">
              Are you sure you want to delete this session? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancelDelete}
                className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
