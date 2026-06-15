// Route gate. No session cookie → bounce to /login. This is a COARSE check
// (presence only) — the Edge runtime can't run firebase-admin. Real verification
// happens in the BFF proxy (which forwards verified identity to the gateway).
import { type NextRequest, NextResponse } from "next/server";

// Keep in sync with SESSION_COOKIE_NAME in lib/firebase/admin (can't import it
// here — that module pulls in firebase-admin, which Edge can't run).
const SESSION_COOKIE = "__session";

// Paths that never require a session: the login page, the session endpoint, the
// /gw API proxy (auth handled downstream by the proxy + gateway), and assets.
const PUBLIC = ["/login", "/api/auth", "/gw", "/_next", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico)$).*)"],
};
