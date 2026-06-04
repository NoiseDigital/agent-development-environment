'use client';

// Plan index — one card per client whose media plan we manage. Mirrors
// the dashboards landing page so the platform reads consistently as the
// user moves between Plan and Dashboards.
//
// A client card surfaces the totals a planner needs at a glance: how
// many campaigns are in flight, how many lines, total committed budget.

import { useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { clientBySlug } from '../../data/clients';
import { loadPlans } from '../../lib/dashboards/user-plans';
import { usdCompact } from '../../lib/format/format';

interface ClientCardSummary {
  code: string;
  name: string;
  logoPath?: string;
  campaigns: number;
  lines: number;
  totalBudget: number;
}

export default function PlanIndexPage() {
  const router = useRouter();

  // Plans are local data + localStorage overrides; the hook-less call is
  // fine because nothing on this page mutates.
  const summaries = useMemo<ClientCardSummary[]>(() => {
    return loadPlans().map((plan) => {
      const client = clientBySlug(plan.clientCode.toLowerCase());
      const lines = plan.campaigns.flatMap((c) => c.lines);
      return {
        code: plan.clientCode,
        name: plan.clientName,
        logoPath: client.logoPath,
        campaigns: plan.campaigns.length,
        lines: lines.length,
        totalBudget: lines.reduce((s, l) => s + l.budget, 0),
      };
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line/60 px-8 py-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Plan</h1>
          <p className="mt-0.5 text-[11px] text-faint">
            Media plans by client. Open a client to edit campaigns, lines, and creatives.
          </p>
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {summaries.length > 0 ? (
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summaries.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => router.push(`/plan/${s.code}`)}
                className="flex h-full flex-col items-start gap-3 rounded-xl border border-line bg-surface-sunken p-4 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface/60"
              >
                <div className="flex w-full items-center gap-3">
                  {s.logoPath ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface">
                      <Image src={s.logoPath} alt={s.name} width={24} height={24} className="h-6 w-auto" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-[11px] font-semibold tracking-wider text-subtle">
                      {s.code}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="text-[11px] text-faint">Client code {s.code}</p>
                  </div>
                </div>

                <div className="grid w-full grid-cols-3 gap-2 pt-1">
                  <Stat label="Campaigns" value={s.campaigns} />
                  <Stat label="Lines" value={s.lines} />
                  <Stat label="Budget" value={usdCompact(s.totalBudget)} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="text-sm text-muted">No client plans yet.</p>
              <p className="mt-1 text-[11px] text-faint">
                Add a client plan under <code>data/plans/clients/</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line/80 bg-surface/40 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}
