import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that MUST have authentication (everything else is public)
const PROTECTED_ROUTES = [
  "/portfolio",
  "/profile",
  "/chart",
];

const PROTECTED_PREFIXES = [
  "/stock/",
  "/fundamental",
  "/floorsheet",
  "/broker-flow",
  "/broker",
  "/market",
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
  const pathname = request.nextUrl.pathname;

  // Always allow auth pages and static assets
  if (pathname.startsWith("/login") || pathname.startsWith("/signup") ||
      pathname.startsWith("/verify-otp") || pathname.startsWith("/forgot-password") ||
      pathname.startsWith("/reset-password")) {
    return NextResponse.next();
  }

  // Allow public API routes
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Public pages: /news, /demo, and root are always accessible
  if (pathname === "/" || pathname === "/news" || pathname === "/demo" ||
      pathname.startsWith("/news/") || pathname.startsWith("/demo/")) {
    return NextResponse.next();
  }

  // For all other routes, check session
  const sessionCookie = request.cookies.get("darisir_session");
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
