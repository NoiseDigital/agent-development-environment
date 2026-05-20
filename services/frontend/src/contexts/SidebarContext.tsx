'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

// Sidebar collapse state lives here — provided once at the root layout — so it
// survives page navigations (e.g. starting a new chat) instead of resetting
// when the page subtree re-renders.

type Panel = 'platform' | 'chat' | 'sources';

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
