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

    // Access gate (invite/permit model): only allowed email domains may start a
    // session. Empty list = allow any (dev). This rejects e.g. a random Google
    // account whose domain isn't ours, even though Firebase authenticated it.
    const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    const email = (decoded.email ?? "").toLowerCase();
    const domain = email.includes("@") ? email.split("@")[1] : "";
    if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
      return NextResponse.json(
        { error: "This account isn't permitted to access NoiseOS." },
        { status: 403 },
      );
    }

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
