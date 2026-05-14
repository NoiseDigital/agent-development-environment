'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { agentConfigurations } from '../config/agentConfig';
import { adkApi } from '../lib/adk-api';

// ── Icons ────────────────────────────────────────────────────────────────────

const PlanIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const DashboardsIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const AgentsIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

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
  const [agentsExpanded, setAgentsExpanded] = useState(inAgentsSection);
  const [collapsed, setCollapsed] = useState(false);
  const [onlineAgents, setOnlineAgents] = useState<Set<string>>(new Set());

  // Fetch which agents are live
  useEffect(() => {
    adkApi.listApps().then((apps) => setOnlineAgents(new Set(apps))).catch(() => {});
  }, []);

  const visibleAgents = Object.values(agentConfigurations).filter(
    (a) => !a.hidden && !a.comingSoon,
  );

  // Shared nav-item style helper
  const navItem = (active: boolean) =>
    `group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium cursor-pointer select-none transition-colors duration-150 ${
      active
        ? 'bg-zinc-800 text-white'
        : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
    }`;

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 flex flex-col h-full bg-zinc-950 border-r border-zinc-800 items-center py-3 gap-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors duration-150"
          title="Expand sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col h-full bg-zinc-950 border-r border-zinc-800">
      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pl-4 pr-2 py-[14px] border-b border-zinc-800">
        <div className="flex items-end gap-1.5 min-w-0 cursor-pointer" onClick={() => router.push('/')}>
          <Image src="/noise_white.svg" alt="Noise" width={72} height={20} className="h-5 w-auto shrink-0" />
          <span className="text-zinc-400 text-[11px] font-bold tracking-widest uppercase leading-none mb-[1px]">OS</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors duration-150 shrink-0"
          title="Collapse sidebar"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-px">

        {/* Plan */}
        <button
          type="button"
          onClick={() => router.push('/plan')}
          className={navItem(pathname.startsWith('/plan'))}
        >
          <PlanIcon />
          <span>Plan</span>
        </button>

        {/* Dashboards */}
        <button
          type="button"
          onClick={() => router.push('/dashboards')}
          className={navItem(pathname.startsWith('/dashboards'))}
        >
          <DashboardsIcon />
          <span>Dashboards</span>
        </button>

        {/* Agents — label navigates, chevron toggles */}
        <div>
          <div className={`flex items-center w-full rounded-lg transition-colors duration-150 ${inAgentsSection ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}>
            {/* Main clickable area → go to library */}
            <button
              type="button"
              onClick={() => router.push('/agents')}
              className={`flex items-center gap-3 flex-1 px-3 py-2 text-sm font-medium cursor-pointer select-none ${inAgentsSection ? 'text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              <AgentsIcon />
              <span>Agents</span>
            </button>
            {/* Chevron → toggle only */}
            <button
              type="button"
              onClick={() => setAgentsExpanded((v) => !v)}
              className={`px-2 py-2 cursor-pointer select-none transition-colors duration-150 rounded-r-lg ${inAgentsSection ? 'text-zinc-300 hover:text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              aria-label="Toggle agents list"
            >
              <ChevronRightIcon expanded={agentsExpanded} />
            </button>
          </div>

          {/* Agent sub-items */}
          {agentsExpanded && (
            <div className="mt-px ml-[11px] pl-4 border-l border-zinc-800 space-y-px">
              {visibleAgents.map((agent) => {
                const active = pathname.startsWith(`/chat/${agent.name}`);
                const isOnline = onlineAgents.has(agent.name);
                return (
                  <button
                    key={agent.name}
                    type="button"
                    onClick={() => router.push(`/chat/${agent.name}?new=1`)}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[12.5px] cursor-pointer select-none transition-colors duration-150 ${
                      active
                        ? 'bg-zinc-800 text-white font-medium'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span className="truncate">{agent.displayName}</span>
                  </button>
                );
              })}

              {/* View all agents link */}
              <button
                type="button"
                onClick={() => router.push('/agents')}
                className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[12px] cursor-pointer select-none transition-colors duration-150 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300"
              >
                <ViewAllIcon />
                <span>View all agents</span>
              </button>
            </div>
          )}
        </div>
      </nav>

    </aside>
  );
}
