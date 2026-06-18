import { cached } from "@/lib/nepse";
import { getBrokerNetFlow, getRollingNetFlow, getTopBrokers, flagUnusualFlow } from "@/lib/analysis/brokerNetFlow";
import { calcChaikinMoneyFlow, calcMoneyFlowIndex, calcBrokerConcentration, getConcentrationTrend } from "@/lib/analysis/moneyFlow";
import { calcNetOrderFlowImbalance } from "@/lib/analysis/tickRule";
import { calcVolumeZScore } from "@/lib/analysis/anomaly";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Per-stock daily broker activity & money flow report
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol");
  if (!symbol) return Response.json({ error: "Missing symbol param" }, { status: 400 });
  const date = sp.get("date") || todayStr();

  try {
    const data = await cached(`bf-stock:${symbol}:${date}`, 3_000, async () => {
      const [flows, rolling, topBrokers, cmf, mfi, conc, concTrend, tickImbalance, volZ] = await Promise.all([
        getBrokerNetFlow(date, symbol),
        getRollingNetFlow(symbol, 5),
        getTopBrokers(date, symbol, 5),
        calcChaikinMoneyFlow(symbol),
        calcMoneyFlowIndex(symbol),
        calcBrokerConcentration(date, symbol),
        getConcentrationTrend(symbol, 5),
        calcNetOrderFlowImbalance(symbol, date),
        calcVolumeZScore(symbol, date),
      ]);

      // Check top brokers for unusual flow
      const unusualFlags = await Promise.all(
        [...topBrokers.buyers.slice(0, 3), ...topBrokers.sellers.slice(0, 3)].map((b) =>
          flagUnusualFlow(symbol, b.brokerId, date),
        ),
      );

      return {
        date,
        symbol,
        brokerFlows: flows,
        rollingTrend: rolling,
        topBuyers: topBrokers.buyers,
        topSellers: topBrokers.sellers,
        cmf,
        mfi,
        concentration: conc,
        concentrationTrend: concTrend,
        tickImbalance,
        volumeZScore: volZ,
        unusualFlags: unusualFlags.filter((f) => f.zScore > 2),
      };
    });

    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Analysis failed" }, { status: 502 });
  }
}
