'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { campaigns, clients } from '../data/media-model';
import { generateDashboardSpec } from '../data/mock-dashboard-data';
import { saveUserDashboard, type UserDashboardSpec } from '../lib/user-dashboards';
import { newId } from '../lib/id';

// The "New Dashboard" flow. Two modes: describe it (generative — the agent /
// heuristic composes the spec) or pick a campaign for a standard report.

const EXAMPLES = [
  'An awareness view for Horizon Auto emphasizing video',
  'Conversion performance for the Bloom spring launch',
  'NorthEdge search and keyword deep-dive',
];

const clientName = (clientId: string) =>
  clients.find((c) => c.id === clientId)?.name ?? 'Client';

export default function NewDashboardModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<'generative' | 'standard'>('generative');
  const [prompt, setPrompt] = useState('');
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? '');
  const [name, setName] = useState('');

  const create = (spec: UserDashboardSpec) => {
    saveUserDashboard(spec);
    router.push(`/dashboards/${spec.id}`);
  };

  const submit = () => {
    if (mode === 'generative') {
      if (!prompt.trim()) return;
      create(generateDashboardSpec(prompt));
    } else {
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;
      create({
        id: newId('dash'),
        name: name.trim() || `${clientName(campaign.clientId)} Dashboard`,
        campaignId,
        createdAt: new Date().toISOString(),
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-white">New Dashboard</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 transition-colors hover:text-white"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Mode toggle */}
          <div className="mb-4 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
            {(['generative', 'standard'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {m === 'generative' ? '✨ Generative' : 'From a campaign'}
              </button>
            ))}
          </div>

          {mode === 'generative' ? (
            <>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Describe the dashboard you want
              </label>
              <textarea
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. An awareness view for Horizon Auto emphasizing video"
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Noise composes the campaign, tabs, and focus from your description.
              </p>
            </>
          ) : (
            <>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Campaign
              </label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white transition-colors focus:border-zinc-600 focus:outline-none"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientName(c.clientId)} — {c.name}
                  </option>
                ))}
              </select>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Dashboard name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none"
              />
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={mode === 'generative' && !prompt.trim()}
            className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-40"
          >
            {mode === 'generative' ? 'Generate' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
