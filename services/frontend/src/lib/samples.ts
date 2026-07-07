// Bundled sample datasets for the analysis modules. A "Load sample dataset"
// action turns one of these into a real upload via the same path as a user file,
// so a live demo can get to charts in one click — no data-prep friction.
//
// Deterministic (seeded LCG, no Math.random) so the same demo produces the same
// numbers every time. Shared here so any module can offer a sample.

export interface SampleDataset {
  /** Filename the upload is registered under (drives the source label). */
  filename: string;
  /** Builds the CSV text on demand (kept lazy — never runs unless clicked). */
  build: () => string;
}

/** Tiny seeded PRNG (mulberry32) — deterministic across runs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian-ish noise in [-1, 1] via averaged uniforms. */
function noise(r: () => number): number {
  return (r() + r() + r() - 1.5) / 1.5;
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((row) => row.map(esc).join(','))].join('\n');
}

function isoDay(dayIndex: number): string {
  // Start 2024-01-01, add dayIndex days. Fixed base — no `new Date()` needed.
  const base = Date.UTC(2024, 0, 1);
  return new Date(base + dayIndex * 86_400_000).toISOString().slice(0, 10);
}

function isoMonth(monthIndex: number): string {
  const y = 2024 + Math.floor(monthIndex / 12);
  const m = (monthIndex % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

// ── AutoCorr: a marketing time series with real, layered correlations ─────────
// spend → impressions → clicks → sessions/conversions → revenue, with weekly
// seasonality and a slight spend→next-day-conversions lag. Gives strong signals,
// a near-mechanical pair (spend↔impressions), and a clean regression target.
export const AUTOCORR_SAMPLE: SampleDataset = {
  filename: 'autocorr-sample-marketing.csv',
  build: () => {
    const r = rng(1337);
    const headers = [
      'date', 'spend', 'impressions', 'clicks', 'sessions', 'conversions', 'revenue',
    ];
    const rows: (string | number)[][] = [];
    let prevSpend = 5000;
    for (let d = 0; d < 180; d++) {
      const weekly = 1 + 0.25 * Math.sin((2 * Math.PI * d) / 7);
      const trend = 1 + d / 400;
      const spend = Math.max(800, 5000 * weekly * trend * (1 + 0.12 * noise(r)));
      const impressions = Math.round(spend * 82 * (1 + 0.06 * noise(r)));
      const clicks = Math.round(impressions * 0.012 * (1 + 0.15 * noise(r)));
      const sessions = Math.round(clicks * 1.5 * (1 + 0.2 * noise(r)) + 40);
      // Conversions lean on today's clicks + a little of yesterday's spend.
      const conversions = Math.round(
        clicks * 0.05 * (1 + 0.25 * noise(r)) + prevSpend * 0.0004 + 3,
      );
      const revenue = Math.round(conversions * 85 * (1 + 0.1 * noise(r)));
      rows.push([
        isoDay(d), Math.round(spend), impressions, clicks, sessions, conversions, revenue,
      ]);
      prevSpend = spend;
    }
    return toCsv(headers, rows);
  },
};

// ── Market Radar: a competitive export (MediaRadar-shaped) ────────────────────
// Brands × markets × channels over 12 months, with brand- and market-level spend
// levels + seasonality, so SOV, estimates, and 12-month trajectories all populate.
export const MARKET_RADAR_SAMPLE: SampleDataset = {
  filename: 'market-radar-sample-competitive.csv',
  build: () => {
    const r = rng(90210);
    const headers = [
      'brand', 'market', 'channel', 'partner', 'spend', 'impressions', 'source', 'date',
    ];
    const brands: [string, number][] = [
      ['Acme', 1.0], ['Globex', 1.35], ['Initech', 0.7], ['Umbrella', 0.5],
    ];
    const markets: [string, number][] = [['US', 1.0], ['UK', 0.6], ['DE', 0.45]];
    const channels: [string, string][] = [
      ['CTV', 'Hulu'], ['Display', 'Trade Desk'], ['Video', 'YouTube'], ['Social', 'Meta'],
    ];
    const rows: (string | number)[][] = [];
    for (let m = 0; m < 12; m++) {
      const season = 1 + 0.3 * Math.sin((2 * Math.PI * m) / 12);
      for (const [brand, bLevel] of brands) {
        for (const [market, mLevel] of markets) {
          for (const [channel, partner] of channels) {
            // Not every brand runs every channel every month — sparsity is realistic.
            if (r() < 0.25) continue;
            const spend = Math.round(
              90_000 * bLevel * mLevel * season * (0.6 + 0.8 * r()),
            );
            const cpm = 6 + 8 * r();
            const impressions = Math.round((spend / cpm) * 1000);
            rows.push([
              brand, market, channel, partner, spend, impressions, 'MediaRadar', isoMonth(m),
            ]);
          }
        }
      }
    }
    return toCsv(headers, rows);
  },
};
