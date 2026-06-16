import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/verify-otp",
  "/forgot-password",
  "/reset-password",
];

// API routes that don't require authentication (auth endpoints)
const PUBLIC_API_PREFIXES = [
  "/api/auth/",
];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow public routes (login, signup, etc)
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow public API routes (auth endpoints)
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get("darisir_session");

  if (!sessionCookie) {
    // No session — redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Has valid session cookie — allow access
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static files (paths with a dot).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
