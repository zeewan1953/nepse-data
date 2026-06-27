import { runRealStockFlow } from "@/lib/broker_flow_real_engine";
import { hasRealData } from "@/lib/broker_flow_real_data";
import { getBrokerFlowCache, saveBrokerFlowCache } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol");
  if (!symbol) return Response.json({ error: "Missing symbol param" }, { status: 400 });
  const date = sp.get("date") || todayStr();

  try {
    const real = await hasRealData(date);
    if (!real) {
      return Response.json({
        dataAvailable: false,
        error: "No real broker flow data for this date. Run /api/cron/collect?attempt=1 to sync.",
        date,
        symbol,
      }, { status: 503 });
    }

    const realResult = await runRealStockFlow(symbol, date);
    if ("error" in realResult) {
      return Response.json({
        dataAvailable: false,
        error: `No real broker flow data for ${symbol} on ${date}. ${realResult.error}`,
        date,
        symbol,
      }, { status: 404 });
    }

    const data = {
      date, symbol, ...realResult,
      source: "real",
      rollingTrend: [],
      concentrationTrend: [],
      unusualFlags: [],
      generatedAt: Date.now(),
    };
    await saveBrokerFlowCache(date, `stock:${symbol}:real`, data);
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Analysis failed" }, { status: 502 });
  }
}
