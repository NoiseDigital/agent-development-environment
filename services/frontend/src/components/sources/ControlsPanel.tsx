'use client';

// The left controls rail for the analysis pages (AutoCorr, Market Radar),
// collapsible to an icon rail with the same animation/resize as the platform
// sidebar and the assistant panel. Left-docked, so side="right". One shared
// 'controls' collapse key keeps the two pages in sync (only one is mounted at a
// time). Pages pass the scrollable controls as children and the pinned action
// (Run) as `footer`.

import { type ReactNode } from 'react';

import CollapsiblePanel from '../ui/CollapsiblePanel';
import { useSidebarCollapsed } from '../../contexts/SidebarContext';

const ChevronLeft = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);
const ChevronRight = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

interface Props {
  /** Module glyph shown in the collapsed rail. */
  icon: ReactNode;
  /** Tooltip for the collapsed-rail glyph. */
  title: string;
  /** Pinned bottom action (the Run button). */
  footer: ReactNode;
  /** The scrollable control sections. */
  children: ReactNode;
}

export default function ControlsPanel({ icon, title, footer, children }: Props) {
  const [collapsed, setCollapsed] = useSidebarCollapsed('controls');
  return (
    <CollapsiblePanel
      collapsed={collapsed}
      resize={{ initial: 300, min: 260, max: 420 }}
      side="right"
      className="border-transparent bg-surface-sunken/30"
      rail={
        <>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="Expand controls"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <ChevronRight />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg text-accent-500" title={title}>
            {icon}
          </div>
        </>
      }
    >
      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        <div className="-mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse controls"
            className="rounded-md p-1 text-faint transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <ChevronLeft />
          </button>
        </div>
        {children}
      </div>
      <div className="shrink-0 border-t border-line/45 p-3">{footer}</div>
    </CollapsiblePanel>
  );
}
