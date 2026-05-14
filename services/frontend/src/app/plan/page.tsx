import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Plan — Noise Digital',
};

export default function PlanPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center h-full bg-black px-6">
      <div className="text-center max-w-lg">
        {/* Icon */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.03)]">
          <svg className="w-9 h-9 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>

        {/* Label */}
        <span className="inline-block mb-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full">
          Coming soon
        </span>

        {/* Heading */}
        <h1 className="text-3xl font-semibold text-white mb-4 tracking-tight">
          Media Planning
        </h1>

        {/* Description */}
        <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
          Build, manage, and collaborate on media plans across all channels.
          Strategy, budgets, and targeting — all in one workspace.
        </p>

        {/* Placeholder feature grid */}
        <div className="mt-10 grid grid-cols-3 gap-3 text-left">
          {[
            { label: 'Campaign Builder', desc: 'Structured planning across paid channels' },
            { label: 'Budget Allocation', desc: 'Model spend across lines and channels' },
            { label: 'Audience Targeting', desc: 'Define and share audience segments' },
          ].map((feature) => (
            <div
              key={feature.label}
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 opacity-50"
            >
              <p className="text-white text-xs font-medium mb-1">{feature.label}</p>
              <p className="text-zinc-500 text-[11px] leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
