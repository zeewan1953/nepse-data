// Demo account: returns live prices + floorsheet volume for order execution
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

    // Get floorsheet volume from floorsheet_trades (graceful — table may not exist)
    let floorsheetRows: any[] = [];
    try {
      const floorsheet = await execute(
        `SELECT stockSymbol as symbol, SUM(contractQuantity) as totalQty
         FROM floorsheet_trades
         WHERE tradeDate = (SELECT MAX(tradeDate) FROM floorsheet_trades)
         GROUP BY stockSymbol`
      );
      floorsheetRows = floorsheet.rows;
    } catch {
      // floorsheet_trades may be empty or not synced yet — that's OK
    }

    const priceMap = new Map<string, { ltp: number; updatedAt: number; totalQty: number }>();
    for (const row of live.rows) {
      priceMap.set(String(row.symbol), {
        ltp: Number(row.averageTradedPrice),
        updatedAt: Number(row.updatedAt),
        totalQty: 0,
      });
    }

    // Merge floorsheet volume data
    for (const row of floorsheetRows) {
      const sym = String(row.symbol);
      const existing = priceMap.get(sym);
      if (existing) {
        existing.totalQty = Number(row.totalQty) || 0;
      } else {
        priceMap.set(sym, {
          ltp: 0,
          updatedAt: Date.now(),
          totalQty: Number(row.totalQty) || 0,
        });
      }
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
      { status: 200 }
    );
  }
}
