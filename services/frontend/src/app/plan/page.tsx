'use client';

import { useState } from 'react';
import { mockClients, Client, Campaign, Ad, AdStatus, Platform } from '../../data/mockPlanData';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

const statusColors: Record<AdStatus, string> = {
  Active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  Paused: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  Completed: 'bg-zinc-700/50 text-zinc-400 border border-zinc-700',
  Draft: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
};

const platformColors: Record<Platform, string> = {
  'DV360': 'text-blue-400',
  'Meta': 'text-indigo-400',
  'Google Ads': 'text-amber-400',
  'The Trade Desk': 'text-emerald-400',
  'Amazon DSP': 'text-orange-400',
  'TikTok': 'text-pink-400',
  'LinkedIn': 'text-sky-400',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function AdRow({ ad }: { ad: Ad }) {
  const hasPerf = ad.impressions > 0;
  return (
    <tr className="border-b border-zinc-800/60 hover:bg-zinc-900/40 transition-colors">
      {/* Ad ID */}
      <td className="px-4 py-3 font-mono text-[11px] text-zinc-500 whitespace-nowrap">{ad.id}</td>
      {/* Name */}
      <td className="px-4 py-3 text-xs text-white font-medium max-w-[220px]">
        <span className="line-clamp-2">{ad.name}</span>
      </td>
      {/* Format */}
      <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">{ad.format}</td>
      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusColors[ad.status]}`}>
          {ad.status}
        </span>
      </td>
      {/* Platform */}
      <td className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${platformColors[ad.platform]}`}>{ad.platform}</td>
      {/* Flight */}
      <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
        {fmtDate(ad.flightStart)} – {fmtDate(ad.flightEnd)}
      </td>
      {/* Budget */}
      <td className="px-4 py-3 text-xs text-zinc-300 whitespace-nowrap text-right">{fmtCurrency(ad.budget)}</td>
      {/* CPM */}
      <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap text-right">
        {ad.cpm > 0 ? `$${ad.cpm.toFixed(2)}` : '—'}
      </td>

      {/* ── Performance separator ── */}
      <td className="px-2 py-3">
        <div className="w-px h-5 bg-blue-500/40 mx-auto" />
      </td>

      {/* Impressions */}
      <td className="px-4 py-3 text-xs whitespace-nowrap text-right">
        {hasPerf ? (
          <span className="text-blue-300 font-medium">{fmt(ad.impressions)}</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      {/* CTR */}
      <td className="px-4 py-3 text-xs whitespace-nowrap text-right">
        {hasPerf && ad.ctr > 0 ? (
          <span className={`font-medium ${ad.ctr >= 1 ? 'text-emerald-400' : 'text-zinc-300'}`}>{ad.ctr.toFixed(2)}%</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      {/* Spend */}
      <td className="px-4 py-3 text-xs whitespace-nowrap text-right">
        {hasPerf ? (
          <span className="text-amber-300 font-medium">{fmtCurrency(ad.spend)}</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      {/* Creative */}
      <td className="px-4 py-3 text-xs whitespace-nowrap">
        {ad.creativeUrl ? (
          <a
            href={ad.creativeUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 text-[11px]"
          >
            Preview
          </a>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
    </tr>
  );
}

function CampaignSection({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  const totalSpend = campaign.ads.reduce((s, a) => s + a.spend, 0);
  const totalImpressions = campaign.ads.reduce((s, a) => s + a.impressions, 0);
  const pctDelivered = campaign.totalBudget > 0 ? (totalSpend / campaign.totalBudget) * 100 : 0;

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      {/* Campaign header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 bg-zinc-900 hover:bg-zinc-800/60 transition-colors text-left"
      >
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-white text-sm font-semibold">{campaign.name}</span>
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">{campaign.objective}</span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-[11px] text-zinc-500">
            <span>{fmtDate(campaign.flightStart)} – {fmtDate(campaign.flightEnd)}</span>
            <span>{campaign.ads.length} line{campaign.ads.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Budget + delivery bar */}
        <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-300 font-medium">{fmtCurrency(totalSpend)}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{fmtCurrency(campaign.totalBudget)}</span>
          </div>
          <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${Math.min(pctDelivered, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-600">{pctDelivered.toFixed(0)}% delivered</span>
        </div>

        <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 min-w-[80px]">
          <span className="text-xs text-blue-300 font-medium">{fmt(totalImpressions)}</span>
          <span className="text-[10px] text-zinc-600">impressions</span>
        </div>
      </button>

      {/* Ad spreadsheet */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/60">
                {/* Plan columns */}
                <th colSpan={8} className="px-4 pt-3 pb-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">Plan</span>
                </th>
                <th className="px-2 pt-3 pb-1" />
                {/* Performance columns */}
                <th colSpan={4} className="px-4 pt-3 pb-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-500">Live Performance</span>
                </th>
              </tr>
              <tr className="border-b border-zinc-800/60 bg-zinc-950/60">
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Ad ID</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Name</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Format</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Platform</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Flight</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap text-right">Budget</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap text-right">CPM</th>
                <th className="px-2 py-2" />
                <th className="px-4 py-2 text-[10px] font-semibold text-blue-500/70 uppercase tracking-wider whitespace-nowrap text-right">Impr.</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-blue-500/70 uppercase tracking-wider whitespace-nowrap text-right">CTR</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-blue-500/70 uppercase tracking-wider whitespace-nowrap text-right">Spend</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-blue-500/70 uppercase tracking-wider whitespace-nowrap">Creative</th>
              </tr>
            </thead>
            <tbody>
              {campaign.ads.map((ad) => (
                <AdRow key={ad.id} ad={ad} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientSection({ client }: { client: Client }) {
  const [open, setOpen] = useState(true);
  const totalBudget = client.campaigns.reduce((s, c) => s + c.totalBudget, 0);
  const totalSpend = client.campaigns.reduce(
    (s, c) => s + c.ads.reduce((as, a) => as + a.spend, 0),
    0,
  );

  return (
    <section className="space-y-3">
      {/* Client header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 group"
      >
        {/* Logo / initials */}
        <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-xs font-bold text-zinc-300">
          {client.logo}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-base group-hover:text-zinc-200 transition-colors">{client.name}</span>
            <span className="text-[10px] text-zinc-600 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">{client.industry}</span>
          </div>
          <p className="text-xs text-zinc-600 mt-0.5">
            {client.campaigns.length} campaign{client.campaigns.length !== 1 ? 's' : ''} · {fmtCurrency(totalBudget)} total budget · {fmtCurrency(totalSpend)} spent
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Campaigns */}
      {open && (
        <div className="ml-[52px] space-y-2">
          {client.campaigns.map((campaign) => (
            <CampaignSection key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? mockClients
        .map((client) => ({
          ...client,
          campaigns: client.campaigns.filter(
            (c) =>
              c.name.toLowerCase().includes(search.toLowerCase()) ||
              client.name.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((c) => c.campaigns.length > 0)
    : mockClients;

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-800/60 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Media Plans</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {mockClients.length} clients · {mockClients.reduce((s, c) => s + c.campaigns.length, 0)} campaigns
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search clients or campaigns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-56 transition-colors"
            />
          </div>
          {/* New plan button (placeholder) */}
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Plan
          </button>
        </div>
      </div>

      {/* Client list */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {filtered.length > 0 ? (
          filtered.map((client) => (
            <ClientSection key={client.id} client={client} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-zinc-500 text-sm">No results for &ldquo;{search}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}
