// BFF proxy — the single seam between the browser and the backend.
//
// Everything the browser sends to `/gw/*` is forwarded to the gateway
// server-side via GATEWAY_URL (never shipped to the client). Responses stream
// straight back, so SSE (`/run_sse`) and large uploads pass through unbuffered.
//
// In production the gateway is internal-ingress only and requires IAM. When
// GATEWAY_AUDIENCE is set we mint a Google ID token for it from the metadata
// server (the App Hosting service account is the invoker) and carry the user's
// Firebase token aside in `x-firebase-id-token`. In dev neither is set and we
// forward straight to the docker-network gateway.

import { type NextRequest } from "next/server";

import { adminAuth, SESSION_COOKIE_NAME } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic"; // never cache — always proxy live
export const runtime = "nodejs"; // needs streaming fetch + the metadata server

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8080";
const GATEWAY_AUDIENCE = process.env.GATEWAY_AUDIENCE ?? ""; // prod: = gateway URL

// Identity headers the proxy injects from the verified session. ALWAYS stripped
// from the inbound request first so a client can never spoof them.
const IDENTITY_HEADERS = ["x-user-id", "x-user-email", "x-user-role"];

// Hop-by-hop / encoding headers that must not be forwarded verbatim.
const STRIP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "accept-encoding",
]);

// Cloud Run / GCE metadata server: an OIDC ID token for `audience` (the
// gateway), used as the Cloud Run IAM invoker credential. null off-GCP (dev).
async function googleIdToken(audience: string): Promise<string | null> {
  try {
    const res = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
      { headers: { "Metadata-Flavor": "Google" } },
    );
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path = [] } = await ctx.params;
  const target = `${GATEWAY_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP.has(key.toLowerCase())) headers.set(key, value);
  });

  // Anti-spoof: drop any inbound identity headers, then set them ONLY from the
  // verified session cookie. The gateway trusts these because this proxy (over
  // the IAM-gated channel in prod) is its sole caller.
  IDENTITY_HEADERS.forEach((h) => headers.delete(h));
  const session = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (session) {
    try {
      const decoded = await adminAuth.verifySessionCookie(session, true);
      headers.set("x-user-id", decoded.uid);
      if (decoded.email) headers.set("x-user-email", decoded.email);
      headers.set("x-user-role", (decoded.role as string) || "member");
    } catch {
      // Invalid/expired session — forward without identity; the gateway gates
      // protected routes (require_role) and returns 401 there.
    }
  }

  // Prod only: authenticate to the internal gateway as the App Hosting SA. The
  // user's Firebase Bearer (once auth is live) moves to a custom header so the
  // IAM token can own Authorization.
  if (GATEWAY_AUDIENCE) {
    const idToken = await googleIdToken(GATEWAY_AUDIENCE);
    if (idToken) {
      const userAuth = headers.get("authorization");
      if (userAuth) {
        headers.set("x-firebase-id-token", userAuth.replace(/^Bearer\s+/i, ""));
      }
      headers.set("authorization", `Bearer ${idToken}`);
    }
  }

  const hasBody = !(req.method === "GET" || req.method === "HEAD");
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // duplex is required when streaming a request body (uploads, SSE POST).
    // @ts-expect-error - not yet in the lib DOM types
    duplex: "half",
    redirect: "manual",
  });

  // Stream the upstream body straight back. Drop encoding/length so the runtime
  // re-derives them for the (already-decoded) stream.
  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
