// Toast store — a tiny global notification queue. Any module can fire a toast
// (showToast) without prop-drilling; a single <Toaster/> mounted in the root
// layout subscribes and renders the stack. Used to confirm closed-loop actions
// (a budget update applied) and to offer an immediate Undo.

import { useSyncExternalStore } from 'react';
import { newId } from './id';

export type ToastTone = 'default' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

let toasts: Toast[] = [];
// Stable empty reference for the server snapshot — useSyncExternalStore treats a
// fresh array each call as a change and loops, so the snapshot must be cached.
const EMPTY_TOASTS: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function dismissToast(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function showToast(opts: {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** Auto-dismiss delay in ms; 0 keeps it until dismissed. Toasts with an
   *  action linger longer so the Undo stays reachable. */
  duration?: number;
}): string {
  const id = newId('toast');
  toasts = [...toasts, { id, message: opts.message, tone: opts.tone ?? 'default', action: opts.action }];
  notify();
  const duration = opts.duration ?? (opts.action ? 8000 : 4500);
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), duration),
    );
  }
  return id;
}

/** Subscribe a component (the Toaster) to the live toast stack. */
export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toasts,
    () => EMPTY_TOASTS,
  );
}
