// Route gate. No session cookie → bounce to /login. This is a COARSE check
// (presence only) — the Edge runtime can't run firebase-admin. Real verification
// happens in the BFF proxy (which forwards verified identity to the gateway).
import { type NextRequest, NextResponse } from "next/server";
import { disabledRoutes } from "./config/tenant";

// Keep in sync with SESSION_COOKIE_NAME in lib/firebase/admin (can't import it
// here — that module pulls in firebase-admin, which Edge can't run).
const SESSION_COOKIE = "__session";

// Paths that never require a session: the login page, the session endpoint, the
// /gw API proxy (auth handled downstream by the proxy + gateway), and assets.
const PUBLIC = ["/login", "/api/auth", "/gw", "/_next", "/favicon"];

// Top-level routes this tenant doesn't have (modules it hasn't enabled). Chat
// belongs to the Agents module, so gate it alongside /agents. Pure constants —
// safe on the Edge runtime (no firebase-admin).
const DISABLED = disabledRoutes.includes("/agents")
  ? [...disabledRoutes, "/chat"]
  : disabledRoutes;

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
  // Module not enabled for this tenant → send home instead of rendering a
  // half-wired page that calls agents/services it doesn't deploy.
  if (DISABLED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets. The extension match is
  // case-insensitive (letter classes, since JS regex has no inline `i` flag) so
  // brand marks like `/noise_N.PNG` aren't mistaken for routes and bounced to
  // /login — and covers the common image types, not just png/svg/ico.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:[pP][nN][gG]|[jJ][pP][eE]?[gG]|[gG][iI][fF]|[sS][vV][gG]|[iI][cC][oO]|[wW][eE][bB][pP])$).*)",
  ],
};
