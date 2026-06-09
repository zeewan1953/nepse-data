import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gate the whole app behind login: without a session cookie the only reachable
// routes are the auth pages and auth APIs — everything else redirects to /login.
const PUBLIC_PATHS = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("darisir_session");

  // Pages require login; data APIs (/api/*) stay open so the app never breaks on
  // a redirected fetch. Auth pages are public too.
  const isPublic =
    pathname.startsWith("/api") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already logged in but visiting an auth page → send to dashboard.
  if (hasSession && PUBLIC_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static files (paths with a dot).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
