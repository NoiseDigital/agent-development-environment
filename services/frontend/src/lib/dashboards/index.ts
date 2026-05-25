// Public surface of the dashboards module.
//
// Components import types and the data source from here; the data source's
// concrete backend is chosen in ONE place (this file) so swapping mock ↔ BQ
// is a one-line change.

export * from './types';
export type {
  DashboardDataSource,
  MetricFilter,
  MetricKey,
  NamedValue,
  SeriesPoint,
  PopRow,
  PopWindows,
  DateRange,
  MetricTotalsRow,
  MetricSeriesRow,
  NestedDim,
  NestedFilter,
  NestedRow,
  NestedTotalsFilter,
  NestedTotalsRow,
  FilterDim,
  CampaignWindow,
  CampaignWindowsFilter,
} from './data-source';

import { bqDashboardDataSource } from './bq-data-source';
export { bqDashboardDataSource };
export { invalidateAll as invalidateDashboardCache } from './cache';

/** The data source dashboards actually consume. Points at BigQuery via the
 *  gateway today; swap in a mock implementation by reassigning this binding
 *  (e.g. for tests or for offline UI iteration). */
export const dashboardData = bqDashboardDataSource;
