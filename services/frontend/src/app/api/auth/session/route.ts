// Session endpoint (BFF-local, NOT proxied to the gateway).
//   POST   { idToken }  → verify, mint an httpOnly session cookie.
//   DELETE              → clear the cookie (sign out).
// The browser never stores the token in JS — only the httpOnly cookie, which
// rides same-origin /gw requests automatically.
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import {
  adminAuth,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { idToken } = await req.json().catch(() => ({}) as { idToken?: string });
  if (!idToken) {
    return NextResponse.json({ error: "missing idToken" }, { status: 400 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);

    // Local dev runs against the Auth emulator, which doesn't reliably set
    // email_verified (and there's no real inbox) — skip the verification gate
    // there so "Continue with Google" works. The gateway makes every local user
    // admin (GATEWAY_DEV_AUTH). Prod has no emulator host, so the gate applies.
    const isEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

    // The email must be verified. Otherwise an email/password sign-up could
    // claim any address in our domain — including an admin's — without owning
    // the inbox, and bind to that user's invite/role. Workspace SSO emails are
    // always verified; this only gates unverified email/password accounts.
    if (!isEmulator && decoded.email && decoded.email_verified !== true) {
      return NextResponse.json(
        { error: "Please verify your email address before signing in." },
        { status: 403 },
      );
    }

    // Authorization is NOT decided here — it lives in the gateway's access_rules
    // allowlist (emails + domains, admin-managed). We mint a session for any
    // authenticated, verified user; the gateway returns 403 from /me if they're
    // not provisioned, and the app shows an "access denied" state + signs out.
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
    const jar = await cookies();
    jar.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid idToken" }, { status: 401 });
  }
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
