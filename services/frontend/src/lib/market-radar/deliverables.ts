// Client-ready Market Radar deliverables: a multi-sheet Excel workbook and a
// branded, print-to-PDF HTML report. Both are dependency-free — the workbook is
// SpreadsheetML (see ./workbook), the report is a self-contained HTML document
// the browser prints to PDF. The build* functions are pure so they unit-test.

import type { MarketRadarResult } from '../api/market-radar';
import type { Sheet } from './workbook';
import { downloadWorkbook } from './workbook';

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const round = (n: number) => Math.round(n);

export interface ReportMeta {
  brandName: string;
  /** Accent hex for headings/rules (tenant accent). */
  accent: string;
  sourceLabel: string;
  /** Pre-formatted date string (kept out of the pure builder). */
  generatedAt: string;
}

/** Compose the workbook sheets from an estimator result. */
export function marketRadarSheets(result: MarketRadarResult): Sheet[] {
  const k = result.kpis;
  const sheets: Sheet[] = [
    {
      name: 'Summary',
      columns: ['Metric', 'Value'],
      rows: [
        ['Mode', result.mode],
        ['Observed spend', round(k.observed_spend)],
        ['Estimated spend (base)', round(k.estimated_base)],
        ['Estimated low', round(k.estimated_low)],
        ['Estimated high', round(k.estimated_high)],
        ['Model support score', Number(k.model_support_score.toFixed(3))],
        ['Brands', k.brands],
        ['Markets', k.markets],
      ],
    },
    {
      name: 'Estimates by Market',
      columns: ['Market', 'Observed', 'Estimated', 'Low', 'High', 'Competitors', 'Support'],
      rows: result.by_market.map((m) => [
        m.market, round(m.observed), round(m.base), round(m.low), round(m.high),
        m.competitors, Number(m.support.toFixed(3)),
      ]),
    },
    {
      name: 'Estimates by Brand',
      columns: ['Brand', 'Observed', 'Estimated'],
      rows: result.by_brand.map((b) => [b.brand, round(b.observed_spend), round(b.estimated_base)]),
    },
    {
      name: 'Share of Voice',
      columns: ['Market', 'Brand', 'Observed', 'Market spend', 'Spend SOV', 'Impression SOV'],
      rows: result.sov.map((s) => [
        s.market, s.brand, round(s.observed_spend), round(s.market_spend),
        Number(s.spend_sov.toFixed(4)),
        s.impression_sov != null ? Number(s.impression_sov.toFixed(4)) : '',
      ]),
    },
    {
      name: 'Observed vs Estimated',
      columns: ['Brand', 'Market', 'Observed', 'Estimated', 'Confidence'],
      rows: result.observed_vs_estimated.map((o) => [
        o.brand, o.market, round(o.observed_spend), round(o.estimated_base),
        Number(o.confidence.toFixed(3)),
      ]),
    },
    {
      name: 'Top Combinations',
      columns: ['Brand', 'Market', 'Estimated', 'Support band'],
      rows: result.top_combinations.map((t) => [
        t.brand, t.market, round(t.estimated_base), t.support_band,
      ]),
    },
    {
      name: 'Insights',
      columns: ['Type', 'Insight'],
      rows: result.insights.map((i) => [i.type, i.text]),
    },
  ];
  return sheets;
}

export function downloadMarketRadarWorkbook(result: MarketRadarResult): void {
  downloadWorkbook('market-radar-workbook.xls', marketRadarSheets(result));
}

// ── Branded PDF report (print-to-PDF HTML) ────────────────────────────────────

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Top-2 brands by spend share within each market (sov is pre-sorted desc). */
function sovLeaders(result: MarketRadarResult): { market: string; brands: string }[] {
  const seen = new Map<string, string[]>();
  for (const s of result.sov) {
    const cur = seen.get(s.market) ?? [];
    if (cur.length < 2) {
      cur.push(`${s.brand} ${pct(s.spend_sov)}`);
      seen.set(s.market, cur);
    }
  }
  return [...seen].slice(0, 8).map(([market, brands]) => ({ market, brands: brands.join(', ') }));
}

/** Build a self-contained, branded HTML report for print-to-PDF. Pure. */
export function buildReportHtml(result: MarketRadarResult, meta: ReportMeta): string {
  const k = result.kpis;
  const accent = esc(meta.accent);
  const kpiCard = (label: string, value: string) =>
    `<div class="kpi"><div class="kpi-l">${esc(label)}</div><div class="kpi-v">${esc(value)}</div></div>`;

  const marketRows = result.by_market
    .slice(0, 12)
    .map(
      (m) =>
        `<tr><td>${esc(m.market)}</td><td class="n">${usd0.format(round(m.base))}</td>` +
        `<td class="n">${usd0.format(round(m.low))}–${usd0.format(round(m.high))}</td>` +
        `<td class="n">${pct(m.support)}</td></tr>`,
    )
    .join('');

  const sovRows = sovLeaders(result)
    .map((l) => `<tr><td>${esc(l.market)}</td><td>${esc(l.brands)}</td></tr>`)
    .join('');

  const insightItems = result.insights
    .map((i) => `<li><strong>${esc(i.type)}:</strong> ${esc(i.text)}</li>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.brandName)} — Market Radar</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; margin: 0; padding: 40px; }
  header { border-bottom: 3px solid var(--accent); padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 22px; margin: 0; color: var(--accent); }
  .sub { color: #666; font-size: 12px; margin-top: 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-left: 3px solid var(--accent); padding-left: 8px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 12px; }
  .kpi { flex: 1 1 130px; border: 1px solid #e2e2e2; border-radius: 8px; padding: 10px 12px; }
  .kpi-l { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  .kpi-v { font-size: 17px; font-weight: 600; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  th { color: #666; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  ul { margin: 6px 0; padding-left: 18px; } li { margin: 3px 0; }
  .note { margin-top: 24px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 0; } }
</style></head><body>
<header>
  <h1>${esc(meta.brandName)} · Market Radar</h1>
  <div class="sub">Competitive Media Intelligence — ${esc(meta.sourceLabel)} · ${esc(meta.generatedAt)} · ${esc(result.mode)} mode</div>
</header>

<h2>Estimated market</h2>
<div class="kpis">
  ${kpiCard('Observed spend', usdCompact.format(k.observed_spend))}
  ${kpiCard('Estimated spend', usdCompact.format(k.estimated_base))}
  ${kpiCard('Range', `${usdCompact.format(k.estimated_low)}–${usdCompact.format(k.estimated_high)}`)}
  ${kpiCard('Model support', pct(k.model_support_score))}
  ${kpiCard('Brands · Markets', `${k.brands} · ${k.markets}`)}
</div>

<h2>Estimates by market</h2>
<table><thead><tr><th>Market</th><th class="n">Estimated</th><th class="n">Range</th><th class="n">Support</th></tr></thead>
<tbody>${marketRows}</tbody></table>

${sovRows ? `<h2>Share-of-voice leaders</h2>
<table><thead><tr><th>Market</th><th>Leaders (spend SOV)</th></tr></thead><tbody>${sovRows}</tbody></table>` : ''}

${insightItems ? `<h2>Analyst insights</h2><ul>${insightItems}</ul>` : ''}

<div class="note">
  Estimates are DIRECTIONAL — grossed up from observed tracking, not billed spend. Model support is a
  data-coverage score, not statistical confidence. Share of voice is computed on observed spend and is
  the most robust figure here. Generated by ${esc(meta.brandName)} Market Radar.
</div>
</body></html>`;
}

/** Open the branded report in a new window and invoke print-to-PDF. */
export function openMarketRadarReport(result: MarketRadarResult, meta: ReportMeta): void {
  const html = buildReportHtml(result, meta);
  const win = window.open('', '_blank');
  if (!win) return; // popup blocked — caller can surface a hint
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out before printing.
  win.setTimeout(() => win.print(), 300);
}
