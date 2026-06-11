// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useSessionNames } from './useSessionNames';
import { sessionNamesApi } from '../lib/agent/session-names-api';
import { adkApi, type Session, type Event } from '../lib/agent/adk-api';
import type { ChatMessage } from '../lib/agent/events';

vi.mock('../lib/agent/session-names-api', () => ({
  sessionNamesApi: {
    list: vi.fn(),
    set: vi.fn(),
    hide: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../lib/agent/adk-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/agent/adk-api')>();
  return {
    ...actual,
    adkApi: {
      getSession: vi.fn(),
      runOneShot: vi.fn(),
    },
  };
});

const mockedList = vi.mocked(sessionNamesApi.list);
const mockedSet = vi.mocked(sessionNamesApi.set);
const mockedGetSession = vi.mocked(adkApi.getSession);
const mockedRunOneShot = vi.mocked(adkApi.runOneShot);

function session(id: string, events: Event[] = []): Session {
  return { id, appName: 'mp', userId: 'u', state: {}, events, lastUpdateTime: 0 };
}

function textEvent(author: 'user' | 'model', text: string): Event {
  return {
    id: `${author}-${text.slice(0, 8)}`,
    author,
    content: { parts: [{ text }], role: author === 'user' ? 'user' : 'model' },
    timestamp: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ names: {}, hidden: [] });
  // sessionNamesApi.set is called fire-and-forget with .catch() — needs a
  // promise return or the chained .catch throws on undefined.
  mockedSet.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const baseProps = {
  selectedApp: 'mp' as string | null,
  userId: 'u',
  messages: [] as ChatMessage[],
  currentSession: null as Session | null,
  sessions: [] as Session[],
};

describe('useSessionNames — load on app change', () => {
  it('loads names + hidden ids on selectedApp change and clears them when app is null', async () => {
    mockedList.mockResolvedValue({ names: { 's1': 'Saved Name' }, hidden: ['s2'] });
    const { result, rerender } = renderHook(
      (p: typeof baseProps) => useSessionNames(p),
      { initialProps: baseProps },
    );

    await waitFor(() => expect(result.current.sessionNames.s1).toBe('Saved Name'));
    expect(result.current.hiddenSessions.has('s2')).toBe(true);

    rerender({ ...baseProps, selectedApp: null });
    await waitFor(() => expect(result.current.sessionNames).toEqual({}));
    expect(result.current.hiddenSessions.size).toBe(0);
  });

  it('clears names if the metadata load rejects (logged, not thrown)', async () => {
    mockedList.mockRejectedValueOnce(new Error('500'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useSessionNames(baseProps));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(result.current.sessionNames).toEqual({});
    warn.mockRestore();
  });
});

describe('useSessionNames — saveSessionName', () => {
  it('writes optimistically and fires off the persistence call', async () => {
    const { result } = renderHook(() => useSessionNames(baseProps));
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    mockedSet.mockResolvedValueOnce(undefined);

    act(() => { result.current.saveSessionName('s1', 'Hello'); });
    expect(result.current.sessionNames.s1).toBe('Hello');
    expect(mockedSet).toHaveBeenCalledWith('mp', 's1', 'Hello', 'u');
  });

  it('keeps the optimistic write when persistence fails (warn only)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedSet.mockRejectedValueOnce(new Error('500'));
    const { result } = renderHook(() => useSessionNames(baseProps));
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    await act(async () => {
      result.current.saveSessionName('s1', 'Hello');
      await Promise.resolve();
    });
    expect(result.current.sessionNames.s1).toBe('Hello');
    warn.mockRestore();
  });
});

describe('useSessionNames — markAiRenamed', () => {
  it('flags the id then clears it after the typing-animation window', async () => {
    const { result } = renderHook(() => useSessionNames(baseProps));
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    vi.useFakeTimers();
    act(() => { result.current.markAiRenamed('s1', 'Short Title'); });
    expect(result.current.aiRenamedIds.has('s1')).toBe(true);

    // ms = max(800, name.length * 32 + 500) = max(800, 11*32 + 500) = 852
    act(() => { vi.advanceTimersByTime(900); });
    expect(result.current.aiRenamedIds.has('s1')).toBe(false);
  });
});

describe('useSessionNames — renameSession', () => {
  it('returns null when there is no selectedApp', async () => {
    const { result } = renderHook(() =>
      useSessionNames({ ...baseProps, selectedApp: null }),
    );
    const out = await result.current.renameSession('s1');
    expect(out).toBeNull();
    expect(mockedRunOneShot).not.toHaveBeenCalled();
  });

  it('returns null when the target session is missing from the list', async () => {
    const { result } = renderHook(() => useSessionNames(baseProps));
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    const out = await result.current.renameSession('missing');
    expect(out).toBeNull();
  });

  it('runs the naming agent against the session events when present', async () => {
    const s = session('s1', [textEvent('user', 'Show me weekly spend by publisher')]);
    mockedRunOneShot.mockResolvedValueOnce('Weekly publisher spend');
    const { result } = renderHook(() =>
      useSessionNames({ ...baseProps, sessions: [s] }),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    let name: string | null = null;
    await act(async () => { name = await result.current.renameSession('s1'); });
    expect(name).toBe('Weekly publisher spend');
    expect(result.current.sessionNames.s1).toBe('Weekly publisher spend');
    expect(result.current.aiRenamedIds.has('s1')).toBe(true);
  });

  it('falls back to in-memory messages when the session has no usable events', async () => {
    const s = session('s1');
    mockedGetSession.mockResolvedValueOnce(session('s1'));
    mockedRunOneShot.mockResolvedValueOnce('From Messages');
    const messages: ChatMessage[] = [
      { id: 'm1', content: 'Hi there', author: 'user', timestamp: 0 },
      { id: 'm2', content: 'Hello back', author: 'MediaPerformanceAgent', timestamp: 0 },
    ];
    const { result } = renderHook(() =>
      useSessionNames({
        ...baseProps,
        sessions: [s],
        currentSession: s,
        messages,
      }),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    let name: string | null = null;
    await act(async () => { name = await result.current.renameSession('s1'); });
    expect(name).toBe('From Messages');
  });

  it('returns null and does NOT call onError when there is no usable history (decorative no-op)', async () => {
    const s = session('s1');
    mockedGetSession.mockResolvedValueOnce(session('s1'));
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useSessionNames({ ...baseProps, sessions: [s], onError }),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    let name: string | null = null;
    await act(async () => { name = await result.current.renameSession('s1'); });
    expect(name).toBeNull();
    expect(mockedRunOneShot).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('strips surrounding quotes/backticks from the agent reply', async () => {
    const s = session('s1', [textEvent('user', 'a')]);
    mockedRunOneShot.mockResolvedValueOnce('"Quoted Title"');
    const { result } = renderHook(() =>
      useSessionNames({ ...baseProps, sessions: [s] }),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    let name: string | null = null;
    await act(async () => { name = await result.current.renameSession('s1'); });
    expect(name).toBe('Quoted Title');
  });

  it('surfaces failures via onError when the naming agent throws', async () => {
    const s = session('s1', [textEvent('user', 'a')]);
    mockedRunOneShot.mockRejectedValueOnce(new Error('agent down'));
    const onError = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useSessionNames({ ...baseProps, sessions: [s], onError }),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    let name: string | null = null;
    await act(async () => { name = await result.current.renameSession('s1'); });
    expect(name).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Failed to rename session'));
    warn.mockRestore();
  });
});

describe('useSessionNames — autoRenameFromExchange', () => {
  it('retries once when the first reply is empty, persists on the retry', async () => {
    mockedRunOneShot
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('Solid Title');
    const { result } = renderHook(() => useSessionNames(baseProps));
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    await act(async () => {
      await result.current.autoRenameFromExchange('s1', 'q', 'a');
    });
    expect(mockedRunOneShot).toHaveBeenCalledTimes(2);
    expect(result.current.sessionNames.s1).toBe('Solid Title');
  });

  it('logs but does not throw when both attempts return empty', async () => {
    mockedRunOneShot.mockResolvedValue('');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useSessionNames(baseProps));
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    await act(async () => {
      await result.current.autoRenameFromExchange('s1', 'q', 'a');
    });
    expect(result.current.sessionNames.s1).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does NOT call onError on auto-rename failures (decorative flow)', async () => {
    mockedRunOneShot.mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useSessionNames({ ...baseProps, onError }));
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    await act(async () => {
      await result.current.autoRenameFromExchange('s1', 'q', 'a');
    });
    expect(onError).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
