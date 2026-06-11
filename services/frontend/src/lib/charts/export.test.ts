import { describe, it, expect } from 'vitest';
import { specTitle, slug, chartToCsv } from './export';
import type { VegaSpec } from '../../types/genui';

describe('specTitle', () => {
  it('returns a bare string title as-is', () => {
    expect(specTitle({ title: 'Spend over time' } as unknown as VegaSpec)).toBe('Spend over time');
  });
  it('unwraps a { text } title object', () => {
    expect(specTitle({ title: { text: 'Weekly trend' } } as unknown as VegaSpec)).toBe('Weekly trend');
  });
  it('falls back to "chart" when the title is missing or malformed', () => {
    expect(specTitle({} as VegaSpec)).toBe('chart');
    expect(specTitle({ title: 42 } as unknown as VegaSpec)).toBe('chart');
    expect(specTitle({ title: { foo: 'bar' } } as unknown as VegaSpec)).toBe('chart');
  });
});

describe('slug', () => {
  it('lowercases and replaces runs of non-alphanumerics with a single dash', () => {
    expect(slug('Spend by Publisher (2024)')).toBe('spend-by-publisher-2024');
  });
  it('strips leading and trailing dashes', () => {
    expect(slug('  -- spend -- ')).toBe('spend');
  });
  it('falls back to "chart" when the input is empty', () => {
    expect(slug('')).toBe('chart');
    expect(slug('—–—')).toBe('chart'); // unicode dashes become empty after replace
  });
});

describe('chartToCsv', () => {
  it('returns "" when there are no inline values', () => {
    expect(chartToCsv({} as VegaSpec)).toBe('');
    expect(chartToCsv({ data: { url: '/x.csv' } } as unknown as VegaSpec)).toBe('');
    expect(chartToCsv({ data: { values: [] } } as unknown as VegaSpec)).toBe('');
  });

  it('serialises a simple row set with the first row\'s keys as headers', () => {
    const spec = {
      data: { values: [{ publisher: 'Meta', spend: 100 }, { publisher: 'YouTube', spend: 200 }] },
    } as unknown as VegaSpec;
    expect(chartToCsv(spec)).toBe('publisher,spend\nMeta,100\nYouTube,200');
  });

  it('quotes and escapes values containing a comma, quote, or newline', () => {
    // RFC-4180-ish: a stray comma in a value used to break Excel imports;
    // pin the escaping so a regression here is caught loudly.
    const spec = {
      data: {
        values: [
          { name: 'Hello, world', note: 'has "quotes"' },
          { name: 'multi\nline', note: 'plain' },
        ],
      },
    } as unknown as VegaSpec;
    const csv = chartToCsv(spec);
    expect(csv).toContain('"Hello, world"');
    expect(csv).toContain('"has ""quotes"""');
    expect(csv).toContain('"multi\nline"');
  });

  it('renders null/undefined cells as empty strings', () => {
    const spec = {
      data: { values: [{ a: 1, b: null, c: undefined }] },
    } as unknown as VegaSpec;
    expect(chartToCsv(spec)).toBe('a,b,c\n1,,');
  });
});
