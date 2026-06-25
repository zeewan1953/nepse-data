import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.DATA_PROXY_KEY || "data-proxy-key";

async function ensureTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS collected_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL,
    data_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    raw_json TEXT
  )`);
}

export async function POST(req: Request) {
  try {
    // Auth check
    const key = req.headers.get("x-api-key");
    if (key !== API_KEY) {
      return Response.json({ error: "Invalid API key" }, { status: 401 });
    }

    await ensureTables();
    const body = await req.json();
    const { source, nepalstock, nepsealpha, stock } = body;

    let savedCount = 0;

    // Save nepalstock data
    if (nepalstock) {
      await db.execute({
        sql: "INSERT INTO collected_data (timestamp, source, data_type, payload, raw_json) VALUES (?, ?, ?, ?, ?)",
        args: [body.timestamp || new Date().toISOString(), source || "data-proxy", "nepalstock", JSON.stringify(nepalstock).slice(0, 5000), JSON.stringify(nepalstock)],
      });
      savedCount++;

      // If it's a price array, update stock_daily_ohlcv
      if (Array.isArray(nepalstock)) {
        for (const item of nepalstock) {
          const symbol = item.symbol || item.companySymbol || item.SYMBOL;
          const ltp = parseFloat(item.ltp || item.lastTradedPrice || item.closingPrice || 0);
          const high = parseFloat(item.high || item.highPrice || 0);
          const low = parseFloat(item.low || item.lowPrice || 0);
          const open = parseFloat(item.open || item.openPrice || 0);
          const volume = parseInt(item.volume || item.totalTradedQuantity || item.quantity || 0);
          const turnover = parseFloat(item.turnover || item.totalTradedValue || 0);
          const date = (item.date || item.tradeDate || new Date().toISOString().slice(0, 10)).replace(/\//g, "-");
          if (symbol) {
            try {
              await db.execute({
                sql: `INSERT INTO stock_daily_ohlcv (symbol, date, open, high, low, close, volume, turnover)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(symbol, date) DO UPDATE SET
                        open = excluded.open, high = excluded.high, low = excluded.low,
                        close = excluded.close, volume = excluded.volume, turnover = excluded.turnover`,
                args: [symbol, date, open || 0, high || 0, low || 0, ltp || 0, volume || 0, turnover || 0],
              });
            } catch {}
          }
        }
      }
    }

    // Save nepsealpha data
    if (nepsealpha) {
      await db.execute({
        sql: "INSERT INTO collected_data (timestamp, source, data_type, payload, raw_json) VALUES (?, ?, ?, ?, ?)",
        args: [body.timestamp || new Date().toISOString(), source || "data-proxy", "nepsealpha", JSON.stringify(nepsealpha).slice(0, 5000), JSON.stringify(nepsealpha)],
      });
      savedCount++;
    }

    // Save single stock data
    if (stock) {
      await db.execute({
        sql: "INSERT INTO collected_data (timestamp, source, data_type, payload) VALUES (?, ?, ?, ?)",
        args: [body.timestamp || new Date().toISOString(), source || "data-proxy", `stock:${stock.symbol}`, JSON.stringify(stock)],
      });
      savedCount++;

      // Also update OHLCV if we have price
      if (stock.symbol && stock.ltp) {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
        try {
          await db.execute({
            sql: `INSERT INTO stock_daily_ohlcv (symbol, date, open, high, low, close, volume)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(symbol, date) DO UPDATE SET
                    close = excluded.close, volume = excluded.volume`,
            args: [stock.symbol, today, stock.ltp, stock.ltp, stock.ltp, stock.ltp, stock.volume || 0],
          });
        } catch {}
      }
    }

    return Response.json({ message: `Saved ${savedCount} data sets`, savedCount });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message || "Collect failed" }, { status: 500 });
  }
}
