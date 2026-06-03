// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import { loadBlockState, saveBlockState } from './state';

beforeEach(() => {
  window.localStorage.clear();
});

describe('genui-state (per-block persistence)', () => {
  it('roundtrips a value under a stable message id + block index', () => {
    saveBlockState('msg-stable', 0, { picked: 'option-a' });
    expect(loadBlockState<{ picked: string }>('msg-stable', 0)).toEqual({
      picked: 'option-a',
    });
  });

  it('keys distinctly by message id and by block index', () => {
    saveBlockState('a', 0, 1);
    saveBlockState('a', 1, 2);
    saveBlockState('b', 0, 3);
    expect(loadBlockState('a', 0)).toBe(1);
    expect(loadBlockState('a', 1)).toBe(2);
    expect(loadBlockState('b', 0)).toBe(3);
    // Cross-key reads return null, not the wrong value.
    expect(loadBlockState('b', 1)).toBeNull();
  });

  it('REFUSES to persist under a streaming / synthetic message id', () => {
    // Anonymous ids are reused across messages — persisting against them
    // would cause one streaming bubble's state to leak into the next.
    // Contract: persist nothing, and load returns null even if a key
    // exists in storage under the same shape (defensive).
    saveBlockState('streaming-abc', 0, 'value');
    saveBlockState('user-xyz', 0, 'value');
    expect(loadBlockState('streaming-abc', 0)).toBeNull();
    expect(loadBlockState('user-xyz', 0)).toBeNull();
    // No keys should have been written.
    expect(window.localStorage.length).toBe(0);
  });

  it('REFUSES to persist under an undefined message id', () => {
    saveBlockState(undefined, 0, 'value');
    expect(loadBlockState(undefined, 0)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('survives malformed stored payloads by returning null', () => {
    // Defensive: a future schema change shouldn't blow up the chat surface.
    // We write a raw non-JSON string and confirm loadBlockState degrades.
    window.localStorage.setItem('noiseos:genui:msg-stable:0', 'not json {');
    expect(loadBlockState('msg-stable', 0)).toBeNull();
  });

  it('namespaces keys under noiseos:genui: so they do not collide with other modules', () => {
    saveBlockState('msg-stable', 0, 1);
    const keys = Object.keys(window.localStorage);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^noiseos:genui:/);
  });
});
