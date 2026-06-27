import { runRealScanner } from "@/lib/broker_flow_real_engine";
import { hasRealData } from "@/lib/broker_flow_real_data";
import { getBrokerFlowCache, saveBrokerFlowCache } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();
  try {
    const real = await hasRealData(date);
    if (!real) {
      return Response.json({
        dataAvailable: false,
        error: "No real broker flow data for this date. Run /api/cron/collect?attempt=1 to sync.",
        date,
      }, { status: 503 });
    }

    const result = await runRealScanner(date);
    if (!result) {
      return Response.json({
        dataAvailable: false,
        error: "Real data exists but scanner failed to compute.",
        date,
      }, { status: 502 });
    }

    const data = { date, ...result, source: "real", generatedAt: Date.now() };
    await saveBrokerFlowCache(date, `scanner:real`, data);
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Scanner failed" }, { status: 502 });
  }
}
