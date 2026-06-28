import { execute, getAvailableDates } from "@/lib/db";
import { getTargetDateWithFallback } from "@/lib/date-utils";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import type { NextRequest } from "next/server";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");

    let date: string;
    let rangeMode = false;

    if (fromParam && toParam) {
      date = `${fromParam} – ${toParam}`;
      rangeMode = true;
    } else {
      const fallback = await getTargetDateWithFallback(dateParam || undefined);
      date = fallback.date;
    }

    // Get stock data from floorsheet_trades only — no broker merge
    const stockRows = await execute(
      `SELECT stockSymbol, securityName, SUM(contractQuantity) as qty, SUM(contractAmount) as amount, COUNT(*) as trades 
       FROM floorsheet_trades WHERE tradeDate ${rangeMode ? ">= ? AND tradeDate <= ?" : "= ?"} 
       GROUP BY stockSymbol ORDER BY SUM(contractAmount) DESC`,
      rangeMode ? [fromParam!, toParam!] : [date],
    );

    const dates = await getAvailableDates();
    if (!stockRows.rows.length) {
      // Fallback: MeroLagani live
      const mero = await fetchMeroLaganiSummary();
      if (mero?.turnover?.detail?.length) {
        const stocks = mero.turnover.detail.map((s: any) => ({
          symbol: s.s, name: s.n || "",
          buyAmt: null, sellAmt: null, buyQty: null, sellQty: null,
          netFlow: null, netQty: null, avgPrice: s.lp || 0, signal: null,
          topBuyer: null, topSeller: null, turnover: s.t || 0, qty: s.q || 0,
        })).sort((a: any, b: any) => (b.turnover) - (a.turnover));

        return Response.json({
          date, source: "verified", stocks, trend: [], dates,
          totals: { totalAccumulation: null, totalDistribution: null, accumulated: null, distributed: null, neutral: null },
        });
      }
      return Response.json({ date, stocks: [], trend: [], dates, error: "No data for this date" });
    }

    const stocks = stockRows.rows.map((r: any) => ({
      symbol: String(r.stockSymbol), name: String(r.securityName),
      buyAmt: null, sellAmt: null, buyQty: null, sellQty: null,
      netFlow: null, netQty: null, avgPrice: 0, signal: null,
      topBuyer: null, topSeller: null,
      turnover: Number(r.amount), qty: Number(r.qty),
    }));

    // Build trend
    const sortedDates = [...dates].sort().reverse();
    const trendDates: string[] = [];
    if (rangeMode) {
      trendDates.push(...sortedDates.filter((d: string) => d >= fromParam! && d <= toParam!).reverse());
    } else {
      const dateIndex = sortedDates.indexOf(date);
      trendDates.push(...sortedDates.slice(Math.max(0, dateIndex - 6), dateIndex + 1).reverse());
    }
    const trend = [];
    for (const d of trendDates) {
      const dayTrades = await execute("SELECT contractAmount FROM floorsheet_trades WHERE tradeDate = ?", [d]);
      if (dayTrades.rows.length) {
        let total = 0;
        for (const t of dayTrades.rows) total += Number(t.contractAmount);
        trend.push({ date: d, turnover: total, trades: dayTrades.rows.length });
      }
    }

    return Response.json({
      date, source: "verified", stocks, trend, dates,
      totals: { totalAccumulation: null, totalDistribution: null, accumulated: null, distributed: null, neutral: null },
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
