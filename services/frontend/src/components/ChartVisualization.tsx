'use client';

import {
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
  BarChart, Bar,
  PieChart, Pie, Cell,
  AreaChart, Area,
  Legend, FunnelChart, Funnel,
  LabelList
} from 'recharts';
import { useRef } from 'react';
import { ChartData, ChartDataPoint } from '../types/chart';
import HeatmapChart from './HeatmapChart';
import ChartActions from './ChartActions';

interface ChartVisualizationProps {
  chart: ChartData;
  /** When true, the chart fills its container height — used for resizable dashboard tiles. */
  fill?: boolean;
  /** When true, show the "+" actions menu (save to dashboard, PNG, raw data). */
  saveable?: boolean;
}

export default function ChartVisualization({ chart, fill = false, saveable = false }: ChartVisualizationProps) {
  const { type, title, insight } = chart;
  const data: ChartDataPoint[] = chart.data ?? [];
  const chartHeight: number | string = fill ? '100%' : 300;
  const rootRef = useRef<HTMLDivElement>(null);
  const headerAction = saveable ? <ChartActions chart={chart} captureRef={rootRef} /> : null;
  // Function to determine if data has multiple metrics
  const hasMultipleMetrics = (data: ChartDataPoint[]): boolean => {
    if (!data || data.length === 0) return false;
    const firstItem = data[0];
    const keys = Object.keys(firstItem).filter(key => key !== 'name' && key !== 'fill');
    return keys.length > 1;
  };

  // Function to get all metrics from data
  const getMetrics = (data: ChartDataPoint[]): string[] => {
    if (!data || data.length === 0) return ['value'];
    const firstItem = data[0];
    return Object.keys(firstItem).filter(key => key !== 'name' && key !== 'fill');
  };

  // Colors for bars in multi-metric bar charts
  const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

  // Colors for funnel chart
  const FUNNEL_COLORS = ["#E3F2FD", "#BBDEFB", "#90CAF9", "#64B5F6", "#42A5F5", "#2196F3", "#1976D2"];

  const renderChart = () => {
    switch (type) {
      case 'line':
        if (hasMultipleMetrics(data)) {
          // Multi-metric line chart
          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                />
                <YAxis
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#F9FAFB'
                  }}
                />
                <Legend
                  wrapperStyle={{
                    paddingTop: 10,
                    paddingLeft: 30,
                    paddingRight: 30,
                    textAlign: 'center'
                  }}
                  iconType="circle"
                  iconSize={10}
                  formatter={(value) => <span style={{ color: '#F9FAFB' }}>{value}</span>}
                />
                {getMetrics(data).map((metric, index) => (
                  <Line
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    stroke={BAR_COLORS[index % BAR_COLORS.length]}
                    strokeWidth={2}
                    dot={{ fill: BAR_COLORS[index % BAR_COLORS.length], strokeWidth: 2, r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          );
        } else {
          // Single metric line chart
          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                />
                <YAxis
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#F9FAFB'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          );
        }

      case 'bar':
        if (hasMultipleMetrics(data)) {
          // Stacked Bar Chart for multiple metrics
          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={data} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                />
                <YAxis
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#F9FAFB'
                  }}
                />
                <Legend
                  wrapperStyle={{
                    paddingTop: 10,
                    paddingLeft: 30,
                    paddingRight: 30,
                    textAlign: 'center'
                  }}
                  iconType="circle"
                  iconSize={10}
                  formatter={(value) => <span style={{ color: '#F9FAFB' }}>{value}</span>}
                />
                {getMetrics(data).map((metric, index) => (
                  <Bar
                    key={metric}
                    dataKey={metric}
                    stackId="a"
                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          );
        } else {
          // Regular Bar Chart
          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                />
                <YAxis
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#F9FAFB'
                  }}
                />
                <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          );
        }

      case 'pie':
        const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F9FAFB'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#4B5563' }}
              />
              <YAxis
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#4B5563' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F9FAFB'
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'funnel':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <FunnelChart layout="horizontal">
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F9FAFB'
                }}
              />
              <Funnel
                data={data}
                dataKey="value"
                width={400}
                stroke="#424242"
                isAnimationActive
                lastShapeType="rectangle"
                orientation="horizontal"
              >
                <LabelList
                  dataKey="name"
                  position="right"
                  fill="#F9FAFB"
                  stroke="none"
                />
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.fill || FUNNEL_COLORS[index % FUNNEL_COLORS.length]}
                  />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        );

      case 'heatmap':
        return (
          <HeatmapChart
            rows={chart.rows ?? []}
            cols={chart.cols ?? []}
            matrix={chart.matrix ?? []}
            significant={chart.significant}
          />
        );

      default:
        return null;
    }
  };

  // Fill mode: chart stretches to its container — used inside resizable dashboard tiles.
  if (fill) {
    return (
      <div className="h-full flex flex-col">
        {title && (
          <h4 className="text-white font-medium text-sm mb-2 shrink-0 truncate">{title}</h4>
        )}
        <div className="flex-1 min-h-0">
          {renderChart()}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mt-3">
      {(title || headerAction) && (
        <div className="flex items-start gap-3 mb-3">
          {title && <h4 className="text-white font-medium">{title}</h4>}
          {headerAction && <div className="ml-auto shrink-0">{headerAction}</div>}
        </div>
      )}

      <div className="mb-4">
        {renderChart()}
      </div>

      {insight && (
        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-3">
          <p className="text-sm text-zinc-300 leading-relaxed">
            <span className="text-blue-400 font-medium">💡 Insight:</span> {insight}
          </p>
        </div>
      )}
    </div>
  );
}
