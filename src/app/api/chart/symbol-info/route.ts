import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().trim();

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const result = await execute(
      `SELECT COUNT(*) AS cnt FROM stock_daily_ohlcv WHERE symbol = ?`,
      [symbol]
    );
    const count = (result.rows[0] as any)?.cnt ?? 0;

    if (count === 0) {
      return NextResponse.json({ error: `Symbol not found: ${symbol}` }, { status: 404 });
    }

    return NextResponse.json({
      symbol,
      exchange: "NEPSE",
      timezone: "Asia/Kathmandu",
      session: "1045-1500",
      supported_resolutions: ["D"],
      has_intraday: false,
      has_daily: true,
      description: symbol,
      type: "stock",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
