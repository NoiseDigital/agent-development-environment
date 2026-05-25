'use client';

// In-memory promise cache for dashboard BQ fetches.
//
// Why:
//   Switching dashboard tabs unmounts and remounts tiles. Without a cache,
//   each remount re-fetches every BQ tool — six KPI tiles, two breakdowns,
//   a trend, a pivot, the filter dropdowns, the totals provider — all over.
//   With this cache, the second mount finds the promise still resolved
//   from the first mount and resolves instantly.
//
// Semantics:
//   - One promise per (tool, params-json) key. In-flight requests are
//     deduped: two simultaneous callers share the same Promise.
//   - Resolved promises stick around indefinitely (until invalidated). This
//     is intentional — BQ data is the source of truth for queries the
//     dashboard makes, and we only "refresh" when the user asks.
//   - `invalidateAll()` clears the entire cache. The Refresh button on the
//     dashboard wires this up; tile useEffects pick up the cleared state
//     via the refresh-version context (one number that bumps).
//
// What this cache is NOT:
//   - Not a persistent cache. localStorage / IndexedDB are intentionally
//     avoided — BQ data can roll forward, and we don't want users seeing
//     stale numbers across sessions. The browser-tab lifetime is the right
//     scope: fast tab switches, fresh on reload.

const cache = new Map<string, Promise<unknown>>();

function key(tool: string, params: Record<string, unknown>): string {
  // JSON.stringify with sorted keys would be more robust but the call sites
  // build params via the same metricParams() helper so key order is stable.
  return `${tool}|${JSON.stringify(params)}`;
}

/** Cache-aware fetch wrapper. The same (tool, params) pair returns the same
 *  Promise across mounts until `invalidateAll()` is called. */
export function cached<T>(
  tool: string,
  params: Record<string, unknown>,
  fetcher: () => Promise<T>,
): Promise<T> {
  const k = key(tool, params);
  let p = cache.get(k) as Promise<T> | undefined;
  if (p) return p;
  // Best-effort: drop the entry if the fetcher rejects, so the next caller
  // retries instead of receiving the cached rejection forever.
  p = fetcher().catch((err) => {
    cache.delete(k);
    throw err;
  });
  cache.set(k, p);
  return p;
}

/** Drop every cached fetch. Called by the Refresh button. */
export function invalidateAll(): void {
  cache.clear();
}

/** How many cached entries are live — handy for tests and admin display. */
export function cacheSize(): number {
  return cache.size;
}
