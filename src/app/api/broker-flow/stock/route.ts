import { runStockFlow } from "@/lib/broker_flow_engine";
import { runRealStockFlow } from "@/lib/broker_flow_real_engine";
import { hasRealData } from "@/lib/broker_flow_real_data";
import { registerSymbol, DATA_VERSION } from "@/lib/broker_flow_sample_fixtures";
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
    const source = real ? "real" : "sample";
    const cacheKey = `stock:${symbol}:${source}:${DATA_VERSION}`;
    const cached = await getBrokerFlowCache(date, cacheKey);
    if (cached) return Response.json(cached);

    let result;
    if (real) {
      const realResult = await runRealStockFlow(symbol, date);
      if ("error" in realResult) {
        // No real data for this specific symbol, fall back to sample
        result = runStockFlow(symbol, date);
        registerSymbol(symbol);
      } else {
        result = realResult;
      }
    } else {
      result = runStockFlow(symbol, date);
      registerSymbol(symbol);
    }

    const data = {
      date, symbol, ...result,
      source,
      rollingTrend: [],
      concentrationTrend: [],
      unusualFlags: [],
      generatedAt: Date.now(),
    };
    await saveBrokerFlowCache(date, cacheKey, data);
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Analysis failed" }, { status: 502 });
  }
}
