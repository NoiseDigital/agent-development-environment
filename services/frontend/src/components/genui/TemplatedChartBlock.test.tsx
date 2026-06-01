// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TemplatedChartBlock from './TemplatedChartBlock';
import type { TemplatedChartProps } from '../../types/genui';

// Mock ChartBlock — TemplatedChartBlock delegates rendering to it, but the
// underlying VegaChart loads a worker + canvas, which happy-dom doesn't
// implement. Stubbing keeps this test about the templated-chart layer's
// own behaviour (coercion + placeholder), not Vega itself.
vi.mock('./ChartBlock', () => ({
  default: ({ spec }: { spec: unknown }) => (
    <div data-testid="chart-block" data-spec={JSON.stringify(spec)} />
  ),
}));

beforeEach(() => {
  cleanup();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('TemplatedChartBlock', () => {
  it('renders a chart when the payload is well-formed', () => {
    const props: TemplatedChartProps = {
      shape: 'bar_by_dim',
      title: 'Spend by Publisher',
      rows: [
        { name: 'Meta', value: 48000 },
        { name: 'YouTube', value: 41000 },
      ],
      valueFormat: '$',
    };
    render(<TemplatedChartBlock props={props} />);
    expect(screen.getByTestId('chart-block')).toBeInTheDocument();
  });

  it('coerces numeric-string values and still renders the chart', () => {
    // The "chart disappeared on refetch" regression — BigQuery NUMERIC
    // values arrive as strings through the JSON envelope. The component
    // must NOT show the malformed placeholder for this case.
    const props = {
      shape: 'bar_by_dim',
      rows: [{ name: 'Meta', value: '48000' }, { name: 'YouTube', value: '41000' }],
    } as unknown as TemplatedChartProps;
    render(<TemplatedChartBlock props={props} />);
    expect(screen.getByTestId('chart-block')).toBeInTheDocument();
    expect(screen.queryByText(/malformed/i)).not.toBeInTheDocument();
  });

  it('renders the placeholder when the shape is unknown', () => {
    const props = {
      shape: 'donut',
      rows: [{ name: 'A', value: 1 }],
    } as unknown as TemplatedChartProps;
    render(<TemplatedChartBlock props={props} />);
    expect(screen.queryByTestId('chart-block')).not.toBeInTheDocument();
    expect(screen.getByText(/malformed/i)).toBeInTheDocument();
  });

  it('renders the placeholder when no rows survive coercion', () => {
    const props = {
      shape: 'bar_by_dim',
      rows: [{ name: 'A' }, { value: 1 }, 'junk'],
    } as unknown as TemplatedChartProps;
    render(<TemplatedChartBlock props={props} />);
    expect(screen.queryByTestId('chart-block')).not.toBeInTheDocument();
    expect(screen.getByText(/malformed/i)).toBeInTheDocument();
  });

  it('logs a warning when coercion fails (no silent fallback)', () => {
    // Per the no-silent-handling rule: a malformed payload must surface as
    // a console.warn so regressions are visible during dev/QA.
    const warn = vi.spyOn(console, 'warn');
    render(<TemplatedChartBlock props={{ shape: 'donut', rows: [] } as unknown as TemplatedChartProps} />);
    expect(warn).toHaveBeenCalled();
  });
});
