'use client';

// (i) badge + portal-rendered popover. Hover-to-open, click-to-pin.

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  ariaLabel: string;
  children: ReactNode;
  widthClass?: string;
}

const VIEWPORT_MARGIN = 8;

export default function InfoTooltip({
  ariaLabel,
  children,
  widthClass = 'w-80',
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  // Measure once per open; close() clears coords so the next open re-measures.
  useLayoutEffect(() => {
    if (!open || coords) return;
    if (!btnRef.current || !popRef.current) return;
    const btn = btnRef.current.getBoundingClientRect();
    const pop = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const below = btn.bottom + 6;
    const flipsAbove = below + pop.height > vh - VIEWPORT_MARGIN;
    const top = flipsAbove ? Math.max(VIEWPORT_MARGIN, btn.top - pop.height - 6) : below;

    let left = btn.left + btn.width / 2 - pop.width / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - pop.width - VIEWPORT_MARGIN));

    setCoords({ top, left });
  }, [open, coords]);

  // Outside click → close. Portal means both badge and pop need explicit checks.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  // 200ms grace lets the cursor cross from badge into popover without closing.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(close, 200);
  };

  return (
    <span className="no-drag relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); cancelClose(); setOpen((v) => !v); }}
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={scheduleClose}
        onFocus={() => { cancelClose(); setOpen(true); }}
        onBlur={scheduleClose}
        aria-label={ariaLabel}
        className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-700 text-[9px] font-bold text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
      >
        i
      </button>
      {open && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: 'fixed',
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              // First paint off-screen so we can measure, then jump in.
              visibility: coords ? 'visible' : 'hidden',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
            className={`z-[1000] ${widthClass} rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-left shadow-[0_12px_40px_rgba(0,0,0,0.7)]`}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}
