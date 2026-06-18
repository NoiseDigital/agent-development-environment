'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { saveUserDashboard } from '../../lib/dashboards/user-dashboards';
import { track } from '../../lib/analytics/track';
import { newId } from '../../lib/id';
import { listClients, clientBySlug, type Client } from '../../data/clients';
import { dashboardData, type NamedValue } from '../../lib/dashboards';

// New Dashboard flow — single mode: "From client". Pick a client, optionally
// scope to one campaign (otherwise the dashboard sees the whole client
// dataset), name it, create. The dashboard is editable + lives on the user's
// account; everything inside it pulls from BigQuery live.
//
// Why one mode now (the previous "Generative" tab was removed):
// 1. The generative path was synthetic — it composed mock data into a spec.
//    With every tile live from BigQuery, an LLM-shaped dashboard is the
//    natural next thing to build via the FloatingAssistant in edit mode,
//    not a separate modal.
// 2. "From client" + "filter to a campaign" covers 100% of the cases that
//    the old modal actually delivered, with real data underneath.

export default function NewDashboardModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const clients = listClients();

  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? 'noi');
  const [campaign, setCampaign] = useState<string>(''); // empty = whole client
  const [name, setName] = useState('');
  const [campaignOptions, setCampaignOptions] = useState<NamedValue[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Pull campaign names live from BigQuery so the dropdown only shows real
  // values. Per-client filtering would key on a `client_id` column; today
  // the NOI dataset is single-client so every campaign belongs to NOI.
  useEffect(() => {
    let cancelled = false;
    setLoadingCampaigns(true);
    dashboardData
      .dimensionValues('campaign', 50)
      .then((rows) => { if (!cancelled) setCampaignOptions(rows); })
      .catch(() => { if (!cancelled) setCampaignOptions([]); })
      .finally(() => { if (!cancelled) setLoadingCampaigns(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  const client = clientBySlug(clientId);

  const create = () => {
    const id = newId();
    const fallbackName = campaign
      ? `${client.name} — ${campaign}`
      : `${client.name} — Working Dashboard`;
    saveUserDashboard({
      id,
      name: name.trim() || fallbackName,
      // Once user_dashboards is fully wired to the server, the campaign filter
      // becomes a `layout` JSON field. For now it rides through campaignId
      // as a marker; the dashboard's TrendTile et al. read filters via
      // DashboardFilterContext at render time.
      campaignId: campaign || 'all',
      createdAt: new Date().toISOString(),
    });
    track('dashboard_created', { scope: campaign ? 'campaign' : 'all' });
    router.push(`/dashboards/${id}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">New dashboard</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-faint transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <ClientPicker clients={clients} value={clientId} onChange={setClientId} />

          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-faint">
              Scope
            </label>
            <select
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              disabled={loadingCampaigns}
              className="w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-xs text-foreground transition-colors focus:border-line-strong focus:outline-none disabled:opacity-60"
            >
              <option value="">Entire {client.name} dataset</option>
              {campaignOptions.map((o) => (
                <option key={o.name} value={o.name}>{o.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-faint">
              {campaign
                ? `Filtered to the "${campaign}" campaign.`
                : 'No campaign filter — every tile sees the full client dataset.'}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-faint">
              Dashboard name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={campaign ? `${client.name} — ${campaign}` : `${client.name} — Working Dashboard`}
              className="w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-xs text-foreground placeholder-disabled transition-colors focus:border-line-strong focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-subtle transition-colors hover:border-line-strong hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={create}
            className="rounded-lg bg-inverse px-3 py-1.5 text-[11px] font-semibold text-inverse-foreground transition-colors hover:bg-inverse/90"
          >
            Create dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

/** Brand-mark selector for the client picker. Shows the logo + name; clicking
 *  selects that client. Single-client today, so the picker is more of a
 *  preview — but the shape supports multiple clients without further work. */
function ClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: readonly Client[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-faint">
        From client
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {clients.map((c) => {
          const selected = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                selected
                  ? 'border-positive bg-positive/10'
                  : 'border-line bg-surface-sunken hover:border-line-strong'
              }`}
            >
              {c.logoPath ? (
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-line bg-surface-sunken">
                  <Image src={c.logoPath} alt={c.name} width={32} height={32} className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface-raised text-[10px] font-bold text-muted">
                  {c.initials}
                </div>
              )}
              <span className="truncate text-xs font-medium text-foreground">{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
