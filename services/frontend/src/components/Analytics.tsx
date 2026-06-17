"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

// Both are NEXT_PUBLIC_ → inlined into the client bundle at build time (prod) or
// read from the dev server env (compose). Empty = analytics is a no-op, so local
// dev and any tenant without tagging configured ship zero measurement traffic.
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const SERVER_CONTAINER_URL = process.env.NEXT_PUBLIC_GA_SERVER_CONTAINER_URL;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

// gtag.js auto-sends a page_view for the initial document load, but App Router
// client navigations don't reload the page — so we emit page_view on each route
// change. The first render is skipped to avoid double-counting that initial view.
function RouteChangePageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    if (typeof window.gtag !== "function") return;
    const qs = searchParams?.toString();
    window.gtag("event", "page_view", {
      page_path: qs ? `${pathname}?${qs}` : pathname,
      page_location: window.location.href,
    });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Google Analytics via gtag.js, routed through our server-side GTM container.
 *
 * No-op unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set. When
 * NEXT_PUBLIC_GA_SERVER_CONTAINER_URL is also set, gtag posts measurement data
 * to our sGTM endpoint (first-party flow) instead of straight to Google — the
 * sGTM container's tags/triggers (authored in the GTM UI) then shape + route it.
 */
export default function Analytics() {
  if (!GA_ID) return null;

  // server_container_url only when configured; otherwise gtag talks to Google
  // directly. JSON.stringify keeps the inline-script values safely quoted.
  const config = SERVER_CONTAINER_URL
    ? `{ server_container_url: ${JSON.stringify(SERVER_CONTAINER_URL)} }`
    : "{}";

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
