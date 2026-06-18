import { cached } from "@/lib/nepse";
import { execute } from "@/lib/db";
import { detectAnomalies } from "@/lib/analysis/anomaly";
import { findCrossStockPatterns } from "@/lib/analysis/crossStock";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Market-wide summary: total broker activity stats, top anomaly flags, cross-stock patterns
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();

  try {
    const data = await cached(`bf-ov:${date}`, 3_000, async () => {
      // Get totals from broker_daily_agg
      const totals = await execute(
        `SELECT COUNT(DISTINCT brokerId) as brokers, COUNT(DISTINCT stockSymbol) as stocks,
                SUM(buyAmt) as totalBuyAmt, SUM(sellAmt) as totalSellAmt
         FROM broker_daily_agg WHERE tradeDate = ?`,
        [date],
      );
      const t = totals.rows[0];

      const [anomalies, patterns] = await Promise.all([
        detectAnomalies(date),
        findCrossStockPatterns(date, 5, 3, 100000),
      ]);

      return {
        date,
        totals: {
          brokers: Number(t?.brokers ?? 0),
          stocks: Number(t?.stocks ?? 0),
          totalBuyAmt: Number(t?.totalBuyAmt ?? 0),
          totalSellAmt: Number(t?.totalSellAmt ?? 0),
        },
        topAnomalies: anomalies.slice(0, 10),
        crossStockPatterns: patterns.slice(0, 10),
      };
    });

    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Overview failed" }, { status: 502 });
  }
}
