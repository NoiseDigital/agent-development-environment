// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import ChartActions from './ChartActions';
import type { VegaSpec } from '../types/genui';

// ── Module mocks ───────────────────────────────────────────────────────
// Everything that touches network / storage / Next.js is mocked at the
// module level so the component test focuses on the state machine + the
// shape of the create-new + pin payload.

const pinCreate = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/dashboards/pins-api', () => ({
  pinsApi: { create: (...args: unknown[]) => pinCreate(...args) },
}));

const saveUserDashboard = vi.fn();
const loadUserDashboards = vi.fn().mockReturnValue([]);
vi.mock('../lib/dashboards/user-dashboards', () => ({
  saveUserDashboard: (...args: unknown[]) => saveUserDashboard(...args),
  loadUserDashboards: (...args: unknown[]) => loadUserDashboards(...args),
}));

const toastSpy = vi.fn();
vi.mock('../lib/toast', () => ({ showToast: (...args: unknown[]) => toastSpy(...args) }));

// next/link in this RTL setup — return a passthrough anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// Deterministic id generator so we can assert on the created dashboard's id.
vi.mock('../lib/id', () => ({ newId: () => 'new-dash-id' }));

// html-to-image's toPng isn't exercised by the create-new flow but the
// import has to resolve.
vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('data:image/png;base64,fake') }));

// Issue reports aren't touched by the create-new flow either.
vi.mock('../lib/issue-reports', () => ({ saveIssueReport: vi.fn() }));

beforeEach(() => {
  cleanup();
  pinCreate.mockClear();
  saveUserDashboard.mockClear();
  loadUserDashboards.mockClear();
  toastSpy.mockClear();
});

function renderActions() {
  const spec: VegaSpec = { title: 'Weekly Spend', mark: 'line', encoding: {} } as unknown as VegaSpec;
  const ref = createRef<HTMLDivElement>();
  const utils = render(<ChartActions chart={spec} captureRef={ref as React.RefObject<HTMLDivElement | null>} />);
  return { ...utils, spec };
}

describe('ChartActions — kebab create-new personal report flow', () => {
  it('renders the kebab button only by default (menu hidden)', () => {
    renderActions();
    // Menu is closed: no "Save to dashboard" item visible.
    expect(screen.queryByText('Save to dashboard')).not.toBeInTheDocument();
  });

  it('opens the menu → dashboards view → create-new view', () => {
    renderActions();
    fireEvent.click(screen.getByTitle('Chart actions'));
    fireEvent.click(screen.getByText('Save to dashboard'));
    // We're in the dashboards view; create-new button is visible at top.
    const createBtn = screen.getByText('Create new personal report');
    expect(createBtn).toBeInTheDocument();
    fireEvent.click(createBtn);
    // Create-new view now shown: input + Create+pin button.
    expect(screen.getByPlaceholderText(/Personal Report/i)).toBeInTheDocument();
    expect(screen.getByText('Create + pin')).toBeInTheDocument();
  });

  it('Create + pin writes a new user dashboard AND pins the chart to its overall tab', () => {
    const { spec } = renderActions();
    fireEvent.click(screen.getByTitle('Chart actions'));
    fireEvent.click(screen.getByText('Save to dashboard'));
    fireEvent.click(screen.getByText('Create new personal report'));
    fireEvent.change(screen.getByPlaceholderText(/Personal Report/i), {
      target: { value: 'My Q3 Recap' },
    });
    fireEvent.click(screen.getByText('Create + pin'));

    // saveUserDashboard called with the new id + the user-provided name.
    expect(saveUserDashboard).toHaveBeenCalledTimes(1);
    const savedSpec = saveUserDashboard.mock.calls[0][0];
    expect(savedSpec).toMatchObject({
      id: 'new-dash-id',
      name: 'My Q3 Recap',
      campaignId: 'all',
      defaultTabId: 'overall',
    });
    expect(typeof savedSpec.createdAt).toBe('string');

    // pinsApi.create called with the same id, the default `overall` tab, and
    // the chart spec — the exact contract the kebab promises the user.
    expect(pinCreate).toHaveBeenCalledTimes(1);
    expect(pinCreate).toHaveBeenCalledWith('new-dash-id', 'overall', spec);
  });

  it('falls back to a timestamped default name when the input is left blank', () => {
    renderActions();
    fireEvent.click(screen.getByTitle('Chart actions'));
    fireEvent.click(screen.getByText('Save to dashboard'));
    fireEvent.click(screen.getByText('Create new personal report'));
    // Click Create+pin without typing anything.
    fireEvent.click(screen.getByText('Create + pin'));

    expect(saveUserDashboard).toHaveBeenCalledTimes(1);
    const savedSpec = saveUserDashboard.mock.calls[0][0];
    // Default shape: "Personal Report — <Mon> <D>"
    expect(savedSpec.name).toMatch(/^Personal Report — /);
  });

  it('Enter on the name input triggers Create + pin', () => {
    renderActions();
    fireEvent.click(screen.getByTitle('Chart actions'));
    fireEvent.click(screen.getByText('Save to dashboard'));
    fireEvent.click(screen.getByText('Create new personal report'));
    const input = screen.getByPlaceholderText(/Personal Report/i);
    fireEvent.change(input, { target: { value: 'Hit Enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(saveUserDashboard).toHaveBeenCalledTimes(1);
    expect(pinCreate).toHaveBeenCalledTimes(1);
  });

  it('Cancel returns to the dashboards view without writing anything', () => {
    renderActions();
    fireEvent.click(screen.getByTitle('Chart actions'));
    fireEvent.click(screen.getByText('Save to dashboard'));
    fireEvent.click(screen.getByText('Create new personal report'));
    fireEvent.click(screen.getByText('Cancel'));
    // Back to dashboards view — create-new affordance is visible again.
    expect(screen.getByText('Create new personal report')).toBeInTheDocument();
    // And NOTHING was written.
    expect(saveUserDashboard).not.toHaveBeenCalled();
    expect(pinCreate).not.toHaveBeenCalled();
  });

  it('surfaces a toast error when the pin call fails (no silent catch)', async () => {
    // Per the no-silent-handling rule: a failed pin must surface to the
    // user, not just optimistically show "Saved to <name>".
    pinCreate.mockRejectedValueOnce(new Error('network down'));
    renderActions();
    fireEvent.click(screen.getByTitle('Chart actions'));
    fireEvent.click(screen.getByText('Save to dashboard'));
    fireEvent.click(screen.getByText('Create new personal report'));
    fireEvent.click(screen.getByText('Create + pin'));
    // Flush the rejected promise.
    await Promise.resolve();
    await Promise.resolve();
    expect(toastSpy).toHaveBeenCalled();
    const toastArg = toastSpy.mock.calls[0][0];
    expect(toastArg.tone).toBe('error');
  });
});
