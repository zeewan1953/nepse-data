import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().trim();
  const resolution = searchParams.get("resolution") || "D";
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  if (resolution !== "D" && resolution !== "1D") {
    return NextResponse.json({ s: "error", errmsg: "Intraday not available yet" });
  }

  const fromTs = fromStr ? parseInt(fromStr) * 1000 : 0;
  const toTs = toStr ? parseInt(toStr) * 1000 : Date.now() + 86400000;

  try {
    const result = await execute(
      `SELECT tradeDate, open, high, low, close, volume
       FROM stock_daily_ohlcv
       WHERE symbol = ?
         AND open > 0
       ORDER BY tradeDate ASC`,
      [symbol]
    );

    const rows = (result.rows as any[]).filter(r => {
      const ts = new Date(r.tradeDate).getTime();
      return ts >= fromTs && ts <= toTs;
    });

    if (rows.length === 0) {
      return NextResponse.json({ s: "no_data" });
    }

    return NextResponse.json({
      s: "ok",
      t: rows.map(r => Math.floor(new Date(r.tradeDate).getTime() / 1000)),
      o: rows.map(r => r.open),
      h: rows.map(r => r.high),
      l: rows.map(r => r.low),
      c: rows.map(r => r.close),
      v: rows.map(r => r.volume),
    });
  } catch (err) {
    return NextResponse.json({ s: "error", errmsg: String(err) });
  }
}
