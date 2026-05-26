// Tiny module-level signal the NeuralBackground subscribes to so any
// thinking-state in the app (chat streaming, agent insights generating, …)
// can speed the ambient orbs up briefly without prop-drilling a context
// through the layout tree.

import { useEffect, useState } from 'react';

let current = false;
const listeners = new Set<(thinking: boolean) => void>();

/** Set the global "agent is thinking" state. Idempotent — no-op when the
 *  value matches the current one. */
export function setNeuralThinking(thinking: boolean): void {
  if (current === thinking) return;
  current = thinking;
  for (const l of listeners) l(thinking);
}

/** Subscribe to the thinking state. Returns the current value and re-renders
 *  on each change. */
export function useNeuralThinking(): boolean {
  const [thinking, setThinking] = useState(current);
  useEffect(() => {
    listeners.add(setThinking);
    return () => { listeners.delete(setThinking); };
  }, []);
  return thinking;
}
