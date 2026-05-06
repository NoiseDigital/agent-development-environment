'use client';

import { useRouter } from 'next/navigation';
import { useChat } from '../hooks/useChat';
import AgentLibrary from '../components/AgentLibrary';

export default function Home() {
  const router = useRouter();
  const { availableApps, isLoadingApps } = useChat();

  const handleSelectAgent = (app: string) => {
    router.push(`/chat/${app}`);
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
