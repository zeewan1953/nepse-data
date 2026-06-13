import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static files (paths with a dot).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
