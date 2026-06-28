import { NextRequest, NextResponse } from "next/server";
import { getPerformanceHistory } from "@/lib/signal-backtest";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const signalName = req.nextUrl.searchParams.get("signal");
  const horizon = parseInt(req.nextUrl.searchParams.get("horizon") || "5");

  if (!signalName) {
    return NextResponse.json({ error: "signal param required" }, { status: 400 });
  }

  try {
    const rows = await getPerformanceHistory(signalName, horizon);
    return NextResponse.json({ history: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
