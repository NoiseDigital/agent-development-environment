'use client';

import { Session } from '../lib/adk-api';

interface ChatHeaderProps {
  selectedApp: string | null;
  currentSession: Session | null;
  error: string | null;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function ChatHeader({
  selectedApp,
  currentSession,
  error,
  isSidebarOpen,
  onToggleSidebar,
}: ChatHeaderProps) {
  return (
    <div className="p-6 border-b border-zinc-800 bg-black">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Sidebar Toggle Button */}
          <button
            onClick={onToggleSidebar}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors duration-200"
            title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isSidebarOpen ? (
                // Hide sidebar icon (panel left close)
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              ) : (
                // Show sidebar icon (menu/hamburger)
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          
          {/* Title */}
          <h2 className="text-lg font-medium text-white">
            {selectedApp 
              ? `${currentSession ? `${currentSession.id.split('-').pop()}` : ''}`
              : 'Select an Agent to Start'
            }
          </h2>
        </div>
      </div>
      
      {error && (
        <div className="mt-3 p-3 bg-red-950 border border-red-800 rounded-xl">
          <div className="text-red-200 text-sm">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
