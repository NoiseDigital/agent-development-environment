'use client';

// Ambient orbs — pure CSS, pointer-events:none. Mounts on every page EXCEPT
// inside an opened dashboard (`/dashboards/<id>`), where charts need a clean
// dark canvas. The orbs accelerate while the chat agent is thinking via the
// shared `neural-pulse` signal — so the surface visibly "thinks" with you.

import { usePathname } from 'next/navigation';
import { useNeuralThinking } from '../lib/neural-pulse';

const DASHBOARD_DETAIL_RE = /^\/dashboards\/[^/]+/;

export default function NeuralBackground() {
  const pathname = usePathname();
  const thinking = useNeuralThinking();

  // Hide on the dashboard DETAIL view only — the listing page keeps the orbs.
  if (pathname && DASHBOARD_DETAIL_RE.test(pathname)) return null;

  // Faster cycle while a model is working; slow drift otherwise.
  const dur = (slow: number, fast: number) => (thinking ? fast : slow);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-700"
      style={{ opacity: thinking ? 0.9 : 0.75 }}
    >
      <div
        className="absolute left-1/4 top-1/3 h-[42rem] w-[42rem] rounded-full bg-emerald-500/[0.08] blur-[120px]"
        style={{ animation: `neuralOrbA ${dur(38, 9)}s ease-in-out infinite` }}
      />
      <div
        className="absolute right-1/4 top-2/3 h-[36rem] w-[36rem] rounded-full bg-blue-500/[0.07] blur-[120px]"
        style={{ animation: `neuralOrbB ${dur(46, 11)}s ease-in-out infinite` }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/[0.05] blur-[120px]"
        style={{ animation: `neuralOrbC ${dur(32, 8)}s ease-in-out infinite` }}
      />
    </div>
  );
}
