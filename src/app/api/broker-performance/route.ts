import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aggregateBrokerDataForRange } from "@/lib/broker-data-aggregator";

type TimeRange = "1D" | "3D" | "1W" | "1M" | "3M";

const RANGE_DAYS: Record<TimeRange, number> = {
  "1D": 0,
  "3D": 2,
  "1W": 6,
  "1M": 21,
  "3M": 63,
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const range = (searchParams.get("range") || "1D") as TimeRange;

    if (!RANGE_DAYS.hasOwnProperty(range)) {
      return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }

    // Try to fetch real NEPSE data first
    try {
      const nepseData = await aggregateBrokerDataForRange(range);
      if (nepseData.brokers && nepseData.brokers.length > 0) {
        const marketTurnover = nepseData.brokers.reduce(
          (sum: number, b: any) => sum + b.turnover,
          0
        );
        const totalTransactions = nepseData.brokers.reduce(
          (sum: number, b: any) => sum + b.transactionCount,
          0
        );
        const avgNetFlow =
          nepseData.brokers.length > 0
            ? nepseData.brokers.reduce(
                (sum: number, b: any) => sum + b.netAmount,
                0
              ) / nepseData.brokers.length
            : 0;

        const topBrokerBuy = [...nepseData.brokers].sort(
          (a: any, b: any) => b.buyAmount - a.buyAmount
        )[0];
        const topBrokerSell = [...nepseData.brokers].sort(
          (a: any, b: any) => b.sellAmount - a.sellAmount
        )[0];

        return NextResponse.json({
          range,
          fromDate: nepseData.fromDate,
          toDate: nepseData.toDate,
          brokers: nepseData.brokers.map((b: any) => ({
            brokerCode: b.brokerCode,
            brokerName: b.brokerName,
            buyAmount: b.buyAmount,
            sellAmount: b.sellAmount,
            netAmount: b.netAmount,
            turnover: b.turnover,
            transactionCount: b.transactionCount,
            daysActive: b.daysInRange,
            avgDaily: b.averageDailyTurnover,
          })),
          marketTurnover,
          totalTransactions,
          avgNetFlow,
          topBrokerBuy: topBrokerBuy
            ? {
                brokerCode: topBrokerBuy.brokerCode,
                brokerName: topBrokerBuy.brokerName,
                buyAmount: topBrokerBuy.buyAmount,
                sellAmount: topBrokerBuy.sellAmount,
                netAmount: topBrokerBuy.netAmount,
                turnover: topBrokerBuy.turnover,
                transactionCount: topBrokerBuy.transactionCount,
                daysActive: topBrokerBuy.daysInRange,
                avgDaily: topBrokerBuy.averageDailyTurnover,
              }
            : null,
          topBrokerSell: topBrokerSell
            ? {
                brokerCode: topBrokerSell.brokerCode,
                brokerName: topBrokerSell.brokerName,
                buyAmount: topBrokerSell.buyAmount,
                sellAmount: topBrokerSell.sellAmount,
                netAmount: topBrokerSell.netAmount,
                turnover: topBrokerSell.turnover,
                transactionCount: topBrokerSell.transactionCount,
                daysActive: topBrokerSell.daysInRange,
                avgDaily: topBrokerSell.averageDailyTurnover,
              }
            : null,
          brokerCount: nepseData.brokers.length,
          timestamp: new Date().toISOString(),
          source: "nepse_live",
        });
      }
    } catch (nepseError) {
      console.error("NEPSE data fetch error, falling back to database:", nepseError);
      // Continue to database fallback
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lookbackDays = RANGE_DAYS[range];
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - lookbackDays);

    const fromDateStr = fromDate.toISOString().split("T")[0];
    const toDateStr = today.toISOString().split("T")[0];

    // Fetch aggregated broker data for the date range
    try {
      const rows = await db.execute({
        sql: `
          SELECT
            brokerId,
            SUM(buyAmt) as buyAmount,
            SUM(sellAmt) as sellAmount,
            SUM(buyAmt) - SUM(sellAmt) as netAmount,
            SUM(buyAmt) + SUM(sellAmt) as turnover,
            COUNT(DISTINCT stockSymbol) as stockCount,
            COUNT(*) as transactionCount,
            COUNT(DISTINCT tradeDate) as daysActive
          FROM broker_daily_agg
          WHERE tradeDate >= ? AND tradeDate <= ?
          GROUP BY brokerId
          ORDER BY (SUM(buyAmt) - SUM(sellAmt)) DESC
        `,
        args: [fromDateStr, toDateStr],
      });

      // Get broker names from merolagani_broker_daily
      const brokerNamesRows = await db.execute({
        sql: `
          SELECT DISTINCT brokerId, brokerName
          FROM merolagani_broker_daily
          ORDER BY brokerId
        `,
      });

      const brokerNames: Record<string, string> = {};
      for (const row of brokerNamesRows.rows) {
        brokerNames[String(row.brokerId)] = String(row.brokerName || row.brokerId);
      }

      // Process data
      const brokers = rows.rows.map((row: any) => {
        const brokerCode = String(row.brokerId);
        const buyAmount = Number(row.buyAmount) || 0;
        const sellAmount = Number(row.sellAmount) || 0;
        const netAmount = Number(row.netAmount) || 0;
        const daysActive = Number(row.daysActive) || 1;

        return {
          brokerCode,
          brokerName: brokerNames[brokerCode] || brokerCode,
          buyAmount,
          sellAmount,
          netAmount,
          turnover: Number(row.turnover) || 0,
          transactionCount: Number(row.transactionCount) || 0,
          daysActive,
          avgDaily: buyAmount + sellAmount > 0 ? (buyAmount + sellAmount) / daysActive : 0,
        };
      });

      // Calculate market totals
      const marketTurnover = brokers.reduce((sum: number, b: any) => sum + b.turnover, 0);
      const totalTransactions = brokers.reduce((sum: number, b: any) => sum + b.transactionCount, 0);
      const avgNetFlow = brokers.length > 0
        ? brokers.reduce((sum: number, b: any) => sum + b.netAmount, 0) / brokers.length
        : 0;

      // Find top performers
      const topBrokerBuy = [...brokers].sort((a: any, b: any) => b.buyAmount - a.buyAmount)[0];
      const topBrokerSell = [...brokers].sort((a: any, b: any) => b.sellAmount - a.sellAmount)[0];

      return NextResponse.json({
        range,
        fromDate: fromDateStr,
        toDate: toDateStr,
        brokers,
        marketTurnover,
        totalTransactions,
        avgNetFlow,
        topBrokerBuy,
        topBrokerSell,
        brokerCount: brokers.length,
        timestamp: new Date().toISOString(),
      });
    } catch (dbError) {
      console.error("Database error:", dbError);

      // Fallback: Try to get data from merolagani_broker_daily if broker_daily_agg doesn't exist
      try {
        const brokerRows = await db.execute({
          sql: `
            SELECT
              brokerId,
              brokerName,
              SUM(purchase) as buyAmount,
              SUM(sell) as sellAmount,
              SUM(purchase) - SUM(sell) as netAmount,
              SUM(purchase) + SUM(sell) as turnover,
              COUNT(*) as transactionCount,
              COUNT(DISTINCT date) as daysActive
            FROM merolagani_broker_daily
            WHERE date >= ? AND date <= ?
            GROUP BY brokerId, brokerName
            ORDER BY (SUM(purchase) - SUM(sell)) DESC
          `,
          args: [fromDateStr, toDateStr],
        });

        const brokers = brokerRows.rows.map((row: any) => ({
          brokerCode: String(row.brokerId),
          brokerName: String(row.brokerName || row.brokerId),
          buyAmount: Number(row.buyAmount) || 0,
          sellAmount: Number(row.sellAmount) || 0,
          netAmount: Number(row.netAmount) || 0,
          turnover: Number(row.turnover) || 0,
          transactionCount: Number(row.transactionCount) || 0,
          daysActive: Number(row.daysActive) || 1,
          avgDaily: 0,
        }));

        // Calculate stats
        brokers.forEach((b: any) => {
          b.avgDaily = (b.buyAmount + b.sellAmount) / Math.max(b.daysActive, 1);
        });

        const marketTurnover = brokers.reduce((sum: number, b: any) => sum + b.turnover, 0);
        const totalTransactions = brokers.reduce((sum: number, b: any) => sum + b.transactionCount, 0);
        const avgNetFlow =
          brokers.length > 0 ? brokers.reduce((sum: number, b: any) => sum + b.netAmount, 0) / brokers.length : 0;

        const topBrokerBuy = [...brokers].sort((a: any, b: any) => b.buyAmount - a.buyAmount)[0];
        const topBrokerSell = [...brokers].sort((a: any, b: any) => b.sellAmount - a.sellAmount)[0];

        return NextResponse.json({
          range,
          fromDate: fromDateStr,
          toDate: toDateStr,
          brokers,
          marketTurnover,
          totalTransactions,
          avgNetFlow,
          topBrokerBuy,
          topBrokerSell,
          brokerCount: brokers.length,
          timestamp: new Date().toISOString(),
        });
      } catch (fallbackError) {
        console.error("Fallback error:", fallbackError);

        // §6: never fabricate broker data. If all DB queries fail, return an
        // explicit empty state so the UI shows "no data available".
        return NextResponse.json({
          range,
          fromDate: fromDateStr,
          toDate: toDateStr,
          brokers: [],
          marketTurnover: 0,
          totalTransactions: 0,
          avgNetFlow: 0,
          topBrokerBuy: null,
          topBrokerSell: null,
          brokerCount: 0,
          timestamp: new Date().toISOString(),
          empty: true,
          error: "Broker performance data unavailable",
        });
      }
    }
  } catch (error) {
    console.error("Broker performance error:", error);

    // Re-derive range here — the one in the try block is out of scope in catch.
    const range = (req.nextUrl.searchParams.get("range") || "1D") as TimeRange;

    // §6: never fabricate broker data. On error, return an explicit empty state
    // so the UI shows "no data available" rather than mock numbers.
    return NextResponse.json({
      range,
      brokers: [],
      marketTurnover: 0,
      totalTransactions: 0,
      avgNetFlow: 0,
      topBrokerBuy: null,
      topBrokerSell: null,
      brokerCount: 0,
      timestamp: new Date().toISOString(),
      empty: true,
      error: "Broker performance data unavailable",
    });
  }
}
