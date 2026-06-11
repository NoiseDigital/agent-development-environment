'use client';

import { useRef, useState } from 'react';

interface ResizableOptions {
  /** Starting width in pixels. */
  initial: number;
  min: number;
  max: number;
  /** Which edge the drag handle sits on — 'right' for a left-docked panel. */
  edge: 'left' | 'right';
}

interface ResizableResult {
  width: number;
  /** True while a drag-resize is in progress — use it to suppress width
   *  transitions so the panel tracks the pointer 1:1. */
  isResizing: boolean;
  /** Attach to a thin drag handle's onPointerDown. */
  startResize: (e: React.PointerEvent) => void;
}

/**
 * Pointer-drag width resizing for a docked panel. Pair with a collapse toggle:
 * the panel decides whether to apply `width` or its collapsed width.
 */
export function useResizable({ initial, min, max, edge }: ResizableOptions): ResizableResult {
  const [width, setWidth] = useState(initial);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(initial);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = widthRef.current;

    const onMove = (ev: PointerEvent) => {
      const delta = edge === 'right' ? ev.clientX - startX : startX - ev.clientX;
      const next = Math.min(max, Math.max(min, startWidth + delta));
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setIsResizing(false);
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return { width, isResizing, startResize };
}
