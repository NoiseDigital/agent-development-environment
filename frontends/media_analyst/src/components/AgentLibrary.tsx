'use client';

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
  // Generate a consistent icon for each agent based on their name
  const getAgentIcon = (agentName: string) => {
    const icons = [
      // Media/Content icons
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" key="media">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>,
      // Analytics icon
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" key="analytics">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>,
      // Assistant icon
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" key="assistant">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>,
      // Brain/AI icon
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" key="brain">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>,
      // Document icon
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" key="document">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>,
      // Search icon
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" key="search">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ];
    
    // Use a simple hash to consistently assign icons
    let hash = 0;
    for (let i = 0; i < agentName.length; i++) {
      hash = agentName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return icons[Math.abs(hash) % icons.length];
  };

  const formatAgentName = (name: string) => {
    return name
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

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
          {availableApps.map((app) => (
            <div
              key={app}
              onClick={() => onSelectAgent(app)}
              className="group relative bg-zinc-900 rounded-lg p-6 cursor-pointer transition-all duration-200 hover:bg-zinc-800 hover:scale-105 border border-zinc-800 hover:border-zinc-700"
            >
              {/* Icon */}
              <div className="flex items-center justify-center w-16 h-16 bg-zinc-800 group-hover:bg-zinc-700 rounded-lg mb-4 mx-auto transition-colors duration-200">
                <div className="text-white group-hover:text-zinc-100">
                  {getAgentIcon(app)}
                </div>
              </div>

              {/* Agent Name */}
              <h3 className="text-white font-medium text-center mb-2 group-hover:text-zinc-100">
                {formatAgentName(app)}
              </h3>

              {/* Description */}
              <p className="text-zinc-400 text-sm text-center group-hover:text-zinc-300">
                AI agent specialized in various tasks
              </p>

              {/* Hover effect indicator */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-zinc-800/0 to-zinc-800/0 group-hover:from-zinc-700/10 group-hover:to-zinc-700/5 transition-all duration-200"></div>
            </div>
          ))}
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
