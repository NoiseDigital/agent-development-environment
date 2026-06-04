'use client';

import { getAgentConfiguration } from '../config/agent-config';

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
  const allVisibleApps = availableApps.filter(app => !getAgentConfiguration(app).hidden);

  if (isLoadingApps) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas px-6">
        <div className="text-center rounded-3xl border border-line bg-surface-sunken/80 px-10 py-12 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface">
            <div className="w-8 h-8 border-2 border-disabled border-t-foreground rounded-full animate-spin"></div>
          </div>
          <h2 className="text-xl font-medium text-foreground mb-2">Loading Agent Library</h2>
          <p className="text-subtle text-sm">Discovering available agents…</p>
        </div>
      </div>
    );
  }

  // Partition into visible/coming-soon — hidden agents are excluded entirely
  const activeApps = allVisibleApps.filter(app => !getAgentConfiguration(app).comingSoon);
  const comingSoonApps = allVisibleApps.filter(app => getAgentConfiguration(app).comingSoon);

  if (activeApps.length === 0 && comingSoonApps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas px-6">
        <div className="max-w-md rounded-3xl border border-line bg-surface-sunken/80 px-10 py-12 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface">
            <svg className="w-8 h-8 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">No Agents Available</h2>
          <p className="text-subtle text-sm">Make sure your ADK server is running and agents are configured.</p>
        </div>
      </div>
    );
  }

  const AgentCard = ({ app, disabled = false }: { app: string; disabled?: boolean }) => {
    const agentInfo = getAgentConfiguration(app);
    return (
      <div
        onClick={disabled ? undefined : () => onSelectAgent(app)}
        className={`group relative flex min-h-[240px] w-full max-w-[320px] flex-col rounded-3xl border p-6 transition-all duration-300 ${
          disabled
            ? 'border-line bg-surface-sunken/70 cursor-default opacity-60'
            : 'cursor-pointer border-line bg-card-spotlight shadow-[0_24px_60px_rgba(0,0,0,0.35)] hover:-translate-y-1 hover:border-line-strong hover:shadow-[0_32px_80px_rgba(0,0,0,0.45)]'
        }`}
      >
        {disabled && (
          <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-widest text-subtle bg-surface-raised border border-line-strong px-2 py-0.5 rounded-full">
            Coming soon
          </span>
        )}
        <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors duration-200 ${
          disabled
            ? 'border-line-strong bg-surface-raised'
            : 'border-line-strong bg-surface-raised group-hover:border-line-strong group-hover:bg-surface'
        }`}>
          <div className="text-foreground">{agentInfo.icon}</div>
        </div>
        <h3 className="mb-2 text-center text-base font-semibold text-foreground">
          {agentInfo.displayName}
        </h3>
        <p className="text-center text-sm leading-relaxed text-subtle">
          {agentInfo.description}
        </p>
        {!disabled && (
          <div className="mt-auto pt-6 text-center text-xs font-medium uppercase tracking-[0.2em] text-faint transition-colors duration-200 group-hover:text-muted">
            Open agent
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-page-spotlight px-6 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.3em] text-faint">
            Workspace Agents
          </p>
          <h1 className="mb-3 text-3xl font-semibold text-foreground sm:text-4xl">Agent Library</h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-subtle sm:text-base">
            Choose an agent to start a conversation
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-5">
          {activeApps.map(app => <AgentCard key={app} app={app} />)}
          {comingSoonApps.map(app => <AgentCard key={app} app={app} disabled />)}
        </div>

        <div className="mt-10 text-center">
          <p className="text-xs text-disabled">
            {activeApps.length} agent{activeApps.length !== 1 ? 's' : ''} available
            {comingSoonApps.length > 0 && ` · ${comingSoonApps.length} coming soon`}
          </p>
        </div>
      </div>
    </div>
  );
}
