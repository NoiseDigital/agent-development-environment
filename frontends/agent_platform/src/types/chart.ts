// Shared types for chart visualization components

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie';
  title: string;
  insight: string;
  data: ChartDataPoint[];
}

export type ChartType = 'line' | 'bar' | 'pie';
