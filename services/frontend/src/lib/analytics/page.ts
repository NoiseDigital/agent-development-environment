// Page classification for analytics. Maps an App Router pathname to a stable,
// low-cardinality (pageType, pageTemplate) pair so GA4 can group pages instead
// of drowning in one row per dynamic id (session / dashboard / campaign UUIDs),
// which otherwise blow past GA4's ~2k-values-per-dimension cap into "(other)".
//
//   pageType     → sent as GA4 `content_group` (a built-in dimension — no
//                  custom-dimension registration needed).
//   pageTemplate → the route with :params, so /chat/x/<uuid> collapses to one
//                  reportable row.

export type PageClass = { pageType: string; pageTemplate: string };

// Most-specific first; first match wins. Dynamic segments match [^/]+ and are
// rendered back as :name in the template. Keep in sync with src/app/* routes.
const RULES: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/^\/$/, 'home', '/'],
  [/^\/login$/, 'login', '/login'],
  [/^\/agents$/, 'agents', '/agents'],
  [/^\/chat\/[^/]+\/[^/]+$/, 'chat', '/chat/:agentId/:sessionId'],
  [/^\/chat\/[^/]+$/, 'chat', '/chat/:agentId'],
  [/^\/analyze$/, 'analyze', '/analyze'],
  [/^\/dashboards\/[^/]+$/, 'dashboard', '/dashboards/:dashboardId'],
  [/^\/dashboards$/, 'dashboards', '/dashboards'],
  [/^\/plan\/[^/]+\/[^/]+$/, 'plan', '/plan/:clientCode/:campaignId'],
  [/^\/plan\/[^/]+$/, 'plan', '/plan/:clientCode'],
  [/^\/plan$/, 'plan', '/plan'],
  [/^\/settings\/[^/]+$/, 'settings', '/settings/:section'],
];

export function classifyPath(pathname: string): PageClass {
  // Normalize a trailing slash (except root) so "/agents/" === "/agents".
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const [re, pageType, pageTemplate] of RULES) {
    if (re.test(path)) return { pageType, pageTemplate };
  }
  // Unknown route: keep the raw path (still bounded — new routes are rare) and
  // a generic group so it's visible as "other" rather than silently dropped.
  return { pageType: 'other', pageTemplate: path };
}
