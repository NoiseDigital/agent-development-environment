import { describe, it, expect } from 'vitest';
import { AUTOCORR_SAMPLE, MARKET_RADAR_SAMPLE } from './samples';

function rows(csv: string): string[] {
  return csv.trim().split('\n');
}

describe('AUTOCORR_SAMPLE', () => {
  it('is deterministic (same seed → identical CSV)', () => {
    expect(AUTOCORR_SAMPLE.build()).toBe(AUTOCORR_SAMPLE.build());
  });

  it('has the expected header and 180 data rows', () => {
    const lines = rows(AUTOCORR_SAMPLE.build());
    expect(lines[0]).toBe('date,spend,impressions,clicks,sessions,conversions,revenue');
    expect(lines.length).toBe(181); // header + 180
  });

  it('carries a real spend→impressions relationship (Pearson r > 0.8)', () => {
    const lines = rows(AUTOCORR_SAMPLE.build()).slice(1);
    const spend: number[] = [];
    const impr: number[] = [];
    for (const l of lines) {
      const c = l.split(',');
      spend.push(Number(c[1]));
      impr.push(Number(c[2]));
    }
    expect(pearson(spend, impr)).toBeGreaterThan(0.8);
  });
});

describe('MARKET_RADAR_SAMPLE', () => {
  it('is deterministic', () => {
    expect(MARKET_RADAR_SAMPLE.build()).toBe(MARKET_RADAR_SAMPLE.build());
  });

  it('matches the estimator template columns and has rows', () => {
    const lines = rows(MARKET_RADAR_SAMPLE.build());
    expect(lines[0]).toBe('brand,market,channel,partner,spend,impressions,source,date');
    expect(lines.length).toBeGreaterThan(50);
  });
});

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db);
}
