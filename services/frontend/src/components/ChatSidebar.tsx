'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Session } from '../lib/adk-api';
import { getAgentConfiguration } from '../config/agentConfig';

const normalizeTimestamp = (timestamp: number | string): number => {
  let ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (ts < 1_000_000_000_000) ts *= 1000;
  if (!ts || isNaN(ts) || ts <= 0) ts = Date.now();
  return ts;
};

const toDateKey = (ts: number) => new Date(ts).toLocaleDateString('en-CA'); // YYYY-MM-DD

const formatDayLabel = (dateKey: string) => {
  const d = new Date(dateKey);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (dateKey === toDateKey(today.getTime())) return 'Today';
  if (dateKey === toDateKey(yesterday.getTime())) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

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
  saveSessionName: (sessionId: string, name: string) => void;
  sessionNames: Record<string, string>;
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
  saveSessionName,
  sessionNames,
  onBackToLibrary,
}: ChatSidebarProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
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

  const handleRenameClick = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditDraft(sessionNames[session.id] || '');
  };

  const handleSaveName = () => {
    if (editingId) {
      saveSessionName(editingId, editDraft.trim() || sessionNames[editingId] || 'Untitled');
    }
    setEditingId(null);
    setEditDraft('');
  };

  // Group sessions by day, sorted newest-day-first, sessions within day newest-first
  const sortedSessions = [...sessions].sort(
    (a, b) => normalizeTimestamp(b.lastUpdateTime) - normalizeTimestamp(a.lastUpdateTime)
  );
  const grouped: Record<string, Session[]> = {};
  for (const s of sortedSessions) {
    const key = toDateKey(normalizeTimestamp(s.lastUpdateTime));
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }
  const dayKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="h-full bg-black flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <Image src="/noise_white.svg" alt="Noise Digital Logo" width={120} height={32} className="h-8 w-auto" />
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

        {isLoadingApps ? (
          <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 text-sm text-zinc-400">Loading agents…</div>
        ) : availableApps.length > 0 ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-300">Select Agent</label>
            <select
              value={selectedApp || ''}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent"
            >
              <option value="">Choose an agent…</option>
              {availableApps.map((app) => (
                <option key={app} value={app} className="bg-zinc-900">
                  {getAgentConfiguration(app).displayName}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 text-sm text-zinc-400">No agents available</div>
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

      {/* Session list grouped by day */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          {sessions.length === 0 ? (
            <div className="text-center text-zinc-500 py-8 text-sm">
              {selectedApp ? 'No conversations yet' : 'Select an agent to start'}
            </div>
          ) : (
            dayKeys.map(dayKey => (
              <div key={dayKey} className="mb-3">
                <p className="px-2 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  {formatDayLabel(dayKey)}
                </p>
                <div className="space-y-1 mt-1">
                  {grouped[dayKey].map(session => {
                    const displayName = sessionNames[session.id];
                    const ts = normalizeTimestamp(session.lastUpdateTime);
                    const isActive = currentSession?.id === session.id;

                    return (
                      <div
                        key={session.id}
                        onClick={() => selectSession(session.id)}
                        className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 relative group ${
                          isActive
                            ? 'bg-zinc-800 border border-zinc-700'
                            : 'hover:bg-zinc-900 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 pr-14">
                          <p className="text-sm text-white truncate">
                            {displayName || <span className="text-zinc-400 italic">New chat</span>}
                          </p>
                          <span className="text-xs text-zinc-500 shrink-0">{formatTime(ts)}</span>
                        </div>

                        {/* Action buttons — visible on hover/active */}
                        <div className="absolute top-1/2 right-1 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          {/* Rename */}
                          <button
                            onClick={(e) => handleRenameClick(e, session)}
                            className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                            title="Rename session"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {/* Delete */}
                          <button
                            onClick={(e) => handleDeleteClick(e, session.id)}
                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 rounded transition-colors"
                            title="Delete session"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Name Modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-80 mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-3">Rename Session</h3>
            <input
              autoFocus
              type="text"
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingId(null); setEditDraft(''); } }}
              placeholder="Session name…"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => { setEditingId(null); setEditDraft(''); }} className="flex-1 px-3 py-2 text-sm bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors">Cancel</button>
              <button onClick={handleSaveName} className="flex-1 px-3 py-2 text-sm bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors font-medium">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-white mb-3">Delete Session</h3>
            <p className="text-zinc-400 mb-6">Are you sure you want to delete this session? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModalOpen(false)} className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors">Cancel</button>
              <button onClick={handleConfirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

