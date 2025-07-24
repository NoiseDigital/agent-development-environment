// Shared types for chart visualization components

export type ChartDataPoint = {
  name: string;
  value?: number;
  fill?: string;
  [key: string]: string | number | undefined;
};

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'funnel' | 'area';
  title: string;
  insight: string;
  data: ChartDataPoint[];
}

export type ChartType = 'line' | 'bar' | 'pie' | 'funnel' | 'area';
