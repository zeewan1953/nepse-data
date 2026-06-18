import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/verify-otp",
  "/forgot-password",
  "/reset-password",
];

const PUBLIC_ROUTE_PREFIXES = [
  "/news",
  "/demo",
];

const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/news",
  "/api/demo/",
  "/api/fundamental-external/",
  "/api/live",
  "/api/stocks",
  "/api/market-status",
  "/api/indices",
  "/api/movers",
  "/api/signals",
  "/api/index-graph",
];

export function proxy(request: NextRequest) {
  const rawPath = request.nextUrl.pathname;
  // Normalize: remove trailing slash (except root "/")
  const pathname = rawPath === "/" ? "/" : rawPath.replace(/\/+$/, "");

  // Allow root
  if (pathname === "/") return NextResponse.next();

  // Public pages (exact match)
  if (PUBLIC_ROUTES.includes(pathname)) return NextResponse.next();

  // Public page prefixes (startsWith match for /news, /demo and any sub-routes)
  if (PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))) {
    return NextResponse.next();
  }

  // Public API routes
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Check session cookie
  const sessionCookie = request.cookies.get("darisir_session");
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
