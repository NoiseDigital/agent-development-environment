import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboards — Noise Digital',
};

export default function DashboardsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center h-full bg-black px-6">
      <div className="text-center max-w-lg">
        {/* Icon */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.03)]">
          <svg className="w-9 h-9 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>

        {/* Label */}
        <span className="inline-block mb-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full">
          Coming soon
        </span>

        {/* Heading */}
        <h1 className="text-3xl font-semibold text-white mb-4 tracking-tight">
          Dashboards
        </h1>

        {/* Description */}
        <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
          Access your reports and shared dashboards in one place.
          Monitor performance across campaigns, clients, and channels.
        </p>

        {/* Placeholder dashboard cards */}
        <div className="mt-10 space-y-2 text-left">
          {[
            { label: 'My Dashboards', desc: 'Personal reports and saved views', count: '—' },
            { label: 'Shared with Me', desc: 'Reports shared by your team', count: '—' },
            { label: 'Client Reports', desc: 'Client-facing performance reports', count: '—' },
          ].map((section) => (
            <div
              key={section.label}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3.5 opacity-50"
            >
              <div>
                <p className="text-white text-sm font-medium">{section.label}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{section.desc}</p>
              </div>
              <span className="text-zinc-600 text-xs font-mono">{section.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
