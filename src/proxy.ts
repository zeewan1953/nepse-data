import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// No authentication required - all routes are public
export function proxy(request: NextRequest) {
  return NextResponse.next();
}
