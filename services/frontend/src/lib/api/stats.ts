// Client for the statistics REST API. The frontend never talks to mcp-stats
// directly — requests route through the gateway's `/api/v1/stats/<endpoint>`
// proxy. In dev that's a thin pass-through; in production mcp-stats sits
// behind internal-only ingress and the gateway is the only public seam.

import { postJson } from './http';
import { gatewayBase } from '@/lib/api/gateway';

const BASE_URL = gatewayBase();

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
  group_col?: string;
  group_val?: string;
  time_col?: string;
}

export interface PairsParams {
  source: string;
  a: string;
  b: string;
  method?: 'pearson' | 'spearman';
  lag?: number;
  winsorize?: boolean;
  log1p?: boolean;
  zscore?: boolean;
  difference?: boolean;
  group_col?: string;
  group_val?: string;
  time_col?: string;
  sheet?: string;
}

export interface PairsResult {
  a: string;
  b: string;
  method: string;
  n: number;
  r: number | null;
  p: number | null;
  points: { x: number; y: number }[];
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
  /** Echo of the run settings (alpha, lag, group/time, preprocessing) — for export. */
  params?: Record<string, unknown>;
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
  /** Distinct values — present only for low-cardinality categoricals (segments). */
  values?: string[];
}

export interface DescribeResult {
  row_count: number;
  columns: ColumnProfile[];
  numeric_columns: string[];
}

export interface ColumnStat {
  name: string;
  missing_pct: number;
  min: number;
  p01: number;
  median: number;
  p99: number;
  max: number;
  mean: number;
  std: number;
  skew: number;
}

export interface ProfileResult {
  columns: ColumnStat[];
}

export interface RegressParams {
  source: string;
  y: string;
  x: string[];
  add_constant?: boolean;
  zscore?: boolean;
  difference?: boolean;
  lag?: number;
  group_col?: string;
  group_val?: string;
  time_col?: string;
  sheet?: string;
}

export interface RegressCoefficient {
  term: string;
  coef: number;
  std_err: number;
  t: number;
  p_value: number;
  /** 95% confidence interval bounds for the coefficient. */
  ci_low: number;
  ci_high: number;
}

export interface RegressResult {
  y: string;
  x: string[];
  n_obs: number;
  r_squared: number;
  adj_r_squared: number;
  f_pvalue: number;
  coefficients: RegressCoefficient[];
  fit_points: { actual: number; predicted: number }[];
  diagnostics: {
    durbin_watson: number;
    condition_number: number;
    aic: number;
    bic: number;
  };
}

export const statsApi = {
  correlate: (params: CorrelateParams) =>
    postJson<CorrelateResult>(`${BASE_URL}/api/v1/stats/correlate`, params),
  regress: (params: RegressParams) =>
    postJson<RegressResult>(`${BASE_URL}/api/v1/stats/regress`, params),
  pairs: (params: PairsParams) =>
    postJson<PairsResult>(`${BASE_URL}/api/v1/stats/pairs`, params),
  qa: (source: string, sheet?: string) =>
    postJson<QaResult>(`${BASE_URL}/api/v1/stats/qa`, { source, sheet }),
  describe: (source: string, sheet?: string) =>
    postJson<DescribeResult>(`${BASE_URL}/api/v1/stats/describe`, { source, sheet }),
  profile: (source: string, sheet?: string) =>
    postJson<ProfileResult>(`${BASE_URL}/api/v1/stats/profile`, { source, sheet }),
};
