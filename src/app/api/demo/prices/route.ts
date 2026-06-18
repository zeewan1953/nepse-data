// Demo account: returns live prices for mark-to-market and order execution
// This is a stateless endpoint — all demo state is managed client-side in localStorage
import { execute } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get live OHLC prices
    const live = await execute(
      "SELECT symbol, openPrice, highPrice, lowPrice, averageTradedPrice, updatedAt FROM live_ohlc"
    );

    // Get last close from stock_daily_ohlcv for circuit band validation
    const prevClose = await execute(
      `SELECT s.symbol, s.close as prevClose, s.tradeDate
       FROM stock_daily_ohlcv s
       INNER JOIN (
         SELECT symbol, MAX(tradeDate) as maxDate
         FROM stock_daily_ohlcv
         GROUP BY symbol
       ) latest ON s.symbol = latest.symbol AND s.tradeDate = latest.maxDate`
    );

    const priceMap = new Map<string, { ltp: number; updatedAt: number }>();
    for (const row of live.rows) {
      priceMap.set(String(row.symbol), {
        ltp: Number(row.averageTradedPrice),
        updatedAt: Number(row.updatedAt),
      });
    }

    const prevCloseMap = new Map<string, { prevClose: number; date: string }>();
    for (const row of prevClose.rows) {
      prevCloseMap.set(String(row.symbol), {
        prevClose: Number(row.prevClose),
        date: String(row.tradeDate),
      });
    }

    return Response.json({
      prices: Object.fromEntries(priceMap),
      prevClose: Object.fromEntries(prevCloseMap),
      timestamp: Date.now(),
    });
  } catch (e) {
    return Response.json(
      { prices: {}, prevClose: {}, timestamp: Date.now(), error: (e as Error)?.message },
      { status: 200 } // return 200 so demo still works with empty data
    );
  }
}
