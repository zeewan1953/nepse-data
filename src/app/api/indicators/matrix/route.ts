import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { INDICATOR_META } from "@/lib/indicators-meta";
import { getTargetDateWithFallback } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedDate = searchParams.get("date") || undefined;
    const symbolsParam = searchParams.get("symbols") || "";

    const { date } = await getTargetDateWithFallback(requestedDate);

    let symbols: string[];
    if (symbolsParam) {
      symbols = symbolsParam.split(",").map(s => s.trim()).filter(Boolean);
    } else {
      const result = await execute(
        `SELECT DISTINCT symbol FROM indicator_daily_signal WHERE trade_date = ? ORDER BY symbol LIMIT 20`,
        [date]
      );
      symbols = (result.rows as any[]).map(r => r.symbol as string);
      if (symbols.length === 0) {
        const fallback = await execute(
          `SELECT DISTINCT symbol FROM stock_daily_ohlcv ORDER BY symbol LIMIT 20`
        );
        symbols = (fallback.rows as any[]).map(r => r.symbol as string);
      }
    }

    if (symbols.length > 50) {
      return NextResponse.json({ error: "Max 50 symbols per request" }, { status: 400 });
    }

    const placeholders = symbols.map(() => "?").join(",");
    const rows = await execute(
      `SELECT symbol, indicator_name, raw_value, signal, calc_version
       FROM indicator_daily_signal
       WHERE trade_date = ? AND symbol IN (${placeholders})
       ORDER BY symbol, indicator_name`,
      [date, ...symbols]
    );

    const data = (rows.rows as any[]).map(r => ({
      symbol: r.symbol,
      indicatorName: r.indicator_name,
      rawValue: r.raw_value,
      signal: r.signal,
      calcVersion: r.calc_version,
    }));

    return NextResponse.json({
      date,
      indicators: INDICATOR_META,
      stocks: symbols,
      data,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
