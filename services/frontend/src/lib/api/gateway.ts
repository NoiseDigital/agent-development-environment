// Single base for ALL browser→backend traffic.
//
// Browser: requests go to the same-origin BFF proxy at `/gw`
// (src/app/gw/[...path]/route.ts), which forwards to the gateway server-side.
// The gateway's URL is never shipped to the client, and the gateway is
// internal-ingress only in production — the Next.js server is the sole public
// seam, and there is no CORS (same origin).
//
// Server (SSR / route handlers): a relative `/gw` has no origin to resolve
// against, so hit the gateway directly via the server-only `GATEWAY_URL`.
export function gatewayBase(): string {
  if (typeof window === "undefined") {
    return process.env.GATEWAY_URL ?? "http://localhost:8080";
  }
  return "/gw";
}
