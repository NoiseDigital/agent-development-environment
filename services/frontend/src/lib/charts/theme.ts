// One Vega-Lite `config` that themes every chart to the platform's surface —
// declared once and applied to every chart shape, including ones no one has
// hand-coded a renderer for.
//
// House style: rounded bar tops, faint dashed grid, no axis domain lines, muted
// labels. The saturated DATA colors (bar/line/categorical/heatmap/ramp) come
// from the active tenant's `branding.charts` (Noise = emerald/blue, its current
// look); only the *chrome* — label/title/grid/rule colors and the point halo —
// flips per theme. Build a theme from one neutral palette so light and dark can
// never drift apart.
import { branding } from '@/config/tenant';

const CH = branding.charts;

interface VegaNeutral {
  title: string; // chart + header title
  subtitle: string; // subtitle + axis/legend titles
  label: string; // axis/legend/text labels
  grid: string; // gridline color (drawn at low opacity)
  rule: string; // reference rules
  pointHalo: string; // thin stroke ringing filled points (the surface color)
}

const DARK: VegaNeutral = {
  title: '#f4f4f5',
  subtitle: '#71717a',
  label: '#9ca3af',
  grid: '#a1a1aa',
  rule: '#52525b',
  pointHalo: '#0b1220',
};

const LIGHT: VegaNeutral = {
  title: '#18181b',
  subtitle: '#71717a',
  label: '#52525b',
  grid: '#71717a',
  rule: '#d4d4d8',
  pointHalo: '#ffffff',
};

function buildVegaTheme(c: VegaNeutral) {
  return {
    background: 'transparent',
    font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    // Friendly number formatting everywhere — uppercase K / M / B with $ and %
    // honored from the format string. The implementation is the `compactNum`
    // Vega expression function, registered when the Vega runtime loads.
    customFormatTypes: true,
    numberFormat: '',
    numberFormatType: 'compactNum',

    title: {
      color: c.title,
      fontSize: 13,
      fontWeight: 600,
      anchor: 'start',
      offset: 14,
      subtitleColor: c.subtitle,
      subtitleFontSize: 11,
    },

    // Axes — labels muted, no domain line or ticks, faint dashed grid.
    axis: {
      labelColor: c.label,
      labelFontSize: 11,
      labelPadding: 6,
      titleColor: c.subtitle,
      titleFontSize: 11,
      titleFontWeight: 500,
      titlePadding: 10,
      domain: false,
      ticks: false,
      grid: true,
      gridColor: c.grid,
      gridOpacity: 0.1,
      gridDash: [3, 3],
    },

    view: { stroke: 'transparent' },

    // Mark defaults — every bar gets rounded tops and the emerald primary; lines
    // and areas get the accent blue. Specs inherit these and stay terse.
    //
    // Lines + points share one color (the line's stroke). A `point: true` mark
    // shorthand inherits the parent line color in Vega-Lite; this `point` block
    // is the fallback for hand-authored point marks so they match the line. The
    // point's thin stroke is the surface color so points read as "punched out"
    // of the line on either theme.
    bar: { cornerRadiusEnd: 4, color: CH.bar },
    line: { stroke: CH.line, strokeWidth: 2.5, interpolate: 'monotone', point: { filled: true, size: 45 } },
    point: { fill: CH.line, size: 45, filled: true, stroke: c.pointHalo, strokeWidth: 1 },
    area: { line: { color: CH.line, strokeWidth: 2 }, opacity: 0.9 },
    rule: { color: c.rule },
    text: { fill: c.label, fontSize: 10 },

    legend: {
      labelColor: c.label,
      labelFontSize: 11,
      titleColor: c.subtitle,
      titleFontSize: 11,
      symbolType: 'circle',
      symbolSize: 80,
    },

    // Facet / small-multiple headers.
    header: {
      labelColor: c.title,
      labelFontSize: 11,
      labelFontWeight: 600,
      titleColor: c.subtitle,
    },

    // Palettes — from branding.charts (shared across light/dark per tenant).
    range: {
      category: [...CH.categorical],
      heatmap: [...CH.heatmap],
      ramp: [...CH.ramp],
    },
  };
}

export const vegaDarkTheme = buildVegaTheme(DARK);
export const vegaLightTheme = buildVegaTheme(LIGHT);

/** Pick the chart config for the active UI theme. */
export function vegaTheme(resolved: 'light' | 'dark') {
  return resolved === 'light' ? vegaLightTheme : vegaDarkTheme;
}
