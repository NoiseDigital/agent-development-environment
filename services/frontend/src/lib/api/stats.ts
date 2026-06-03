// Client for the statistics REST API. The frontend never talks to mcp-stats
// directly — requests route through the gateway's `/api/stats/<endpoint>`
// proxy. In dev that's a thin pass-through; in production mcp-stats sits
// behind internal-only ingress and the gateway is the only public seam.

import { postJson } from './http';

const BASE_URL = process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8080';

export interface CorrelateParams {
  /** Source URI — "upload:<id>" or "bigquery:<dataset>.<table>". */
  source: string;
  sheet?: string;
  set_a?: string[];
  set_b?: string[];
  method?: 'pearson' | 'spearman';
  alpha?: number;
  lag?: number;
  top_n?: number;
  winsorize?: boolean;
  log1p?: boolean;
  zscore?: boolean;
  difference?: boolean;
}

export interface TopSignal {
  a: string;
  b: string;
  r: number;
  p: number;
  abs_r: number;
}

export interface CorrelateResult {
  method: string;
  rows: string[];
  cols: string[];
  matrix: (number | null)[][];
  pvalues: (number | null)[][];
  significant: boolean[][];
  top_signals: TopSignal[];
  n_rows_used: number;
}

export interface QaResult {
  ok: boolean;
  warnings: string[];
  row_count: number;
  column_count: number;
}

export type ColumnKind = 'numeric' | 'datetime' | 'categorical';

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  missing_pct: number;
}

export interface DescribeResult {
  row_count: number;
  columns: ColumnProfile[];
  numeric_columns: string[];
}

export const statsApi = {
  correlate: (params: CorrelateParams) =>
    postJson<CorrelateResult>(`${BASE_URL}/api/stats/correlate`, params),
  qa: (source: string, sheet?: string) =>
    postJson<QaResult>(`${BASE_URL}/api/stats/qa`, { source, sheet }),
  describe: (source: string, sheet?: string) =>
    postJson<DescribeResult>(`${BASE_URL}/api/stats/describe`, { source, sheet }),
};
