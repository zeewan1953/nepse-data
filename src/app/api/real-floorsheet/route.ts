import { NextResponse } from "next/server";
import { getLatestFloorsheetFromDb, getAvailableDates, getFloorsheetCount } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dates = getAvailableDates();
    const latest = dates[0] || null;

    if (!latest) {
      return NextResponse.json({
        success: false,
        dataAvailable: false,
        error: "No floorsheet data in database. Run /api/floorsheet/sync to fetch from NEPSE.",
        suggestion: "Trigger sync: GET /api/floorsheet/sync?date=YYYY-MM-DD",
      }, { status: 503 });
    }

    const totalTrades = getFloorsheetCount(latest);
    const trades = getLatestFloorsheetFromDb();

    const totalBuyQty = trades.reduce((s, t) => s + (t.contractAmount > 0 ? t.contractQuantity : 0), 0);
    const totalSellQty = trades.reduce((s, t) => s + (t.contractAmount < 0 ? t.contractQuantity : 0), 0);

    const brokerSet = new Set<string>();
    const stockSet = new Set<string>();
    for (const t of trades) {
      brokerSet.add(t.buyerMemberId);
      brokerSet.add(t.sellerMemberId);
      stockSet.add(t.stockSymbol);
    }

    return NextResponse.json({
      success: true,
      dataAvailable: true,
      source: "database",
      date: latest,
      totalTrades,
      totalBrokers: brokerSet.size,
      totalStocks: stockSet.size,
      availableDates: dates,
      marketStats: {
        totalBuyQty,
        totalSellQty,
        netQty: totalBuyQty - totalSellQty,
      },
      trades: trades.slice(0, 500),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[real-floorsheet] Error:", err);
    return NextResponse.json({
      success: false,
      dataAvailable: false,
      error: "Failed to load floorsheet data",
      details: String(err),
    }, { status: 502 });
  }
}
