'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useChat } from '../../../../hooks/useChat';
import ChatSidebar from '../../../../components/ChatSidebar';
import ChatHeader from '../../../../components/ChatHeader';
import MessageList from '../../../../components/MessageList';
import MessageInput from '../../../../components/MessageInput';

export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = typeof params.agentId === 'string' ? params.agentId : '';
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const didInit = useRef(false);

  const {
    availableApps,
    selectedApp,
    sessions,
    currentSession,
    messages,
    isLoading,
    isLoadingApps,
    isLoadingSessions,
    error,
    sessionNames,
    supportsVisualization,
    sendMessage,
    createNewSession,
    selectSession,
    deleteSession,
    saveSessionName,
  } = useChat(agentId);

  // Redirect to library if agentId unknown
  useEffect(() => {
    if (!isLoadingApps && availableApps.length > 0 && !availableApps.includes(agentId)) {
      router.replace('/agents');
    }
  }, [isLoadingApps, availableApps, agentId, router]);

  // On mount: either honour ?new=1 (create fresh session) or select the sessionId from URL
  useEffect(() => {
    if (!selectedApp || isLoadingApps || isLoadingSessions || didInit.current) return;
    didInit.current = true;

    const wantsNew = searchParams.get('new') === '1';
    if (wantsNew) {
      createNewSession().then(s => {
        if (s) router.replace(`/chat/${agentId}/${s.id}`);
      });
    } else if (sessionId) {
      selectSession(sessionId);
    }
  }, [selectedApp, isLoadingApps, isLoadingSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep URL in sync when currentSession changes (e.g. after create)
  useEffect(() => {
    if (currentSession && currentSession.id !== sessionId) {
      router.replace(`/chat/${agentId}/${currentSession.id}`);
    }
  }, [currentSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewSession = async () => {
    const s = await createNewSession();
    if (s) router.push(`/chat/${agentId}/${s.id}`);
  };

  const handleSelectSession = (id: string) => {
    selectSession(id);
    router.push(`/chat/${agentId}/${id}`);
  };

  const handleSwitchAgent = (app: string) => {
    if (app && app !== agentId) router.push(`/chat/${app}?new=1`);
  };

  const handleBackToLibrary = () => router.push('/agents');

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
          createNewSession={handleNewSession}
          selectSession={handleSelectSession}
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
          supportsVisualization={supportsVisualization}
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
