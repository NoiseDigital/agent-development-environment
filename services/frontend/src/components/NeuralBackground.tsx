'use client';

// Neural-expressive ambient field — pure CSS, pointer-events:none. Mounts on
// every page EXCEPT inside an opened dashboard (`/dashboards/<id>`), where
// charts need a clean canvas. While the agent is thinking (the shared
// `neural-pulse` signal) the field energizes — brighter, more saturated, with a
// central pulsing heartbeat — then eases back. All the motion + theming lives in
// globals.css (`.neural-field`); this component only mounts it and flips the
// `data-thinking` flag that drives the energy ramp.

import { usePathname } from 'next/navigation';
import { useNeuralThinking } from '../lib/agent/neural-pulse';

const DASHBOARD_DETAIL_RE = /^\/dashboards\/[^/]+/;

export default function NeuralBackground() {
  const pathname = usePathname();
  const thinking = useNeuralThinking();

  // Hide on the dashboard DETAIL view only — the listing page keeps the field.
  if (pathname && DASHBOARD_DETAIL_RE.test(pathname)) return null;

  return (
    <div
      aria-hidden
      data-thinking={thinking ? 'true' : undefined}
      className="neural-field pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="neural-orb neural-orb-a" />
      <div className="neural-orb neural-orb-b" />
      <div className="neural-orb neural-orb-c" />
      <div className="neural-orb neural-orb-d" />
      <div className="neural-core" />
    </div>
  );
}
