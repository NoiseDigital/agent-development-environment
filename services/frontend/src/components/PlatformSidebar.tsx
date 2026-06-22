'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useMemo, type ReactNode } from 'react';
import Image from 'next/image';
import { agentConfigurations } from '../config/agent-config';
import { enabledModules, branding, type ModuleKey } from '../config/tenant';
import { track } from '../lib/analytics/track';
import { useApps } from '../contexts/AppsContext';
import { useSidebarCollapsed } from '../contexts/SidebarContext';
import CollapsiblePanel from './ui/CollapsiblePanel';
import Collapsible from './ui/Collapsible';
import ThemeToggle from './ui/ThemeToggle';
import UserMenu from './UserMenu';

// ── Icons ────────────────────────────────────────────────────────────────────

const PlanIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h4" />
  </svg>
);

const DashboardsIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const AutocorrIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M9 3h6m-5 0v6.5L5.5 17A2 2 0 007.2 20h9.6a2 2 0 001.7-3L14 9.5V3M7.5 14h9" />
  </svg>
);

const AgentsIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M12 7V5M12 5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM7.5 7h9A2.5 2.5 0 0119 9.5v6A2.5 2.5 0 0116.5 18h-9A2.5 2.5 0 015 15.5v-6A2.5 2.5 0 017.5 7zM4 11v3m16-3v3M9.5 12v1m5-1v1M10 15.5h4" />
  </svg>
);

// Concentric radar rings + a locator dot — "competitive intelligence / scan".
const MarketRadarIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M12 21a9 9 0 110-18 9 9 0 010 18zm0-4.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0-2.5a2 2 0 100-4 2 2 0 000 4z" />
  </svg>
);

// Module key → nav icon. Labels/routes/enablement come from the tenant config.
const NAV_ICONS: Record<ModuleKey, ReactNode> = {
  plan: <PlanIcon />,
  dashboards: <DashboardsIcon />,
  autocorr: <AutocorrIcon />,
  "market-radar": <MarketRadarIcon />,
  agents: <AgentsIcon />,
};

const ChevronRightIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`w-3 h-3 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
  </svg>
);

const ViewAllIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

// ── Component ────────────────────────────────────────────────────────────────

export default function PlatformSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const inAgentsSection = pathname.startsWith('/agents') || pathname.startsWith('/chat');
  const agentsEnabled = enabledModules.some((m) => m.key === 'agents');
  const [agentsExpanded, setAgentsExpanded] = useState(inAgentsSection);
  const [collapsed, setCollapsed] = useSidebarCollapsed('platform');

  // Which agents are live — from the shared AppsProvider (one poll app-wide),
  // so the green dot reflects reality without every consumer fetching its own
  // /list-apps. See contexts/AppsContext.
  const { apps: liveApps } = useApps();
  const onlineAgents = useMemo(() => new Set(liveApps), [liveApps]);

  const visibleAgents = Object.values(agentConfigurations).filter(
    (a) => !a.hidden && !a.comingSoon,
  );

  // Shared nav-item style helper
  const navItem = (active: boolean) =>
    `group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium cursor-pointer select-none transition-colors duration-150 ${
      active
        ? 'bg-surface-raised text-foreground'
        : 'text-subtle hover:bg-surface hover:text-foreground'
    }`;

  // Collapsed-rail nav button (icon-only) — shared by the rail render below.
  const collapsedItem = (active: boolean, onClick: () => void, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors duration-150 ${
        active ? 'bg-surface-raised text-foreground' : 'text-subtle hover:bg-surface hover:text-foreground'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <CollapsiblePanel
      collapsed={collapsed}
      resize={{ initial: 224, min: 180, max: 340 }}
      side="right"
      className="bg-surface-sunken border-line"
      rail={
        <>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="w-9 h-9 flex items-center justify-center text-faint hover:text-foreground hover:bg-surface-raised rounded-lg transition-colors duration-150 mb-1"
            title="Expand sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {enabledModules.map((m) =>
            <span key={m.key}>
              {collapsedItem(
                m.key === 'agents' ? inAgentsSection : pathname.startsWith(m.route),
                () => router.push(m.route),
                m.label,
                NAV_ICONS[m.key],
              )}
            </span>,
          )}
          {/* Theme switch pinned to the bottom of the rail */}
          <div className="mt-auto">
            <ThemeToggle />
          </div>
        </>
      }
    >
      {/* Brand */}
      <div className="flex items-center justify-between pl-4 pr-2 h-14 shrink-0 border-b border-line">
        <div className="flex items-end gap-1.5 min-w-0 cursor-pointer" onClick={() => router.push('/')}>
          {/* Logo + readable accent flip come from the active tenant manifest. */}
          <Image
            src={branding.logo}
            alt={branding.logoAlt}
            width={72}
            height={20}
            className={`h-5 w-auto shrink-0${branding.logoInvertOnLight ? ' light:invert' : ''}`}
          />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1.5 text-disabled hover:text-muted hover:bg-surface-raised rounded-md transition-colors duration-150 shrink-0"
          title="Collapse sidebar"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation — only the tenant's enabled modules (tenants/modules.json) */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-px">

        {/* Simple sections (Plan / Dashboards / Analyze). Agents is special
            (expandable sub-list) and rendered below. */}
        {enabledModules
          .filter((m) => m.key !== 'agents')
          .map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => router.push(m.route)}
              className={navItem(pathname.startsWith(m.route))}
            >
              {NAV_ICONS[m.key]}
              <span>{m.label}</span>
            </button>
          ))}

        {/* Agents — label navigates, chevron toggles */}
        {agentsEnabled && (
        <div>
          <div className={`flex items-center w-full rounded-lg transition-colors duration-150 ${inAgentsSection ? 'bg-surface-raised' : 'hover:bg-surface'}`}>
            {/* Main clickable area → go to library */}
            <button
              type="button"
              onClick={() => router.push('/agents')}
              className={`flex items-center gap-3 flex-1 px-3 py-2 text-sm font-medium cursor-pointer select-none ${inAgentsSection ? 'text-foreground' : 'text-subtle hover:text-foreground'}`}
            >
              <AgentsIcon />
              <span>Agents</span>
            </button>
            {/* Chevron → toggle only */}
            <button
              type="button"
              onClick={() => setAgentsExpanded((v) => !v)}
              className={`px-2 py-2 cursor-pointer select-none transition-colors duration-150 rounded-r-lg ${inAgentsSection ? 'text-muted hover:text-foreground' : 'text-faint hover:text-muted'}`}
              aria-label="Toggle agents list"
            >
              <ChevronRightIcon expanded={agentsExpanded} />
            </button>
          </div>

          {/* Agent sub-items — height + fade animated */}
          <Collapsible open={agentsExpanded}>
            <div className="mt-px ml-[11px] pl-4 border-l border-line space-y-px">
              {visibleAgents.map((agent) => {
                const active = pathname.startsWith(`/chat/${agent.name}`);
                const isOnline = onlineAgents.has(agent.name);
                return (
                  <button
                    key={agent.name}
                    type="button"
                    onClick={() => {
                      track('agent_selected', { agent: agent.name });
                      router.push(`/chat/${agent.name}`);
                    }}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[12.5px] cursor-pointer select-none transition-colors duration-150 ${
                      active
                        ? 'bg-surface-raised text-foreground font-medium'
                        : 'text-subtle hover:bg-surface hover:text-foreground'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-positive' : 'bg-disabled'}`} />
                    <span className="truncate">{agent.displayName}</span>
                  </button>
                );
              })}

              {/* View all agents link */}
              <button
                type="button"
                onClick={() => router.push('/agents')}
                className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[12px] cursor-pointer select-none transition-colors duration-150 text-disabled hover:bg-surface hover:text-muted"
              >
                <ViewAllIcon />
                <span>View all agents</span>
              </button>
            </div>
          </Collapsible>
        </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-2 flex items-center gap-1">
        <UserMenu />
        <ThemeToggle />
      </div>
    </CollapsiblePanel>
  );
}
