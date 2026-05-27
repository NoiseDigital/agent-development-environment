import { describe, it, expect } from 'vitest';
import {
  isClientDashboard,
  isEditable,
  isPinnable,
  canShareExternally,
  dashboardTitle,
} from './dashboard-access';
import type { Dashboard } from '../data/dashboards';

// Minimal Dashboard fixture — the predicates only inspect `ownership`,
// `client`, and `name`, so everything else is shaped-but-unused.
const make = (overrides: Partial<Dashboard>): Dashboard =>
  ({
    id: 'd',
    name: 'My Dashboard',
    client: 'Noise',
    clientInitials: 'H',
    owner: 'You',
    ownership: 'owned',
    lastUpdated: '2025-05-01',
    description: '',
    accentColor: '#000000',
    filters: [],
    campaignId: 'noi-all',
    tabs: [],
    ...overrides,
  }) as Dashboard;

describe('dashboard-access', () => {
  it('isClientDashboard is true only for ownership "client"', () => {
    expect(isClientDashboard(make({ ownership: 'client' }))).toBe(true);
    expect(isClientDashboard(make({ ownership: 'owned' }))).toBe(false);
    expect(isClientDashboard(make({ ownership: 'shared' }))).toBe(false);
  });

  it('isEditable inverts isClientDashboard', () => {
    expect(isEditable(make({ ownership: 'client' }))).toBe(false);
    expect(isEditable(make({ ownership: 'owned' }))).toBe(true);
    expect(isEditable(make({ ownership: 'shared' }))).toBe(true);
  });

  it('isPinnable matches isEditable (client dashboards never accept pins)', () => {
    expect(isPinnable(make({ ownership: 'client' }))).toBe(false);
    expect(isPinnable(make({ ownership: 'owned' }))).toBe(true);
    expect(isPinnable(make({ ownership: 'shared' }))).toBe(true);
  });

  it('canShareExternally is true only for client dashboards', () => {
    expect(canShareExternally(make({ ownership: 'client' }))).toBe(true);
    expect(canShareExternally(make({ ownership: 'owned' }))).toBe(false);
  });

  it('dashboardTitle uses the client name for client dashboards, the name otherwise', () => {
    expect(
      dashboardTitle(make({ ownership: 'client', client: 'Noise', name: 'internal-label' })),
    ).toBe('Noise');
    expect(
      dashboardTitle(make({ ownership: 'owned', client: 'Noise', name: 'My Custom View' })),
    ).toBe('My Custom View');
  });
});
