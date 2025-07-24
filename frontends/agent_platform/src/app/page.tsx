'use client';

import { useState } from 'react';
import { useChat } from '../hooks/useChat';
import ChatSidebar from '../components/ChatSidebar';
import ChatHeader from '../components/ChatHeader';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import AgentLibrary from '../components/AgentLibrary';

export default function Home() {
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
    sendMessage,
    createNewSession,
    selectSession,
    deleteSession,
  } = useChat();

  const handleSelectAgent = async (app: string) => {
    setSelectedApp(app);
    // Automatically create a new session when an agent is selected from the library
    await createNewSession();
  };

  const handleBackToLibrary = () => {
    setSelectedApp(null);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-screen bg-black">
      {/* Only show sidebar when an agent is selected AND sidebar is open */}
      {selectedApp && isSidebarOpen && (
        <div className="w-80 bg-black border-r border-zinc-800 flex flex-col transition-all duration-300 ease-in-out">
          <ChatSidebar
            availableApps={availableApps}
            selectedApp={selectedApp}
            setSelectedApp={setSelectedApp}
            sessions={sessions}
            currentSession={currentSession}
            isLoadingApps={isLoadingApps}
            createNewSession={createNewSession}
            selectSession={selectSession}
            deleteSession={deleteSession}
            onBackToLibrary={handleBackToLibrary}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col">
        {!selectedApp ? (
          <AgentLibrary
            availableApps={availableApps}
            isLoadingApps={isLoadingApps}
            onSelectAgent={handleSelectAgent}
          />
        ) : (
          <>
            <ChatHeader
              selectedApp={selectedApp}
              currentSession={currentSession}
              error={error}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={toggleSidebar}
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
          </>
        )}
      </div>
    </div>
  );
}
