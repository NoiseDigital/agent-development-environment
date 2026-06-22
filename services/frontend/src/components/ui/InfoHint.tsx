'use client';

// Small hoverable "ⓘ" marker that reveals a one-line explanation on hover.
// The tooltip renders through a portal with position:fixed, so it escapes any
// scrollable/overflow-hidden ancestor (control rails, cards) and always sits on
// the top layer — previously it was clipped by those containers.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function InfoHint({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.right + 8, y: r.top + r.height / 2 });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className="inline-flex shrink-0 align-middle"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        className="w-3 h-3 text-disabled hover:text-subtle cursor-help"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateY(-50%)', zIndex: 9999 }}
            className="pointer-events-none w-56 rounded-lg border border-line-strong bg-surface-raised px-2.5 py-1.5
              text-[11px] font-normal normal-case leading-relaxed tracking-normal text-muted shadow-lg shadow-black/30"
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
