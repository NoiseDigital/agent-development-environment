'use client';

// Campaign plan — the spreadsheet view. Owns "load the plan, render the
// header summary, hand the campaign to PlanSpreadsheet". Edits land in
// localStorage via the spreadsheet, then bump our local `tick` so the
// plan re-reads from storage and every cell reflects the saved value.

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadPlanByClient } from '../../../../lib/dashboards/user-plans';
import { usdCompact } from '../../../../lib/format/format';
import PlanSpreadsheet from '../../../../components/plan/PlanSpreadsheet';

export default function CampaignPlanPage() {
  const params = useParams<{ clientCode: string; campaignId: string }>();
  const router = useRouter();
  const clientCode = (params.clientCode ?? '').toUpperCase();
  const campaignId = params.campaignId ?? '';

  // `tick` bumps after every edit so the plan re-hydrates from storage.
  const [tick, setTick] = useState(0);
  const plan = useMemo(
    () => loadPlanByClient(clientCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientCode, tick],
  );

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-zinc-300">Unknown client &ldquo;{clientCode}&rdquo;.</p>
          <button
            type="button"
            onClick={() => router.push('/plan')}
            className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            Back to Plan
          </button>
        </div>
      </div>
    );
  }

  const campaign = plan.campaigns.find((c) => c.id === campaignId);
  if (!campaign) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-zinc-300">
            Campaign &ldquo;{campaignId}&rdquo; not found for {plan.clientName}.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/plan/${clientCode}`)}
            className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            Back to {plan.clientName}
          </button>
        </div>
      </div>
    );
  }

  const totalBudget = campaign.lines.reduce((s, l) => s + l.budget, 0);
  const creativeCount = campaign.lines.reduce((s, l) => s + l.creatives.length, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header — breadcrumb + headline + summary stats */}
      <div className="shrink-0 border-b border-zinc-800/60 px-8 py-5">
        <div className="flex items-baseline gap-2 text-[11px] text-zinc-500">
          <button
            type="button"
            onClick={() => router.push('/plan')}
            className="transition-colors hover:text-zinc-300"
          >
            Plan
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => router.push(`/plan/${plan.clientCode}`)}
            className="transition-colors hover:text-zinc-300"
          >
            {plan.clientName}
          </button>
          <span>/</span>
          <span className="text-zinc-400">{campaign.id}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-white">
              {campaign.name}
            </h1>
            <p className="text-[11px] text-zinc-500">
              {campaign.phase} · {campaign.marketGroup} · {campaign.kpiGoal}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Stat label="Lines" value={campaign.lines.length} />
            <Stat label="Creatives" value={creativeCount} />
            <Stat label="Budget" value={usdCompact(totalBudget)} />
          </div>
        </div>
      </div>

      {/* Spreadsheet */}
      <div className="flex-1 overflow-auto px-2 py-3">
        <PlanSpreadsheet campaign={campaign} onChanged={() => setTick((n) => n + 1)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-[14px] font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}
