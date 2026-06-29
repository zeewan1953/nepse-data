import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") || "").toUpperCase().trim();

  try {
    let sql: string;
    let params: string[];

    if (!query) {
      sql = `SELECT DISTINCT symbol FROM stock_daily_ohlcv ORDER BY symbol LIMIT 50`;
      params = [];
    } else {
      sql = `SELECT DISTINCT symbol FROM stock_daily_ohlcv WHERE symbol LIKE ? ORDER BY symbol LIMIT 20`;
      params = [`${query}%`];
    }

    const result = await execute(sql, params);
    const symbols = (result.rows as any[]).map(r => ({
      symbol: r.symbol,
      full_name: r.symbol,
      exchange: "NEPSE",
      type: "stock",
    }));

    return NextResponse.json(symbols);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
