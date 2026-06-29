import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const { searchParams } = new URL(_req.url);
    const indicator = searchParams.get("indicator") || "";
    const days = Math.min(parseInt(searchParams.get("days") || "60", 10), 365);

    if (!indicator) {
      return NextResponse.json({ error: "indicator query param required" }, { status: 400 });
    }

    const rows = await execute(
      `SELECT trade_date, raw_value, signal
       FROM indicator_daily_signal
       WHERE symbol = ? AND indicator_name = ?
       ORDER BY trade_date DESC
       LIMIT ?`,
      [symbol.toUpperCase(), indicator, days]
    );

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      indicator,
      history: (rows.rows as any[]).reverse().map(r => ({
        date: r.trade_date,
        rawValue: r.raw_value,
        signal: r.signal,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
