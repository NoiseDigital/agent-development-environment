'use client';

// A side-by-side evaluation page: the same media data rendered by the current
// Recharts pipeline and by Vega-Lite, plus the specs each one emits, plus two
// charts the Recharts `ChartData` contract cannot express. Not wired into nav —
// open /vega-preview directly. Delete the route once a decision is made.

import { breakdown, timeSeries, selectPerformance } from '../../lib/media-query';
import type { ChartData } from '../../types/chart';
import type { VegaSpec } from '../../types/genui';
import ChartVisualization from '../../components/ChartVisualization';
import VegaChart from '../../components/VegaChart';

// ── Data — real aggregates from the media model ───────────────────────────────

const barData = breakdown({ campaignId: 'horizon-q2' }, 'platformId').map((r) => ({
  platform: r.label,
  spend: Math.round(r.totals.spend),
}));

const facetData = breakdown({ campaignId: 'horizon-q2' }, 'platformId').flatMap((r) =>
  timeSeries(selectPerformance({ campaignId: 'horizon-q2', platformId: r.key }), 'week').map((p) => ({
    platform: r.label,
    date: p.date,
    spend: Math.round(p.spend),
  })),
);

// ── The two specs an agent would emit for the SAME bar chart ───────────────────

const rechartsBar: ChartData = {
  type: 'bar',
  title: 'Spend by platform — Horizon Q2',
  data: barData.map((d) => ({ name: d.platform, value: d.spend })),
};

const vegaBar: VegaSpec = {
  title: 'Spend by platform — Horizon Q2',
  data: { values: barData },
  mark: 'bar',
  encoding: {
    x: { field: 'platform', type: 'nominal', sort: '-y', title: null, axis: { labelAngle: 0 } },
    y: { field: 'spend', type: 'quantitative', title: 'Spend (USD)', axis: { format: '$,.2s' } },
    tooltip: [
      { field: 'platform', title: 'Platform' },
      { field: 'spend', type: 'quantitative', format: '$,.0f', title: 'Spend' },
    ],
  },
  height: 280,
};

// ── Two charts the closed ChartData union cannot express ──────────────────────

// layer + transform + conditional encoding — bars above the mean are highlighted.
const vegaLayered: VegaSpec = {
  title: 'Spend vs. campaign average',
  data: { values: barData },
  transform: [{ joinaggregate: [{ op: 'mean', field: 'spend', as: 'avgSpend' }] }],
  layer: [
    {
      mark: 'bar',
      encoding: {
        x: { field: 'platform', type: 'nominal', sort: '-y', title: null, axis: { labelAngle: 0 } },
        y: { field: 'spend', type: 'quantitative', title: 'Spend (USD)', axis: { format: '$,.2s' } },
        color: {
          condition: { test: 'datum.spend >= datum.avgSpend', value: '#10b981' },
          value: '#3f3f46',
        },
        tooltip: [
          { field: 'platform', title: 'Platform' },
          { field: 'spend', type: 'quantitative', format: '$,.0f', title: 'Spend' },
        ],
      },
    },
    {
      mark: { type: 'rule', color: '#f59e0b', strokeDash: [5, 4], size: 1.5 },
      encoding: { y: { aggregate: 'mean', field: 'spend' } },
    },
  ],
  height: 280,
};

// facet — small multiples, one mini area chart per platform.
const vegaFacet: VegaSpec = {
  title: 'Weekly spend by platform — small multiples',
  data: { values: facetData },
  facet: { field: 'platform', type: 'nominal', columns: 4, title: null },
  spec: {
    width: 150,
    height: 84,
    mark: {
      type: 'area',
      line: { color: '#34d399', strokeWidth: 1.5 },
      color: {
        x1: 1, y1: 1, x2: 1, y2: 0,
        gradient: 'linear',
        stops: [
          { offset: 0, color: 'rgba(16,185,129,0.03)' },
          { offset: 1, color: 'rgba(16,185,129,0.45)' },
        ],
      },
    },
    encoding: {
      x: { field: 'date', type: 'temporal', title: null, axis: { format: '%b', tickCount: 3, labelFontSize: 9 } },
      y: { field: 'spend', type: 'quantitative', title: null, axis: { format: '$,.2s', tickCount: 3, labelFontSize: 9 } },
    },
  },
};

// ── Spec pretty-printer — abbreviates inlined data so structure stands out ─────

function pretty(obj: unknown): string {
  return JSON.stringify(
    obj,
    (key, value) => {
      if (key === 'data' && Array.isArray(value)) return `‹${value.length} points›`;
      if (
        key === 'data' &&
        value &&
        typeof value === 'object' &&
        Array.isArray((value as { values?: unknown[] }).values)
      ) {
        return { values: `‹${(value as { values: unknown[] }).values.length} rows›` };
      }
      return value;
    },
    2,
  );
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

function SpecBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-sunken">
      <p className="border-b border-line px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <pre className="max-h-80 overflow-auto px-4 py-3 text-[11px] leading-relaxed text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Section({
  n, title, blurb, children,
}: {
  n: string; title: string; blurb: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-500/15 text-[11px] font-bold text-accent-400">
            {n}
          </span>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-zinc-400">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function FeatureTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-accent-500/30 bg-accent-500/10 px-1.5 py-0.5 font-mono text-[10px] text-accent-400">
      {children}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VegaPreviewPage() {
  return (
    <div className="h-full overflow-y-auto bg-black">
      <div className="mx-auto max-w-5xl space-y-10 px-8 py-8">
        {/* Header */}
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-400">Evaluation</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Vega-Lite vs. Recharts</h1>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-400">
            The same Horizon Q2 media data, rendered by today&apos;s Recharts pipeline and by Vega-Lite —
            then the specs each one emits, then where the difference actually is (and isn&apos;t). Nothing
            here is wired into the agent yet; it&apos;s a working example to decide migration against.
          </p>
        </header>

        {/* 1 — same chart, two engines */}
        <Section
          n="1"
          title="The same chart, two engines"
          blurb="Visual parity is not the question — both render a clean bar chart. The question is what
            sits behind them: Recharts renders through ChartVisualization, a hand-written translator from
            the bespoke ChartData union; Vega-Lite renders the spec directly through its compiler."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Recharts · ChartVisualization">
              <ChartVisualization chart={rechartsBar} />
            </Card>
            <Card title="Vega-Lite · VegaChart">
              <VegaChart spec={vegaBar} />
            </Card>
          </div>
        </Section>

        {/* 2 — what the agent emits */}
        <Section
          n="2"
          title="What the agent emits"
          blurb="For a plain bar, ChartData is actually more compact — that is the honest baseline. The
            difference is vocabulary, not verbosity: ChartData is a closed union (line / bar / pie /
            funnel / area / heatmap), so the agent can only emit shapes the frontend has pre-built. A
            Vega-Lite spec is an open grammar — mark + encoding + transform compose without limit."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SpecBlock label="ChartData (closed union)" code={pretty(rechartsBar)} />
            <SpecBlock label="Vega-Lite (open grammar)" code={pretty(vegaBar)} />
          </div>
        </Section>

        {/* 3 — where the difference actually is */}
        <Section
          n="3"
          title="Where the difference actually is"
          blurb="Be precise about this: Recharts could draw both charts below — a layered bar with a
            reference line, a grid of small charts. It is not a capability gap; Recharts is a complete
            library. The gap is that your bespoke ChartData union has no way to express them, so the agent
            cannot ask for them until you extend the union and add a branch to the ChartVisualization
            translator. With Vega-Lite the agent just emits the spec — the same VegaChart rendered both,
            no renderer code added."
        >
          <div className="space-y-4">
            <Card title="Layered chart — spend vs. the campaign average">
              <VegaChart spec={vegaLayered} />
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                Composed from <FeatureTag>transform</FeatureTag> <FeatureTag>layer</FeatureTag>
                <FeatureTag>conditional encoding</FeatureTag> — a computed mean, a reference rule, and
                bars colored by whether they clear it.
              </p>
            </Card>
            <Card title="Faceted small multiples — weekly spend per platform">
              <div className="overflow-x-auto">
                <VegaChart spec={vegaFacet} />
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                Composed from <FeatureTag>facet</FeatureTag> — one mini chart per platform from a single
                spec. The ChartData union has no concept of small multiples.
              </p>
            </Card>
          </div>
        </Section>

        {/* 4 — verdict */}
        <Section
          n="4"
          title="So what actually changes"
          blurb="Vega-Lite is not more powerful than Recharts — that framing is wrong. Both can draw
            anything on this page. The decision is about maintenance surface and how generative you want
            visualization to be. Here is the honest ledger."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                What you actually gain
              </p>
              <ul className="space-y-2 text-xs leading-relaxed text-zinc-300">
                <li>• <span className="text-white">No translator to maintain</span> — ChartVisualization&apos;s per-type switch grows with every chart shape you support. The Vega-Lite compiler replaces it and you don&apos;t maintain it.</li>
                <li>• <span className="text-white">New shapes cost nothing</span> — layered, faceted, annotated, dual-axis: the agent emits them without a frontend change. In the current model each is a PR.</li>
                <li>• <span className="text-white">Open vocabulary, bounded by your guard</span> — the agent composes freely; <code className="rounded bg-surface-sunken px-1 text-[11px] text-accent-300">vega-guard</code>&apos;s allowlist keeps it in bounds. You set the dial.</li>
                <li>• <span className="text-white">LLM-native</span> — the model emits Vega-Lite from training knowledge; ChartData it knows only from your prompt. Real, but modest — ChartData is small.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                What it does <span className="italic">not</span> give you
              </p>
              <ul className="space-y-2 text-xs leading-relaxed text-zinc-300">
                <li>• <span className="text-white">Not new capability</span> — Recharts draws layered, faceted, conditional charts too. Nothing here is &ldquo;impossible&rdquo; today.</li>
                <li>• <span className="text-white">Not more style control</span> — both run defaults the agent can override. That model is identical; it isn&apos;t a reason to switch.</li>
                <li>• <span className="text-white">Bundle &amp; supply chain</span> — the Vega runtime added ~218 packages and npm flagged 10 advisories; worth an audit before production.</li>
                <li>• <span className="text-white">Not React</span> — Vega renders through its own runtime, so the ChartActions save wiring must be re-bridged for Vega charts.</li>
              </ul>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs leading-relaxed text-zinc-400">
              <span className="font-semibold text-white">Honest verdict:</span> if your chart needs are
              bounded and stable — the handful of shapes you have — the current system is genuinely fine and
              simpler. Don&apos;t migrate for its own sake. Vega-Lite earns its place only if you want the
              agent to generate a wide and growing variety of visualizations without a frontend change each
              time. It&apos;s a maintenance-surface decision, not a capability one. If you do adopt it, stage
              it: the agent path first (the{' '}
              <code className="rounded bg-surface-sunken px-1 text-[11px] text-accent-300">vega</code> block
              is already in the catalog), dashboard tiles later or never.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
