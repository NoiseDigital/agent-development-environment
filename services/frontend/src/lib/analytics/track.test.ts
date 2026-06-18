// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { track } from './track';

describe('track', () => {
  beforeEach(() => {
    (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag = vi.fn();
  });

  afterEach(() => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    vi.restoreAllMocks();
  });

  it('forwards the event name + params to gtag as a GA4 event', () => {
    track('agent_run', { agent: 'x', status: 'success' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'agent_run', {
      agent: 'x',
      status: 'success',
    });
  });

  it('emits an event with no params', () => {
    track('logout');
    expect(window.gtag).toHaveBeenCalledWith('event', 'logout', undefined);
  });

  it('no-ops (does not throw) when gtag is absent — ad-block / dev / no GA id', () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    expect(() => track('login', { method: 'google' })).not.toThrow();
  });

  it('emits each of the newly added events', () => {
    track('session_resumed', { app: 'a', event_count: 3 });
    track('conversation_deleted', { app: 'a' });
    track('dashboard_viewed', { dashboard_id: 'd', source: 'code' });
    track('plan_viewed', { level: 'campaign' });
    track('user_invited', { role: 'member' });
    track('role_changed', { target: 'user', role: 'admin' });
    expect(window.gtag).toHaveBeenCalledTimes(6);
    expect(window.gtag).toHaveBeenLastCalledWith('event', 'role_changed', {
      target: 'user',
      role: 'admin',
    });
  });
});
