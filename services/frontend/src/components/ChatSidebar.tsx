'use client';

import { useState, useRef, useEffect } from 'react';
import { Session } from '../lib/adk-api';
import { getAgentConfiguration } from '../config/agentConfig';

const normalizeTimestamp = (timestamp: number | string): number => {
  let ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (ts < 1_000_000_000_000) ts *= 1000;
  if (!ts || isNaN(ts) || ts <= 0) ts = Date.now();
  return ts;
};

const toDateKey = (ts: number) => new Date(ts).toLocaleDateString('en-CA');

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
  renameSession?: (sessionId: string) => Promise<string | null>;
  saveSessionName: (sessionId: string, name: string) => void;
  sessionNames: Record<string, string>;
  onBackToLibrary?: () => void;
}
// Note: availableApps, setSelectedApp, isLoadingApps, onBackToLibrary are kept for API compat

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
  renameSession,
  saveSessionName,
  sessionNames,
  onBackToLibrary,
}: ChatSidebarProps) {
  const agentConfig = selectedApp ? getAgentConfiguration(selectedApp) : null;

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [aiRenamingId, setAiRenamingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close delete toast on outside click
  useEffect(() => {
    if (!confirmingDeleteId) return;
    const handler = () => setConfirmingDeleteId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [confirmingDeleteId]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const startEdit = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    setConfirmingDeleteId(null);
    setEditingId(session.id);
    setEditDraft(sessionNames[session.id] || '');
  };

  const commitEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (editingId) {
      saveSessionName(editingId, editDraft.trim() || sessionNames[editingId] || 'Untitled');
    }
    setEditingId(null);
    setEditDraft('');
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditDraft('');
  };

  // Used in edit mode: fetches AI name and populates the draft input
  const handleAiRenameToInput = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!renameSession || aiRenamingId) return;
    const loadingStartedAt = Date.now();
    setAiRenamingId(sessionId);
    try {
      const name = await renameSession(sessionId);
      if (name) {
        if (editingId === sessionId) setEditDraft(name);
        saveSessionName(sessionId, name);
      }
    } finally {
      const elapsed = Date.now() - loadingStartedAt;
      const minimumVisibleMs = 450;
      if (elapsed < minimumVisibleMs) {
        await new Promise(resolve => setTimeout(resolve, minimumVisibleMs - elapsed));
      }
      setAiRenamingId(null);
    }
  };

  const openDeleteToast = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setConfirmingDeleteId((prev: string | null) => prev === sessionId ? null : sessionId);
  };

  const confirmDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setConfirmingDeleteId(null);
    await deleteSession(sessionId);
  };

  // Group sessions by day
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
    <div className="h-full bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-zinc-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-0.5">Conversations</p>
          <p className="text-sm font-medium text-white truncate">
            {agentConfig?.displayName ?? 'Agent'}
          </p>
        </div>
        {selectedApp && (
          <button
            onClick={createNewSession}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors duration-150"
            title="New chat"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New
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
                    const isEditing = editingId === session.id;
                    const isConfirmingDelete = confirmingDeleteId === session.id;
                    const isAiRenaming = aiRenamingId === session.id;

                    return (
                      <div
                        key={session.id}
                        onClick={() => !isEditing && selectSession(session.id)}
                        className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 relative group ${
                          isActive
                            ? 'bg-zinc-800 border border-zinc-700'
                            : 'hover:bg-zinc-900 border border-transparent'
                        }`}
                      >
                        {isEditing ? (
                          /* ── Inline edit mode ── */
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input
                              ref={editInputRef}
                              value={editDraft}
                              onChange={e => setEditDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              placeholder="Session name…"
                              className="flex-1 min-w-0 bg-transparent text-sm text-white outline-none border-b border-zinc-500 focus:border-zinc-300 transition-colors py-0.5"
                            />
                            {/* AI sparkle — regenerate into input */}
                            {renameSession && (
                              <button
                                onClick={e => handleAiRenameToInput(e, session.id)}
                                title={isAiRenaming ? 'Generating name…' : 'Suggest name with AI'}
                                disabled={!!aiRenamingId && !isAiRenaming}
                                className={`p-1 flex-shrink-0 rounded transition-colors ${
                                  isAiRenaming
                                    ? 'text-violet-400 bg-violet-950'
                                    : 'text-zinc-500 hover:text-violet-400 hover:bg-zinc-700 disabled:opacity-30'
                                }`}
                              >
                                {isAiRenaming ? (
                                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                    <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                  </svg>
                                )}
                              </button>
                            )}
                            {/* Save */}
                            <button
                              onClick={commitEdit}
                              title="Save"
                              className="p-1 text-green-400 hover:text-green-300 flex-shrink-0"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            {/* Cancel */}
                            <button
                              onClick={cancelEdit}
                              title="Cancel"
                              className="p-1 text-red-400 hover:text-red-300 flex-shrink-0"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          /* ── Normal display ── */
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm text-white truncate flex-1 min-w-0">
                              {displayName || <span className="text-zinc-400 italic">New chat</span>}
                            </p>

                            {/* Right side: buttons slide in from right, time always anchored */}
                            <div className="flex items-center gap-0.5 shrink-0">

                              {/* Expanding buttons container */}
                              <div className={`flex items-center gap-0.5 max-w-0 opacity-0 group-hover:max-w-[4rem] group-hover:opacity-100 transition-all duration-200 ${isConfirmingDelete ? 'overflow-visible !max-w-[4rem] !opacity-100' : 'overflow-hidden'}`}>
                                {/* Pencil */}
                                <button
                                  onClick={e => startEdit(e, session)}
                                  title="Rename"
                                  className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-700 rounded transition-colors flex-shrink-0"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.364-6.364a2 2 0 112.828 2.828L11.828 13.828A2 2 0 0110 14H8v-2a2 2 0 01.586-1.414z" />
                                  </svg>
                                </button>

                                {/* Trash with toast */}
                                <div className="relative flex-shrink-0">
                                  {isConfirmingDelete && (
                                    <div
                                      className="absolute bottom-full right-0 mb-1.5 flex items-center gap-1.5 bg-zinc-800 border border-zinc-600 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap z-20"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <span className="text-xs text-zinc-300">Delete?</span>
                                      <button
                                        onClick={e => confirmDelete(e, session.id)}
                                        className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors px-1"
                                      >
                                        Yes
                                      </button>
                                      <button
                                        onClick={e => { e.stopPropagation(); setConfirmingDeleteId(null); }}
                                        className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-1"
                                      >
                                        No
                                      </button>
                                    </div>
                                  )}
                                  <button
                                    onClick={e => openDeleteToast(e, session.id)}
                                    title="Delete session"
                                    className={`p-1.5 rounded transition-colors ${
                                      isConfirmingDelete
                                        ? 'text-red-400 bg-zinc-700'
                                        : 'text-zinc-500 hover:text-red-400 hover:bg-zinc-700'
                                    }`}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Time — always right-anchored */}
                              <span className="text-xs text-zinc-500 shrink-0 w-10 text-right">{formatTime(ts)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
