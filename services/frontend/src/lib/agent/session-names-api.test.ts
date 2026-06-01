import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionNamesApi } from './session-names-api';

// The session-names client is a thin shape adapter over /api/session-names.
// These tests fence the shape contract (names + hidden) and verify the hide
// endpoint round-trips the right body — both regressed in past refactors.

const originalFetch = global.fetch;

function mockJson(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('sessionNamesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('list() returns { names, hidden } and tolerates a missing field', async () => {
    global.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockJson({ names: { 's1': 'Hello' }, hidden: ['s2'] }))
      .mockResolvedValueOnce(mockJson({ names: { 's1': 'Hello' } })); // hidden absent

    const full = await sessionNamesApi.list('data_agent', 'user-1');
    expect(full).toEqual({ names: { s1: 'Hello' }, hidden: ['s2'] });

    const partial = await sessionNamesApi.list('data_agent', 'user-1');
    expect(partial).toEqual({ names: { s1: 'Hello' }, hidden: [] });
  });

  it('hide() POSTs to /session-names/hide with the right body', async () => {
    const spy = vi.fn<typeof fetch>().mockResolvedValue(mockJson({ hidden: 's7' }));
    global.fetch = spy;

    await sessionNamesApi.hide('data_agent', 's7', 'user-1');

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/session-names\/hide$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      app_name: 'data_agent',
      user_id: 'user-1',
      session_id: 's7',
    });
  });

  it('remove() hard-deletes via DELETE with query params', async () => {
    const spy = vi.fn<typeof fetch>().mockResolvedValue(mockJson({ deleted: 's9' }));
    global.fetch = spy;

    await sessionNamesApi.remove('data_agent', 's9', 'user-1');

    const [url, init] = spy.mock.calls[0];
    expect(init?.method).toBe('DELETE');
    expect(String(url)).toContain('session_id=s9');
    expect(String(url)).toContain('app_name=data_agent');
  });
});
