'use client';

// Per-client campaign list — one card per campaign in this client's plan.
// Click a card to open the spreadsheet for that campaign. Mirrors the
// dashboards-tab card shape so the platform reads coherently.

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadPlanByClient } from '../../../lib/user-plans';
import { usdCompact } from '../../../lib/format';
import type { PlanCampaign } from '../../../data/plans';

export default function ClientPlanPage() {
  const params = useParams<{ clientCode: string }>();
  const router = useRouter();
  const code = (params.clientCode ?? '').toUpperCase();

  const plan = useMemo(() => loadPlanByClient(code), [code]);

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-sm text-zinc-300">Unknown client &ldquo;{code}&rdquo;.</p>
          <button
            type="button"
            onClick={() => router.push('/plan')}
            className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            Back to client list
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Breadcrumb + title */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/60 px-8 py-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push('/plan')}
            className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ← Plan
          </button>
          <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-white">
            {plan.clientName}{' '}
            <span className="font-normal text-zinc-500">— Campaigns</span>
          </h1>
        </div>
      </div>

      {/* Campaign cards */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {plan.campaigns.length > 0 ? (
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plan.campaigns.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onOpen={() => router.push(`/plan/${plan.clientCode}/${c.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-zinc-400">No campaigns in this plan yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const phaseTone: Record<string, string> = {
  Book: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Travel: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  Plan: 'bg-zinc-700/30 text-zinc-300 border-zinc-700',
};

function CampaignCard({
  campaign,
  onOpen,
}: {
  campaign: PlanCampaign;
  onOpen: () => void;
}) {
  const totalBudget = campaign.lines.reduce((s, l) => s + l.budget, 0);
  const creativeCount = campaign.lines.reduce((s, l) => s + l.creatives.length, 0);
  const tone = phaseTone[campaign.phase] ?? phaseTone.Plan;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full flex-col items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-900/60"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{campaign.name}</p>
          <p className="text-[11px] text-zinc-500">{campaign.id}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>
          {campaign.phase}
        </span>
      </div>

      <div className="flex w-full flex-wrap gap-1.5 pt-1">
        <Pill label={campaign.marketGroup} />
        <Pill label={campaign.kpiGoal} />
      </div>

      <div className="grid w-full grid-cols-3 gap-2 pt-1">
        <Stat label="Lines" value={campaign.lines.length} />
        <Stat label="Creatives" value={creativeCount} />
        <Stat label="Budget" value={usdCompact(totalBudget)} />
      </div>
    </button>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-zinc-800/80 bg-zinc-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}
