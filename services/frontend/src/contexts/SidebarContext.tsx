'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

// Sidebar collapse state lives here — provided once at the root layout — so it
// survives page navigations (e.g. starting a new chat) instead of resetting
// when the page subtree re-renders.

// 'assistant' (right rail) and 'controls' (left controls rail) are shared by the
// embedded AutoCorr / Market Radar pages — only one page is mounted at a time, so
// a single key per side keeps the collapse state in sync across them.
type Panel = 'platform' | 'chat' | 'sources' | 'assistant' | 'controls';

interface SidebarState {
  collapsed: Record<Panel, boolean>;
  setCollapsed: (panel: Panel, value: boolean) => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState<Record<Panel, boolean>>({
    platform: false,
    chat: false,
    sources: false,
    assistant: false,
    controls: false,
  });
  const setCollapsed = (panel: Panel, value: boolean) =>
    setCollapsedState((prev) => ({ ...prev, [panel]: value }));

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

/** Collapse state for one sidebar — same shape as useState. */
export function useSidebarCollapsed(panel: Panel): [boolean, (value: boolean) => void] {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebarCollapsed must be used within a SidebarProvider');
  return [ctx.collapsed[panel], (value: boolean) => ctx.setCollapsed(panel, value)];
}
