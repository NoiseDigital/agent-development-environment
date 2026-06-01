'use client';

// Dashboard refresh-version context — one counter that bumps when the user
// clicks the Refresh button. Tile `useEffect` deps include the version so a
// version change is enough to re-run their fetches. The data fetches
// themselves go through `lib/dashboards/cache.ts`, which the Refresh handler
// invalidates BEFORE bumping the version — so the next fetch re-pulls from
// BigQuery instead of returning a stale cached promise.
//
// Pattern: value-only provider. The state lives in DashboardDetail (which
// also owns the Refresh button), and is passed in here so the tree gets a
// stable identity to read from. That keeps the refresh logic next to the
// button + cache-invalidation in one component, and lets tiles read via
// hook without prop-drilling.

import { createContext, useContext, type ReactNode } from 'react';

export interface DashboardRefreshValue {
  /** Bumps each time the Refresh button fires; tiles include it in deps. */
  version: number;
}

const Ctx = createContext<DashboardRefreshValue | null>(null);

export function DashboardRefreshProvider({
  value,
  children,
}: {
  value: DashboardRefreshValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Tiles include `version` in their useEffect deps so they re-fetch after
 *  the Refresh button fires. Outside a provider, returns 0 (the same value
 *  forever) so the dep never changes — a tile rendered outside a dashboard
 *  fetches once and never again, which is the right default for chat/preview. */
export function useDashboardRefresh(): DashboardRefreshValue {
  return useContext(Ctx) ?? { version: 0 };
}
