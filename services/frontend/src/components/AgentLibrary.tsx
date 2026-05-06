'use client';

import { getAgentConfiguration } from '../config/agentConfig';

interface AgentLibraryProps {
  availableApps: string[];
  isLoadingApps: boolean;
  onSelectAgent: (app: string) => void;
}

export default function AgentLibrary({ 
  availableApps, 
  isLoadingApps, 
  onSelectAgent 
}: AgentLibraryProps) {

  if (isLoadingApps) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-900 rounded-full mb-4">
            <div className="w-8 h-8 border-2 border-zinc-600 border-t-white rounded-full animate-spin"></div>
          </div>
          <h2 className="text-xl font-medium text-white mb-2">Loading Agent Library</h2>
          <p className="text-zinc-400 text-sm">Discovering available agents…</p>
        </div>
      </div>
    );
  }

  // Partition into visible/coming-soon — hidden agents are excluded entirely
  const visibleApps = availableApps.filter(app => !getAgentConfiguration(app).hidden);
  const activeApps = visibleApps.filter(app => !getAgentConfiguration(app).comingSoon);
  const comingSoonApps = visibleApps.filter(app => getAgentConfiguration(app).comingSoon);

  if (activeApps.length === 0 && comingSoonApps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-900 rounded-full mb-4">
            <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Agents Available</h2>
          <p className="text-zinc-400 text-sm">Make sure your ADK server is running and agents are configured.</p>
        </div>
      </div>
    );
  }

  const AgentCard = ({ app, disabled = false }: { app: string; disabled?: boolean }) => {
    const agentInfo = getAgentConfiguration(app);
    return (
      <div
        onClick={disabled ? undefined : () => onSelectAgent(app)}
        className={`group relative bg-zinc-900 rounded-xl p-6 border transition-all duration-200 ${
          disabled
            ? 'border-zinc-800 cursor-default opacity-60'
            : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 cursor-pointer hover:scale-[1.02]'
        }`}
      >
        {disabled && (
          <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full">
            Coming soon
          </span>
        )}
        <div className={`flex items-center justify-center w-14 h-14 rounded-lg mb-4 mx-auto transition-colors duration-200 ${
          disabled ? 'bg-zinc-800' : 'bg-zinc-800 group-hover:bg-zinc-700'
        }`}>
          <div className="text-white">{agentInfo.icon}</div>
        </div>
        <h3 className="text-white font-semibold text-center text-sm mb-1.5">
          {agentInfo.displayName}
        </h3>
        <p className="text-zinc-400 text-xs text-center leading-relaxed">
          {agentInfo.description}
        </p>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-black p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-white mb-2">Agent Library</h1>
          <p className="text-zinc-400 text-sm">Choose an agent to start a conversation</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeApps.map(app => <AgentCard key={app} app={app} />)}
          {comingSoonApps.map(app => <AgentCard key={app} app={app} disabled />)}
        </div>

        <div className="text-center mt-10">
          <p className="text-zinc-600 text-xs">
            {activeApps.length} agent{activeApps.length !== 1 ? 's' : ''} available
            {comingSoonApps.length > 0 && ` · ${comingSoonApps.length} coming soon`}
          </p>
        </div>
      </div>
    </div>
  );
}

