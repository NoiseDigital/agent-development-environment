// Shared types for chart visualization components

export type ChartDataPoint = {
  name: string;
  value?: number;
  fill?: string;
  [key: string]: string | number | undefined;
};

export type ChartType = 'line' | 'bar' | 'pie' | 'funnel' | 'area' | 'heatmap';

// A single visualization — produced by agents (parsed from JSON) and by the
// Analyze page, rendered by ChartVisualization, and stored in dashboard tiles.
export interface ChartData {
  type: ChartType;
  title?: string;
  insight?: string;
  // Series data for line/bar/pie/funnel/area charts.
  data?: ChartDataPoint[];
  // Optional palette override — agents may theme a chart; falls back to defaults.
  colors?: string[];
  // Line charts: plot the two metrics on independent left/right Y axes — for
  // pairing series of different scales (e.g. spend vs. impressions).
  dualAxis?: boolean;
  // Correlation-matrix fields for heatmap charts.
  rows?: string[];
  cols?: string[];
  matrix?: (number | null)[][];
  significant?: boolean[][];
}
