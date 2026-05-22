'use client';

// Media Plans — the canonical media model (Client → Campaign → AdLine) as an
// editable spreadsheet. The same AdLine the dashboards aggregate and the
// closed-loop recommendations change: applying a recommendation in chat shows
// up here as dated budget history, drilled down per line. One entity, no silo.

import { useState, useEffect, useMemo } from 'react';
import {
  clients,
  campaigns,
  adLines,
  platformById,
  performanceData,
  type AdLine,
  type Client,
  type Campaign,
  type PerformanceDay,
} from '../../data/media-model';
import { aggregate, type MetricTotals } from '../../lib/media-query';
import { effectiveBudget, lineHistory, useLineChanges, type LineChange } from '../../lib/line-changes';
import { usd, compact, pct } from '../../lib/format';
import LineDiff from '../../components/LineDiff';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  // YYYY-MM-DD parses as UTC midnight; format in UTC so the day never shifts.
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const EMPTY_TOTALS: MetricTotals = {
  spend: 0, impressions: 0, viewableImpressions: 0, clicks: 0, conversions: 0,
  videoCompletions: 0, cpm: 0, cpc: 0, ctr: 0, cvr: 0, cpa: 0, vcr: 0, viewability: 0,
};

// ── Change-history drilldown ──────────────────────────────────────────────────

function sourceBadge(source: LineChange['source']) {
  return source === 'agent'
    ? 'border-accent-500/30 bg-accent-500/10 text-accent-400'
    : 'border-line-strong bg-surface-raised text-zinc-400';
}

function HistoryDrilldown({ line }: { line: AdLine }) {
  const history = lineHistory(line.id).filter((c) => c.field === 'budget');
  const current = effectiveBudget(line.id);

  return (
    <div className="animate-drill-in px-12 py-4">
      {/* Baseline → current — the budget A/B for this line at a glance */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">Budget A/B</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Plan baseline vs. current</p>
        </div>
        <LineDiff from={line.budget} to={current} />
        <span className="ml-auto text-[11px] text-zinc-600">
          {history.length} change{history.length !== 1 ? 's' : ''} on record
        </span>
      </div>

      {history.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-600">On the original plan — no changes yet.</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l border-line pl-5">
          {history.map((c) => (
            <li key={c.id} className="relative">
              {/* Timeline node */}
              <span
                className={`absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full border-2 border-black ${
                  c.source === 'agent' ? 'bg-accent-500' : 'bg-zinc-500'
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-zinc-400">{fmtDateTime(c.at)}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${sourceBadge(
                    c.source,
                  )}`}
                >
                  {c.source === 'agent' ? 'Agent' : 'Manual'}
                </span>
                {c.batchLabel && <span className="text-[11px] text-zinc-500">{c.batchLabel}</span>}
              </div>
              <div className="mt-1.5">
                <LineDiff from={c.from} to={c.to} />
              </div>
              {c.reason && <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{c.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Ad-line row ───────────────────────────────────────────────────────────────

const COL_SPAN = 13;

function AdLineRow({
  line,
  perf,
  budget,
  edited,
}: {
  line: AdLine;
  perf: MetricTotals;
  budget: number;
  edited: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasPerf = perf.impressions > 0;
  const platform = platformById(line.platformId);

  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer border-b border-line/60 transition-colors hover:bg-zinc-900/40"
      >
        {/* Chevron */}
        <td className="py-3 pl-4 pr-1">
          <svg
            className={`h-3.5 w-3.5 text-zinc-600 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        {/* Line ID */}
        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500">{line.id}</td>
        {/* Platform */}
        <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-accent-300">{platform.name}</td>
        {/* Tactic */}
        <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-300">{line.tactic}</td>
        {/* Format */}
        <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">{line.format}</td>
        {/* Market */}
        <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">{line.market}</td>
        {/* Budget */}
        <td className="whitespace-nowrap px-4 py-3 text-right">
          <span className={`text-xs font-medium tabular-nums ${edited ? 'text-accent-300' : 'text-zinc-300'}`}>
            {usd(budget)}
          </span>
          {edited && (
            <span
              className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent-500 align-middle"
              title="Budget changed from the original plan — expand for history"
            />
          )}
        </td>

        {/* Plan / Performance separator */}
        <td className="px-2 py-3">
          <div className="mx-auto h-5 w-px bg-accent-500/40" />
        </td>

        {/* Impressions */}
        <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums">
          {hasPerf ? <span className="font-medium text-accent-300">{compact(perf.impressions)}</span> : <span className="text-zinc-600">—</span>}
        </td>
        {/* CTR */}
        <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums">
          {hasPerf ? <span className="text-zinc-300">{pct(perf.ctr)}</span> : <span className="text-zinc-600">—</span>}
        </td>
        {/* Spend */}
        <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums">
          {hasPerf ? <span className="font-medium text-amber-300">{usd(perf.spend)}</span> : <span className="text-zinc-600">—</span>}
        </td>
        {/* CPM */}
        <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums">
          {hasPerf ? <span className="text-zinc-400">${perf.cpm.toFixed(2)}</span> : <span className="text-zinc-600">—</span>}
        </td>
        {/* Conversions */}
        <td className="whitespace-nowrap px-4 py-3 pr-5 text-right text-xs tabular-nums">
          {hasPerf ? <span className="text-zinc-300">{compact(perf.conversions)}</span> : <span className="text-zinc-600">—</span>}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-line/60 bg-surface-sunken">
          <td colSpan={COL_SPAN}>
            <HistoryDrilldown line={line} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Campaign section ──────────────────────────────────────────────────────────

function CampaignSection({
  campaign,
  lines,
  perfByLine,
  budgetOf,
  editedSet,
}: {
  campaign: Campaign;
  lines: AdLine[];
  perfByLine: Map<string, MetricTotals>;
  budgetOf: (line: AdLine) => number;
  editedSet: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const totalBudget = lines.reduce((s, l) => s + budgetOf(l), 0);
  const totalSpend = lines.reduce((s, l) => s + (perfByLine.get(l.id)?.spend ?? 0), 0);
  const totalImpressions = lines.reduce((s, l) => s + (perfByLine.get(l.id)?.impressions ?? 0), 0);
  const pacePct = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 bg-surface px-5 py-4 text-left transition-colors hover:bg-zinc-800/60"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-white">{campaign.name}</span>
          <div className="mt-1 flex items-center gap-4 text-[11px] text-zinc-500">
            <span>{fmtDate(campaign.startDate)} – {fmtDate(campaign.endDate)}</span>
            <span>{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          <div className="flex items-center gap-2 text-xs tabular-nums">
            <span className="font-medium text-amber-300">{usd(totalSpend)}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{usd(totalBudget)}</span>
          </div>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.min(pacePct, 100)}%` }} />
          </div>
          <span className="text-[10px] text-zinc-600">{pacePct.toFixed(0)}% delivered</span>
        </div>
        <div className="hidden min-w-[80px] shrink-0 flex-col items-end gap-0.5 md:flex">
          <span className="text-xs font-medium text-accent-300 tabular-nums">{compact(totalImpressions)}</span>
          <span className="text-[10px] text-zinc-600">impressions</span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line/60">
                <th colSpan={7} className="px-4 pb-1 pt-3">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">Plan</span>
                </th>
                <th className="px-2 pb-1 pt-3" />
                <th colSpan={5} className="px-4 pb-1 pt-3">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-accent-500">Live Performance</span>
                </th>
              </tr>
              <tr className="border-b border-line/60 bg-surface-sunken/60 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-2 pl-4" />
                <th className="px-4 py-2">Line ID</th>
                <th className="px-4 py-2">Platform</th>
                <th className="px-4 py-2">Tactic</th>
                <th className="px-4 py-2">Format</th>
                <th className="px-4 py-2">Market</th>
                <th className="px-4 py-2 text-right">Budget</th>
                <th className="px-2 py-2" />
                <th className="px-4 py-2 text-right text-accent-500/70">Impr.</th>
                <th className="px-4 py-2 text-right text-accent-500/70">CTR</th>
                <th className="px-4 py-2 text-right text-accent-500/70">Spend</th>
                <th className="px-4 py-2 text-right text-accent-500/70">CPM</th>
                <th className="px-4 py-2 pr-5 text-right text-accent-500/70">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <AdLineRow
                  key={line.id}
                  line={line}
                  perf={perfByLine.get(line.id) ?? EMPTY_TOTALS}
                  budget={budgetOf(line)}
                  edited={editedSet.has(line.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Client section ────────────────────────────────────────────────────────────

function ClientSection({
  client,
  clientCampaigns,
  linesByCampaign,
  perfByLine,
  budgetOf,
  editedSet,
}: {
  client: Client;
  clientCampaigns: Campaign[];
  linesByCampaign: Map<string, AdLine[]>;
  perfByLine: Map<string, MetricTotals>;
  budgetOf: (line: AdLine) => number;
  editedSet: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  const allLines = clientCampaigns.flatMap((c) => linesByCampaign.get(c.id) ?? []);
  const totalBudget = allLines.reduce((s, l) => s + budgetOf(l), 0);
  const totalSpend = allLines.reduce((s, l) => s + (perfByLine.get(l.id)?.spend ?? 0), 0);

  return (
    <section className="space-y-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="group flex w-full items-center gap-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong text-xs font-bold text-zinc-300"
          style={{ backgroundColor: client.accentColor }}
        >
          {client.initials}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <span className="text-base font-semibold text-white transition-colors group-hover:text-zinc-200">
            {client.name}
          </span>
          <p className="mt-0.5 text-xs text-zinc-600">
            {clientCampaigns.length} campaign{clientCampaigns.length !== 1 ? 's' : ''} · {usd(totalBudget)} planned · {usd(totalSpend)} spent
          </p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-600 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="ml-[52px] space-y-2">
          {clientCampaigns.map((campaign) => (
            <CampaignSection
              key={campaign.id}
              campaign={campaign}
              lines={linesByCampaign.get(campaign.id) ?? []}
              perfByLine={perfByLine}
              budgetOf={budgetOf}
              editedSet={editedSet}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const [search, setSearch] = useState('');
  // Effective budgets / history live in localStorage — render the planned
  // baseline until mounted, then re-render with applied changes. useLineChanges
  // re-renders the page whenever a recommendation is applied or undone.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useLineChanges(); // re-render the page whenever a recommendation is applied or undone

  // Per-line performance totals — built once from the static model.
  const perfByLine = useMemo(() => {
    const rows = new Map<string, PerformanceDay[]>();
    for (const p of performanceData) {
      const g = rows.get(p.adLineId);
      if (g) g.push(p);
      else rows.set(p.adLineId, [p]);
    }
    const m = new Map<string, MetricTotals>();
    for (const [id, r] of rows) m.set(id, aggregate(r));
    return m;
  }, []);

  const linesByCampaign = useMemo(() => {
    const m = new Map<string, AdLine[]>();
    for (const l of adLines) {
      const g = m.get(l.campaignId);
      if (g) g.push(l);
      else m.set(l.campaignId, [l]);
    }
    return m;
  }, []);

  // Effective budgets are cheap (one localStorage read per line) — recomputed
  // each render so an apply/undo is reflected immediately, no memo to stale.
  const budgetOf = (line: AdLine) => (mounted ? effectiveBudget(line.id) : line.budget);
  const editedSet = mounted
    ? new Set(adLines.filter((l) => effectiveBudget(l.id) !== l.budget).map((l) => l.id))
    : new Set<string>();

  const q = search.trim().toLowerCase();
  const visibleClients = clients
    .map((client) => ({
      client,
      clientCampaigns: campaigns.filter(
        (c) =>
          c.clientId === client.id &&
          (!q || c.name.toLowerCase().includes(q) || client.name.toLowerCase().includes(q)),
      ),
    }))
    .filter((entry) => entry.clientCampaigns.length > 0);

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Page header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line/60 px-8 py-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">Media Plans</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {clients.length} clients · {campaigns.length} campaigns · {adLines.length} ad lines
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search clients or campaigns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-lg border border-line bg-surface py-2 pl-9 pr-4 text-xs text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Client list */}
      <div className="flex-1 space-y-8 overflow-y-auto px-8 py-6">
        {visibleClients.length > 0 ? (
          visibleClients.map(({ client, clientCampaigns }) => (
            <ClientSection
              key={client.id}
              client={client}
              clientCampaigns={clientCampaigns}
              linesByCampaign={linesByCampaign}
              perfByLine={perfByLine}
              budgetOf={budgetOf}
              editedSet={editedSet}
            />
          ))
        ) : (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <p className="text-sm text-zinc-500">No results for &ldquo;{search}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}
