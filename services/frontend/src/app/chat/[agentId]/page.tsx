'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChat } from '../../../hooks/useChat';
import ChatSidebar from '../../../components/ChatSidebar';
import ChatHeader from '../../../components/ChatHeader';
import MessageList from '../../../components/MessageList';
import MessageInput from '../../../components/MessageInput';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = typeof params.agentId === 'string' ? params.agentId : '';
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const {
    availableApps,
    selectedApp,
    setSelectedApp,
    sessions,
    currentSession,
    messages,
    isLoading,
    isLoadingApps,
    error,
    sessionNames,
    sendMessage,
    createNewSession,
    selectSession,
    deleteSession,
    saveSessionName,
  } = useChat(agentId);

  // Redirect back to library if agentId is invalid/unknown after apps load
  useEffect(() => {
    if (!isLoadingApps && availableApps.length > 0 && !availableApps.includes(agentId)) {
      router.replace('/');
    }
  }, [isLoadingApps, availableApps, agentId, router]);

  // Auto-create a session if the agent has none
  useEffect(() => {
    if (selectedApp && !isLoadingApps && sessions.length === 0 && !currentSession) {
      createNewSession();
    }
  }, [selectedApp, isLoadingApps, sessions.length, currentSession]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleBackToLibrary = () => router.push('/');

  const handleSwitchAgent = (app: string) => {
    if (app && app !== agentId) router.push(`/chat/${app}`);
  };

  return (
    <div className="flex h-screen bg-black">
      {/* Sidebar */}
      <div
        className={`bg-black border-r border-zinc-800 flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out ${
          isSidebarOpen ? 'w-80' : 'w-0'
        }`}
      >
        <ChatSidebar
          availableApps={availableApps}
          selectedApp={selectedApp}
          setSelectedApp={handleSwitchAgent}
          sessions={sessions}
          currentSession={currentSession}
          isLoadingApps={isLoadingApps}
          createNewSession={createNewSession}
          selectSession={selectSession}
          deleteSession={deleteSession}
          saveSessionName={saveSessionName}
          sessionNames={sessionNames}
          onBackToLibrary={handleBackToLibrary}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader
          selectedApp={selectedApp}
          currentSession={currentSession}
          error={error}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(o => !o)}
          sessionNames={sessionNames}
        />
        <MessageList
          messages={messages}
          isLoading={isLoading}
          selectedApp={selectedApp}
        />
        <MessageInput
          selectedApp={selectedApp}
          currentSession={currentSession}
          isLoading={isLoading}
          onSendMessage={sendMessage}
        />
      </div>
    </div>
  );
}
