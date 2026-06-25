import { db } from "@/lib/db";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

    // Get data from stock_daily_ohlcv
    let ohlcvQuery = "SELECT symbol, date, open, high, low, close, volume, turnover FROM stock_daily_ohlcv";
    const args: any[] = [];
    if (symbol) {
      ohlcvQuery += " WHERE symbol = ?";
      args.push(symbol);
    }
    ohlcvQuery += " ORDER BY date DESC LIMIT ?";
    args.push(limit);
    const ohlcv = await db.execute({ sql: ohlcvQuery, args });

    // Get data from MeroLagani live
    const mero = await fetchMeroLaganiSummary();
    const livePrices = mero?.turnover?.detail?.filter((s) => !symbol || s.s === symbol).map((s) => ({
      symbol: s.s, name: s.n, ltp: s.lp, change: s.pc, open: s.op, high: s.h, low: s.l,
      volume: s.q, turnover: s.t,
    })) || [];

    // Get data from collected_data (proxy-sourced)
    let collectedQuery = "SELECT timestamp, source, data_type, payload FROM collected_data";
    if (symbol) {
      collectedQuery += " WHERE data_type LIKE ? || '%'";
    }
    collectedQuery += " ORDER BY timestamp DESC LIMIT ?";
    const collected = await db.execute({
      sql: collectedQuery,
      args: symbol ? [`%${symbol}%`, limit] : [limit],
    });

    // Cross-reference: compare OHLCV with MeroLagani
    const mismatches: any[] = [];
    if (symbol) {
      const ohlcvRow = ohlcv.rows[0];
      const liveRow = livePrices[0];
      if (ohlcvRow && liveRow) {
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
    }

    return Response.json({
      symbol: symbol || "(all)",
      ohlcvRows: ohlcv.rows.length,
      liveStocks: livePrices.length,
      collectedSources: collected.rows.length,
      mismatches,
      ohlcv: ohlcv.rows.slice(0, 5),
      live: livePrices.slice(0, 5),
      collected: collected.rows.slice(0, 5).map((r: any) => ({
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
