import { NextRequest, NextResponse } from "next/server";
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
    const range = (req.nextUrl.searchParams.get("range") || "1D") as TimeRange;

    if (!RANGE_DAYS.hasOwnProperty(range)) {
      return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }

    const data = await aggregateBrokerDataForRange(range);
    if (data.brokers && data.brokers.length > 0) {
      const marketTurnover = data.brokers.reduce((sum, b: any) => sum + b.turnover, 0);
      const totalTransactions = data.brokers.reduce((sum, b: any) => sum + b.transactionCount, 0);
      const avgNetFlow = data.brokers.length > 0
        ? data.brokers.reduce((sum, b: any) => sum + b.netAmount, 0) / data.brokers.length
        : 0;
      const topBrokerBuy = [...data.brokers].sort((a: any, b: any) => b.buyAmount - a.buyAmount)[0];
      const topBrokerSell = [...data.brokers].sort((a: any, b: any) => b.sellAmount - a.sellAmount)[0];

      return NextResponse.json({
        range,
        fromDate: data.fromDate,
        toDate: data.toDate,
        brokers: data.brokers.map((b: any) => ({
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
        brokerCount: data.brokers.length,
        timestamp: new Date().toISOString(),
        source: "merolagani_db",
      });
    }

    return NextResponse.json({
      range,
      fromDate: data.fromDate,
      toDate: data.toDate,
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
  } catch (error) {
    console.error("Broker performance error:", error);
    return NextResponse.json({
      range: req.nextUrl.searchParams.get("range") || "1D",
      fromDate: "",
      toDate: "",
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
