'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';

const sections = [
  {
    key: 'plan',
    href: '/plan',
    label: 'Plan',
    description: 'Build and manage media plans across all channels. Strategy, budgets, and targeting in one workspace.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    badge: 'Coming soon',
  },
  {
    key: 'dashboards',
    href: '/dashboards',
    label: 'Dashboards',
    description: 'Access your reports and shared dashboards. Monitor performance across campaigns, clients, and channels.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    badge: 'Coming soon',
  },
  {
    key: 'agents',
    href: '/agents',
    label: 'Agents',
    description: 'AI-powered agents for media analysis, timesheets, and more. Pick one to start a conversation.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    badge: null,
  },
];

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col items-center justify-center h-full bg-black px-6 overflow-auto">
      <div className="w-full max-w-2xl">
        {/* Logo + greeting */}
        <div className="mb-12 text-center">
          <Image
            src="/noise_white.svg"
            alt="Noise"
            width={120}
            height={32}
            className="h-8 w-auto mx-auto mb-6"
          />
          <h1 className="text-2xl font-semibold text-white mb-3 tracking-tight">
            Welcome to Noise OS
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
            Your platform for media planning, reporting, and AI-powered tools.
            Pick a section below to get started.
          </p>
        </div>

        {/* Section cards */}
        <div className="grid grid-cols-3 gap-4">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => router.push(s.href)}
              className="group relative flex flex-col items-center text-center rounded-2xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-700 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)] cursor-pointer"
            >
              {s.badge && (
                <span className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-widest text-zinc-500 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded-full">
                  {s.badge}
                </span>
              )}
              <div className="mb-4 w-14 h-14 rounded-xl border border-zinc-800 bg-zinc-900 group-hover:border-zinc-700 group-hover:bg-zinc-800 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors duration-200">
                {s.icon}
              </div>
              <p className="text-white text-sm font-semibold mb-2">{s.label}</p>
              <p className="text-zinc-500 text-xs leading-relaxed">{s.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
