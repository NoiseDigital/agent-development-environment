'use client';

// Ambient orbs — pure CSS, pointer-events:none. Hidden on /dashboards/*
// where charts need an inert canvas.

import { usePathname } from 'next/navigation';

export default function NeuralBackground() {
  const pathname = usePathname();
  if (pathname?.startsWith('/dashboards')) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div
        className="absolute left-1/4 top-1/3 h-[42rem] w-[42rem] rounded-full bg-emerald-500/[0.07] blur-[120px]"
        style={{ animation: 'neuralOrbA 38s ease-in-out infinite' }}
      />
      <div
        className="absolute right-1/4 top-2/3 h-[36rem] w-[36rem] rounded-full bg-blue-500/[0.06] blur-[120px]"
        style={{ animation: 'neuralOrbB 46s ease-in-out infinite' }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/[0.04] blur-[120px]"
        style={{ animation: 'neuralOrbC 32s ease-in-out infinite' }}
      />
    </div>
  );
}
