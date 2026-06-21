/**
 * Broker Flow Analytics API route — real math, sample data.
 * Replace the import from broker_flow_engine with your real data when ready.
 */

import { NextRequest } from "next/server";
import { runScanner, runOverview, runLeaderboard, runStockFlow, runMomentum } from "@/lib/broker_flow_engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const section = params.get("section") || "scanner";
  const date = params.get("date") || todayStr();
  const symbol = params.get("symbol") || "";

  try {
    switch (section) {
      case "scanner": {
        const data = runScanner(date);
        return Response.json({ date, ...data, generatedAt: Date.now() });
      }

      case "overview": {
        const data = runOverview(date);
        return Response.json({ date, ...data, generatedAt: Date.now() });
      }

      case "leaderboard": {
        const data = runLeaderboard(date);
        return Response.json({ date, ...data, generatedAt: Date.now() });
      }

      case "stock": {
        if (!symbol) {
          return Response.json({ error: "Missing symbol parameter" }, { status: 400 });
        }
        const data = runStockFlow(symbol, date);
        return Response.json({ date, symbol, ...data, generatedAt: Date.now() });
      }

      case "momentum": {
        const data = runMomentum();
        return Response.json({ date, buckets: data, generatedAt: Date.now() });
      }

      default:
        return Response.json({ error: `Unknown section: ${section}` }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
