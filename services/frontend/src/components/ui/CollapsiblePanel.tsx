'use client';

import { type ReactNode } from 'react';
import { useResizable } from '../../hooks/useResizable';
import ResizeHandle from './ResizeHandle';

/** Width of the collapsed icon rail (px). Single source of truth for every panel. */
export const RAIL_WIDTH = 48;

/** Shared collapse/expand slide timing. */
const PANEL_TRANSITION = 'width 260ms cubic-bezier(0.4, 0, 0.2, 1)';

interface CollapsiblePanelProps {
  /** Collapsed state, owned by the parent (usually via useSidebarCollapsed). */
  collapsed: boolean;
  /** Resizable width bounds for the expanded panel (per-panel, stays a prop). */
  resize: { initial: number; min: number; max: number };
  /** Docked edge — 'right' for a left-docked panel, 'left' for a right-docked
   *  one. Drives the border side and the resize-handle/drag edge. */
  side?: 'left' | 'right';
  /** Surface + border-color utility classes, e.g. "bg-surface-sunken border-line". */
  className?: string;
  /** Collapsed-rail content — rendered in a fixed {@link RAIL_WIDTH} column. */
  rail: ReactNode;
  /** Expanded content — rendered at the resizable width. */
  children: ReactNode;
}

/**
 * A docked, resizable side panel that collapses to an icon rail with a smooth
 * width animation. One persistent `<aside>` animates its width; the transition
 * is suppressed during drag-resize so dragging tracks the pointer 1:1. Each
 * inner layer is a fixed width (rail = RAIL_WIDTH, expanded = the resizable
 * width) so content never reflows or drifts mid-slide — it's simply revealed or
 * hidden by the moving edge.
 */
export default function CollapsiblePanel({
  collapsed,
  resize,
  side = 'right',
  className = '',
  rail,
  children,
}: CollapsiblePanelProps) {
  const { width, isResizing, startResize } = useResizable({ ...resize, edge: side });
  const borderSide = side === 'right' ? 'border-r' : 'border-l';

  return (
    <aside
      className={`relative shrink-0 h-full flex flex-col overflow-hidden ${borderSide} ${className}`}
      style={{
        width: collapsed ? RAIL_WIDTH : width,
        transition: isResizing ? undefined : PANEL_TRANSITION,
      }}
    >
      {collapsed ? (
        <div className="h-full flex flex-col items-center py-3 gap-1" style={{ width: RAIL_WIDTH }}>
          {rail}
        </div>
      ) : (
        <div className="h-full flex flex-col" style={{ width }}>
          <ResizeHandle side={side} onPointerDown={startResize} />
          {children}
        </div>
      )}
    </aside>
  );
}
