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
          <p className="text-zinc-400">Discovering available agents...</p>
        </div>
      </div>
    );
  }

  if (availableApps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-900 rounded-full mb-4">
            <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-medium text-white mb-2">No Agents Available</h2>
          <p className="text-zinc-400">Make sure your ADK server is running and agents are configured.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-black p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light text-white mb-4">Agent Library</h1>
          <p className="text-zinc-400 text-lg">Choose an agent to start your conversation</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {availableApps.map((app) => {
            const agentInfo = getAgentConfiguration(app);
            
            return (
              <div
                key={app}
                onClick={() => onSelectAgent(app)}
                className="group relative bg-zinc-900 rounded-lg p-6 cursor-pointer transition-all duration-200 hover:bg-zinc-800 hover:scale-105 border border-zinc-800 hover:border-zinc-700"
              >
                {/* Icon */}
                <div className="flex items-center justify-center w-16 h-16 bg-zinc-800 group-hover:bg-zinc-700 rounded-lg mb-4 mx-auto transition-colors duration-200">
                  <div className="text-white group-hover:text-zinc-100">
                    {agentInfo.icon}
                  </div>
                </div>

                {/* Agent Name */}
                <h3 className="text-white font-medium text-center mb-2 group-hover:text-zinc-100">
                  {agentInfo.displayName}
                </h3>

                {/* Description */}
                <p className="text-zinc-400 text-sm text-center group-hover:text-zinc-300">
                  {agentInfo.description}
                </p>

                {/* Hover effect indicator */}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-zinc-800/0 to-zinc-800/0 group-hover:from-zinc-700/10 group-hover:to-zinc-700/5 transition-all duration-200"></div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="text-center mt-12">
          <p className="text-zinc-500 text-sm">
            {availableApps.length} agent{availableApps.length !== 1 ? 's' : ''} available
          </p>
        </div>
      </div>
    </div>
  );
}
