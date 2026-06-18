import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/verify-otp",
  "/forgot-password",
  "/reset-password",
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
  const pathname = request.nextUrl.pathname;

  if (PUBLIC_ROUTES.includes(pathname)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();

  const sessionCookie = request.cookies.get("darisir_session");
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
