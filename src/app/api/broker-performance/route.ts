import { NextRequest, NextResponse } from "next/server";
import { aggregateBrokerDataForRange } from "@/lib/broker-data-aggregator";
import { TRADING_DAYS } from "@/lib/trading-periods";

const VALID_RANGES = new Set(Object.keys(TRADING_DAYS));

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const range = req.nextUrl.searchParams.get("range") || "1D";

    if (!VALID_RANGES.has(range)) {
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
          buyVolume: b.buyVolume,
          sellVolume: b.sellVolume,
          netVolume: b.netVolume,
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
              buyVolume: topBrokerBuy.buyVolume,
              sellVolume: topBrokerBuy.sellVolume,
              netVolume: topBrokerBuy.netVolume,
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
              buyVolume: topBrokerSell.buyVolume,
              sellVolume: topBrokerSell.sellVolume,
              netVolume: topBrokerSell.netVolume,
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
