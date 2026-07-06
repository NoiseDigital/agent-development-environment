"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { classifyPath } from "../lib/analytics/page";
import { analytics } from "../config/tenant";

// The GA4 destination is baked PER-TENANT (tenants/<id>.json → analytics.
// measurementId, inlined via tenants.gen.ts). There is no env fallback, so one
// tenant can never emit into another's property; empty = analytics no-ops.
const GA_ID = analytics.measurementId;
// The sGTM relay endpoint is environment-specific (localhost in dev, each
// deploy's own sGTM URL), so it stays a NEXT_PUBLIC_ env var. It's a relay, not
// a property id — it can't change WHICH property the data lands in.
const SERVER_CONTAINER_URL = process.env.NEXT_PUBLIC_GA_SERVER_CONTAINER_URL;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

// We disable gtag's automatic page_view (send_page_view: false) and emit every
// view ourselves — the initial load AND each App Router client navigation (which
// doesn't reload the page). Emitting manually lets us attach classification:
//   content_group → low-cardinality page type (a built-in GA4 dimension)
//   page_path     → the route TEMPLATE (e.g. /chat/:agentId/:sessionId), so the
//                   thousands of per-session URLs collapse into one report row.
// page_location keeps the real URL for drill-down.
function RouteChangePageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    // The gtag shim is defined by the afterInteractive ga-init script, which may
    // not have run yet on first mount — wait briefly for it (subsequent
    // navigations find it immediately, so tries stays 0).
    const fire = () => {
      if (cancelled) return;
      if (typeof window.gtag !== "function") {
        if (tries++ < 50) setTimeout(fire, 100);
        return;
      }
      const { pageType, pageTemplate } = classifyPath(pathname);
      window.gtag("event", "page_view", {
        page_location: window.location.href,
        page_path: pageTemplate,
        content_group: pageType,
      });
    };
    fire();
    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams]);

  return null;
}

/**
 * Google Analytics via gtag.js, routed through our server-side GTM container.
 *
 * No-op unless the tenant declares an analytics.measurementId. When
 * NEXT_PUBLIC_GA_SERVER_CONTAINER_URL is also set, gtag posts measurement data
 * to our sGTM endpoint (first-party flow) instead of straight to Google — the
 * sGTM container's tags/triggers (authored in the GTM UI) then shape + route it.
 */
export default function Analytics() {
  if (!GA_ID) return null;

  // send_page_view: false — we emit every page_view from RouteChangePageViews
  // (classified), so gtag must NOT also auto-send the initial one. Add
  // server_container_url only when configured; otherwise gtag talks to Google
  // directly. JSON.stringify keeps the inline-script values safely quoted.
  const configParams: Record<string, unknown> = { send_page_view: false };
  if (SERVER_CONTAINER_URL) configParams.server_container_url = SERVER_CONTAINER_URL;
  const config = JSON.stringify(configParams);

  return (
    <>
      <Script
        id="ga-lib"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(GA_ID)}, ${config});`}
      </Script>
      <Suspense fallback={null}>
        <RouteChangePageViews />
      </Suspense>
    </>
  );
}
