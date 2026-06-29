import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { getNPTNow, getMarketSession } from "@/lib/market-hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().trim();

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const now = getNPTNow();
    const session = getMarketSession(now);

    if (session === "closed") {
      return NextResponse.json(null);
    }

    const todayStr = now.toISOString().slice(0, 10).replace(/-/g, "/");
    const result = await execute(
      `SELECT tradeDate, open, high, low, close, volume
       FROM stock_daily_ohlcv
       WHERE symbol = ?
         AND tradeDate LIKE ? || '%'
       ORDER BY tradeDate DESC
       LIMIT 1`,
      [symbol, todayStr]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return NextResponse.json(null);
    }

    const row = rows[0] as any;
    return NextResponse.json({
      time: Math.floor(new Date(row.tradeDate).getTime() / 1000),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
