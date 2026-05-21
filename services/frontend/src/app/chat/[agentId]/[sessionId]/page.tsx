'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChatContext } from '../../../../contexts/ChatContext';
import ChatSidebar from '../../../../components/ChatSidebar';
import ChatHeader from '../../../../components/ChatHeader';
import MessageList from '../../../../components/MessageList';
import MessageInput from '../../../../components/MessageInput';
import SourcesSidebar from '../../../../components/SourcesSidebar';
import { getAgentConfiguration } from '../../../../config/agent-config';
import type { SourceRef } from '../../../../types/source';
import { sourceUri, sourceLabel } from '../../../../types/source';

export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = typeof params.agentId === 'string' ? params.agentId : '';
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const [selectedSources, setSelectedSources] = useState<SourceRef[]>([]);

  const {
    availableApps,
    selectedApp,
    sessions,
    currentSession,
    messages,
    isLoading,
    isLoadingApps,
    error,
    sessionNames,
    feedback,
    rateMessage,
    supportsVisualization,
    sendMessage,
    createNewSession,
    selectSession,
    deleteSession,
    renameSession,
    saveSessionName,
  } = useChatContext();

  // Redirect to library if agentId unknown
  useEffect(() => {
    if (!isLoadingApps && availableApps.length > 0 && !availableApps.includes(agentId)) {
      router.replace('/agents');
    }
  }, [isLoadingApps, availableApps, agentId, router]);

  // The URL is the single source of truth for which session is open: load
  // whatever session the route names. Selecting a conversation or creating one
  // just navigates — this effect does the loading, so there is one load path.
  useEffect(() => {
    if (selectedApp && sessionId && currentSession?.id !== sessionId) {
      selectSession(sessionId);
    }
  }, [selectedApp, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewSession = async () => {
    const s = await createNewSession();
    if (s) router.push(`/chat/${agentId}/${s.id}`);
  };

  // Selecting a conversation just navigates — the URL-driven effect loads it.
  const handleSelectSession = (id: string) => {
    router.push(`/chat/${agentId}/${id}`);
  };

  const showSources = getAgentConfiguration(agentId).supportsSources ?? false;
  // Compact manifest prepended (agent-side only) so the analyst knows which
  // data sources to run the stats tools against.
  const sourceManifest = selectedSources.length
    ? `[Active data sources: ${selectedSources
        .map((s) => `"${sourceLabel(s)}" (source: ${sourceUri(s)})`)
        .join(', ')}]`
    : undefined;

  return (
    <div className="flex flex-1 h-full bg-black">
      <ChatSidebar
        selectedApp={selectedApp}
        sessions={sessions}
        currentSession={currentSession}
        createNewSession={handleNewSession}
        selectSession={handleSelectSession}
        deleteSession={deleteSession}
        renameSession={renameSession}
        saveSessionName={saveSessionName}
        sessionNames={sessionNames}
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader
          selectedApp={selectedApp}
          currentSession={currentSession}
          error={error}
          sessionNames={sessionNames}
        />
        <MessageList
          messages={messages}
          selectedApp={selectedApp}
          supportsVisualization={supportsVisualization}
          feedback={feedback}
          onRate={rateMessage}
          onAction={(text) => sendMessage(text, sourceManifest)}
        />
        <MessageInput
          selectedApp={selectedApp}
          currentSession={currentSession}
          isLoading={isLoading}
          onSendMessage={(text) => sendMessage(text, sourceManifest)}
        />
      </div>

      {/* Right-hand data sources panel — agents with supportsSources only */}
      {showSources && (
        <SourcesSidebar selected={selectedSources} onChange={setSelectedSources} />
      )}
    </div>
  );
}
