import { db } from "@/lib/db";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS collected_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL,
    data_type TEXT NOT NULL,
    payload TEXT,
    raw_json TEXT
  )`);
}

export async function GET(req: Request) {
  try {
    await ensureTables();
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

    // Get data from stock_daily_ohlcv
    let ohlcvQuery = "SELECT symbol, tradeDate as date, open, high, low, close, volume, value FROM stock_daily_ohlcv";
    const args: any[] = [];
    if (symbol) {
      ohlcvQuery += " WHERE symbol = ?";
      args.push(symbol);
    }
    ohlcvQuery += " ORDER BY tradeDate DESC LIMIT ?";
    args.push(limit);
    let ohlcvRows: any[] = [];
    try { const r = await db.execute({ sql: ohlcvQuery, args }); ohlcvRows = r.rows; } catch {}

    // Get data from MeroLagani live
    let livePrices: any[] = [];
    try {
      const mero = await fetchMeroLaganiSummary();
      if (mero?.turnover?.detail) {
        livePrices = mero.turnover.detail
          .filter((s: any) => !symbol || s.s === symbol)
          .slice(0, limit)
          .map((s: any) => ({
            symbol: s.s, name: s.n, ltp: s.lp, change: s.pc,
            open: s.op, high: s.h, low: s.l, volume: s.q,
          }));
      }
    } catch {}

    // Get collected data
    let collected: any[] = [];
    try {
      let cQuery = "SELECT timestamp, source, data_type, substr(payload, 1, 200) as payload FROM collected_data";
      const cArgs: any[] = [];
      if (symbol) {
        cQuery += " WHERE data_type LIKE ?";
        cArgs.push(`%${symbol}%`);
      }
      cQuery += " ORDER BY timestamp DESC LIMIT ?";
      cArgs.push(limit);
      const c = await db.execute({ sql: cQuery, args: cArgs });
      collected = c.rows;
    } catch {}

    // Cross-reference: compare OHLCV with MeroLagani
    const mismatches: any[] = [];
    if (symbol && ohlcvRows.length > 0 && livePrices.length > 0) {
      const ohlcvRow = ohlcvRows[0] as any;
      const liveRow = livePrices[0] as any;
      const dbClose = Number(ohlcvRow.close);
      const liveClose = liveRow.ltp;
      if (dbClose > 0 && liveClose > 0 && Math.abs(dbClose - liveClose) / liveClose > 0.01) {
        mismatches.push({
          symbol,
          field: "close",
          dbValue: dbClose,
          liveValue: liveClose,
          diffPct: ((dbClose - liveClose) / liveClose * 100).toFixed(2) + "%",
        });
      }
    }

    return Response.json({
      symbol: symbol || "(all)",
      ohlcvRows: ohlcvRows.length,
      liveStocks: livePrices.length,
      collectedSources: collected.length,
      mismatches,
      ohlcv: ohlcvRows.slice(0, 5),
      live: livePrices.slice(0, 5),
      collected: collected.map((r: any) => ({
        time: r.timestamp,
        source: r.source,
        type: r.data_type,
        payload: (r.payload || "").slice(0, 200),
      })),
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message || "Verify failed" }, { status: 500 });
  }
}
