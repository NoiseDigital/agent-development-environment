// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadUserDashboards,
  saveUserDashboard,
  deleteUserDashboard,
  isUserDashboard,
  type UserDashboardSpec,
} from './user-dashboards';

beforeEach(() => {
  window.localStorage.clear();
});

function spec(id: string, name = id): UserDashboardSpec {
  return {
    id,
    name,
    campaignId: 'all',
    defaultTabId: 'overall',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('user-dashboards (localStorage roundtrip)', () => {
  it('returns [] when nothing has been written yet', () => {
    expect(loadUserDashboards()).toEqual([]);
  });

  it('saves a dashboard and reads it back', () => {
    const a = spec('a');
    saveUserDashboard(a);
    expect(loadUserDashboards()).toEqual([a]);
  });

  it('puts newest saves first (top-of-list ordering)', () => {
    // The dashboards page renders user dashboards in insertion order with
    // newest first — the kebab "create new + pin" flow relies on this so a
    // fresh report appears at the top of the listing without re-sorting.
    saveUserDashboard(spec('old'));
    saveUserDashboard(spec('new'));
    expect(loadUserDashboards().map((d) => d.id)).toEqual(['new', 'old']);
  });

  it('upserts on save — same id replaces the existing entry, not duplicates it', () => {
    saveUserDashboard(spec('a', 'first'));
    saveUserDashboard(spec('a', 'renamed'));
    const all = loadUserDashboards();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('renamed');
  });

  it('deleteUserDashboard removes the entry and leaves the rest intact', () => {
    saveUserDashboard(spec('a'));
    saveUserDashboard(spec('b'));
    saveUserDashboard(spec('c'));
    deleteUserDashboard('b');
    expect(loadUserDashboards().map((d) => d.id)).toEqual(['c', 'a']);
  });

  it('isUserDashboard returns true only for ids that live in localStorage', () => {
    saveUserDashboard(spec('mine'));
    expect(isUserDashboard('mine')).toBe(true);
    expect(isUserDashboard('not-mine')).toBe(false);
  });

  it('survives a malformed localStorage payload by returning []', () => {
    // Defensive: a future schema migration or a corrupted entry shouldn't
    // crash the dashboards page. The contract is "degrade to empty list,
    // never throw".
    window.localStorage.setItem('noise:user-dashboards', 'not valid json {');
    expect(() => loadUserDashboards()).not.toThrow();
    expect(loadUserDashboards()).toEqual([]);
  });
});
