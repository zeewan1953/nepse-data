import { NextResponse } from "next/server";
import { evaluateAllAlerts } from "@/lib/alert-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const fired = await evaluateAllAlerts();
    return NextResponse.json({
      success: true,
      fired: fired.length,
      results: fired,
      duration: Date.now() - start,
      ts: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: String(err),
      duration: Date.now() - start,
      ts: Date.now(),
    }, { status: 500 });
  }
}
