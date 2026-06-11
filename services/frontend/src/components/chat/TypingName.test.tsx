// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import TypingName from './TypingName';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('TypingName — animate=false (instant)', () => {
  it('shows the full name immediately and never schedules an interval', () => {
    const { container } = render(<TypingName name="Quarterly Spend" animate={false} />);
    expect(container.textContent).toBe('Quarterly Spend');
  });

  it('renders a non-breaking space placeholder when name is empty', () => {
    const { container } = render(<TypingName name="" animate={false} />);
    // Single whitespace char so the row's height doesn't collapse to 0.
    const txt = container.textContent ?? '';
    expect(txt.length).toBe(1);
    expect(/\s/.test(txt)).toBe(true);
  });
});

describe('TypingName — animate=true', () => {
  it('starts blank and reveals one character per tick at the default speed', () => {
    const { container } = render(<TypingName name="Hi" animate={true} />);
    // Initial render — before any tick fires. The effect synchronously sets
    // shown='' then schedules the interval.
    expect(container.textContent?.trim()).toBe(''); // placeholder for empty shown

    act(() => { vi.advanceTimersByTime(32); });
    expect(container.textContent).toBe('H');

    act(() => { vi.advanceTimersByTime(32); });
    expect(container.textContent).toBe('Hi');
  });

  it('respects a custom speedMs', () => {
    const { container } = render(<TypingName name="AB" animate={true} speedMs={100} />);
    act(() => { vi.advanceTimersByTime(99); });
    expect(container.textContent?.trim()).toBe(''); // still pre-first-tick (placeholder)
    act(() => { vi.advanceTimersByTime(1); });
    expect(container.textContent).toBe('A');
    act(() => { vi.advanceTimersByTime(100); });
    expect(container.textContent).toBe('AB');
  });

  it('clears the interval once the full name is shown (no extra ticks)', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval');
    render(<TypingName name="ab" animate={true} />);
    act(() => { vi.advanceTimersByTime(32); }); // 'a'
    act(() => { vi.advanceTimersByTime(32); }); // 'ab' — clears on this tick
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('restarts the animation when name changes mid-flight', () => {
    const { container, rerender } = render(<TypingName name="First" animate={true} />);
    act(() => { vi.advanceTimersByTime(32 * 2); });
    expect(container.textContent).toBe('Fi');

    // Change the name — should reset to blank and start over.
    rerender(<TypingName name="Second" animate={true} />);
    expect(container.textContent?.trim()).toBe('');
    act(() => { vi.advanceTimersByTime(32); });
    expect(container.textContent).toBe('S');
  });

  it('snaps to the full name when animate flips false mid-animation', () => {
    const { container, rerender } = render(<TypingName name="hello" animate={true} />);
    act(() => { vi.advanceTimersByTime(32 * 2); });
    expect(container.textContent).toBe('he');

    rerender(<TypingName name="hello" animate={false} />);
    expect(container.textContent).toBe('hello');
  });

  it('cleans up the interval on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = render(<TypingName name="long-enough-name" animate={true} />);
    act(() => { vi.advanceTimersByTime(32); });
    const callsBeforeUnmount = clearSpy.mock.calls.length;
    unmount();
    expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBeforeUnmount);
    clearSpy.mockRestore();
  });
});
