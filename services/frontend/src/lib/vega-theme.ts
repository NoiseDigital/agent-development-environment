// One Vega-Lite `config` that themes every chart to the platform's dark
// surface — the Vega-Lite analogue of the palette/axis/mark props scattered
// through ChartVisualization, except declared once and applied to every chart
// shape, including ones no one has hand-coded a renderer for.
//
// Tuned to match the Recharts charts: emerald primary, rounded bar tops, faint
// dashed grid, no axis domain lines, muted zinc labels.

export const vegaDarkTheme = {
  background: 'transparent',
  font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  padding: 4,

  // Title — matches the white, start-anchored chart titles in ChartVisualization.
  title: {
    color: '#f4f4f5',
    fontSize: 13,
    fontWeight: 600,
    anchor: 'start',
    offset: 14,
    subtitleColor: '#71717a',
    subtitleFontSize: 11,
  },

  // Axes — labels in muted zinc, no domain line or ticks, faint dashed grid.
  axis: {
    labelColor: '#9ca3af',
    labelFontSize: 11,
    labelPadding: 6,
    titleColor: '#71717a',
    titleFontSize: 11,
    titleFontWeight: 500,
    titlePadding: 10,
    domain: false,
    ticks: false,
    grid: true,
    gridColor: '#a1a1aa',
    gridOpacity: 0.1,
    gridDash: [3, 3],
  },

  view: { stroke: 'transparent' },

  // Mark defaults — every bar gets rounded tops and the emerald primary; lines
  // and areas get the accent blue. Specs inherit these and stay terse.
  bar: { cornerRadiusEnd: 4, color: '#10b981' },
  line: { stroke: '#3b82f6', strokeWidth: 2.5 },
  point: { fill: '#3b82f6', size: 55, filled: true },
  area: { line: { color: '#3b82f6', strokeWidth: 2 }, opacity: 0.9 },
  rule: { color: '#52525b' },
  text: { fill: '#a1a1aa', fontSize: 10 },

  legend: {
    labelColor: '#a1a1aa',
    labelFontSize: 11,
    titleColor: '#71717a',
    titleFontSize: 11,
    symbolType: 'circle',
    symbolSize: 80,
  },

  // Facet / small-multiple headers.
  header: {
    labelColor: '#d4d4d8',
    labelFontSize: 11,
    labelFontWeight: 600,
    titleColor: '#71717a',
  },

  // Palettes — emerald-led categorical, matching the dashboard charts.
  range: {
    category: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'],
    heatmap: ['#0b3b2e', '#0f766e', '#10b981', '#6ee7b7'],
    ramp: ['#172554', '#1e40af', '#3b82f6', '#93c5fd'],
  },
};
