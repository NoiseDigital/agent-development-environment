'use client';

import { useRouter } from 'next/navigation';
import { useChat } from '../../hooks/useChat';
import AgentLibrary from '../../components/AgentLibrary';

export default function AgentsPage() {
  const router = useRouter();
  const { availableApps, isLoadingApps } = useChat();

  const handleSelectAgent = (app: string) => {
    router.push(`/chat/${app}?new=1`);
  };

  return (
    <div className="flex h-screen bg-black">
      <AgentLibrary
        availableApps={availableApps}
        isLoadingApps={isLoadingApps}
        onSelectAgent={handleSelectAgent}
      />
    </div>
  );
}
