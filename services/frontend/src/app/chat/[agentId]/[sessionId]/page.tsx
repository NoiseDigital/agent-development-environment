'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChatContext } from '../../../../contexts/ChatContext';
import ChatSidebar from '../../../../components/chat/ChatSidebar';
import ChatHeader from '../../../../components/chat/ChatHeader';
import MessageList from '../../../../components/chat/MessageList';
import MessageInput from '../../../../components/chat/MessageInput';
import SourcesSidebar from '../../../../components/SourcesSidebar';
import type { SourceRef } from '../../../../types/source';
import { sourceUri, sourceLabel } from '../../../../types/source';
import { useNeuralThinking } from '../../../../lib/agent/neural-pulse';

export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = typeof params.agentId === 'string' ? params.agentId : '';
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const [selectedSources, setSelectedSources] = useState<SourceRef[]>([]);
  const thinking = useNeuralThinking();

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
    aiRenamedIds,
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

  // Sources sidebar is temporarily hidden — keeping the supporting code so
  // we can re-enable it cleanly when the uploaded-sources workflow lands.
  // Flip this back to `getAgentConfiguration(agentId).supportsSources ?? false`
  // to restore.
  const showSources = false;
  // Compact manifest prepended (agent-side only) so the analyst knows which
  // data sources to run the stats tools against.
  const sourceManifest = selectedSources.length
    ? `[Active data sources: ${selectedSources
        .map((s) => `"${sourceLabel(s)}" (source: ${sourceUri(s)})`)
        .join(', ')}]`
    : undefined;

  return (
    <div className="flex flex-1 h-full bg-canvas">
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
        aiRenamedIds={aiRenamedIds}
      />

      {/* Main */}
      <div className="relative flex-1 flex flex-col min-w-0">
        {/* Soft animated radial wash behind the chat column (pointer-events:
            none so it never intercepts clicks). Shares the neural-expressive
            `--energy` ramp: while the agent is thinking the wash brightens and
            saturates, then eases back — so the conversation surface itself
            "breathes with you". Pure CSS; all motion lives in globals.css. */}
        <div
          aria-hidden
          data-thinking={thinking ? 'true' : undefined}
          className="neural-wash pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="neural-wash-orb neural-wash-a" />
          <div className="neural-wash-orb neural-wash-b" />
          <div className="neural-wash-orb neural-wash-c" />
        </div>
        <div className="relative z-10 flex flex-1 flex-col min-h-0">
          <ChatHeader
            selectedApp={selectedApp}
            currentSession={currentSession}
            error={error}
            sessionNames={sessionNames}
            aiRenamedIds={aiRenamedIds}
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
      </div>

      {/* Right-hand data sources panel — agents with supportsSources only */}
      {showSources && (
        <SourcesSidebar selected={selectedSources} onChange={setSelectedSources} />
      )}
    </div>
  );
}
