import { NextRequest, NextResponse } from "next/server";
import { getPerformanceSummary } from "@/lib/signal-backtest";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const signalName = req.nextUrl.searchParams.get("signal") || undefined;
  const horizon = req.nextUrl.searchParams.get("horizon");

  try {
    const rows = await getPerformanceSummary(signalName, horizon ? parseInt(horizon) : undefined);
    return NextResponse.json({ performance: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
