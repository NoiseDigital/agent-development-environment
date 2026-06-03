// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useChatFeedback } from './useChatFeedback';
import { feedbackApi } from '../lib/agent/feedback-api';
import type { Session } from '../lib/agent/adk-api';

vi.mock('../lib/agent/feedback-api', () => ({
  feedbackApi: {
    listForSession: vi.fn(),
    setRating: vi.fn(),
    clearSession: vi.fn(),
  },
}));

const mockedList = vi.mocked(feedbackApi.listForSession);
const mockedSet = vi.mocked(feedbackApi.setRating);

const session = (id: string): Session => ({
  id, appName: 'mp', userId: 'u', state: {}, events: [], lastUpdateTime: 0,
});

beforeEach(() => {
  mockedList.mockReset();
  mockedSet.mockReset();
  mockedList.mockResolvedValue({});
});

afterEach(() => { cleanup(); });

describe('useChatFeedback', () => {
  it('loads feedback for the active session and clears it on session switch', async () => {
    mockedList.mockResolvedValueOnce({ 'evt-1': 'up', 'evt-2': 'down' });
    type Props = { s: Session | null };
    const initial: Props = { s: session('s1') };
    const { result, rerender } = renderHook(
      ({ s }: Props) =>
        useChatFeedback({ selectedApp: 'mp', currentSession: s, userId: 'u' }),
      { initialProps: initial },
    );

    await waitFor(() => expect(result.current.feedback['evt-1']).toBe('up'));
    expect(mockedList).toHaveBeenCalledWith('mp', 's1', 'u');

    mockedList.mockResolvedValueOnce({ 'evt-9': 'up' });
    rerender({ s: session('s2') });
    await waitFor(() => expect(result.current.feedback['evt-9']).toBe('up'));
    expect(result.current.feedback['evt-1']).toBeUndefined();
  });

  it('clears feedback when there is no app or no session', async () => {
    mockedList.mockResolvedValue({ 'evt-1': 'up' });
    type Props = { s: Session | null; app: string | null };
    const initial: Props = { s: session('s1'), app: 'mp' };
    const { result, rerender } = renderHook(
      ({ s, app }: Props) =>
        useChatFeedback({ selectedApp: app, currentSession: s, userId: 'u' }),
      { initialProps: initial },
    );
    await waitFor(() => expect(result.current.feedback['evt-1']).toBe('up'));

    rerender({ s: null, app: 'mp' });
    await waitFor(() => expect(result.current.feedback).toEqual({}));

    mockedList.mockResolvedValue({ 'evt-2': 'down' });
    rerender({ s: session('s1'), app: 'mp' });
    await waitFor(() => expect(result.current.feedback['evt-2']).toBe('down'));

    rerender({ s: session('s1'), app: null });
    await waitFor(() => expect(result.current.feedback).toEqual({}));
  });

  it('rateMessage applies optimistically and reverts on API failure', async () => {
    const { result } = renderHook(() =>
      useChatFeedback({ selectedApp: 'mp', currentSession: session('s1'), userId: 'u' }),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    // Optimistic write reverts when the API rejects.
    mockedSet.mockRejectedValueOnce(new Error('500'));
    await act(async () => { await result.current.rateMessage('evt-1', 'up'); });
    expect(result.current.feedback['evt-1']).toBeUndefined();
  });

  it('rateMessage keeps the optimistic value on success', async () => {
    const { result } = renderHook(() =>
      useChatFeedback({ selectedApp: 'mp', currentSession: session('s1'), userId: 'u' }),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    mockedSet.mockResolvedValueOnce(undefined);
    await act(async () => { await result.current.rateMessage('evt-1', 'up'); });
    expect(result.current.feedback['evt-1']).toBe('up');
  });

  it('rateMessage with null clears the rating and reverts to previous on failure', async () => {
    mockedList.mockResolvedValueOnce({ 'evt-1': 'up' });
    const { result } = renderHook(() =>
      useChatFeedback({ selectedApp: 'mp', currentSession: session('s1'), userId: 'u' }),
    );
    await waitFor(() => expect(result.current.feedback['evt-1']).toBe('up'));

    mockedSet.mockRejectedValueOnce(new Error('boom'));
    await act(async () => { await result.current.rateMessage('evt-1', null); });
    // Failed clear should restore the prior 'up' value.
    expect(result.current.feedback['evt-1']).toBe('up');
  });

  it('rateMessage is a no-op when no session is selected', async () => {
    const { result } = renderHook(() =>
      useChatFeedback({ selectedApp: 'mp', currentSession: null, userId: 'u' }),
    );
    await act(async () => { await result.current.rateMessage('evt-1', 'up'); });
    expect(mockedSet).not.toHaveBeenCalled();
  });
});
