// Module F: Cross-Stock Broker Patterns
// Detect brokers appearing as unusually large net buyers across multiple stocks
import "server-only";
import { execute } from "@/lib/db";

export type CrossStockPattern = {
  brokerId: string;
  stocks: Array<{ symbol: string; netAmt: number; netQty: number }>;
  totalNetAmt: number;
  stockCount: number;
};

// Find brokers with large net buying across multiple stocks within a date window
export async function findCrossStockPatterns(date: string, windowDays = 5, minStocks = 3, minNetAmt = 100000): Promise<CrossStockPattern[]> {
  // Get dates in window
  const dr = await execute(
    "SELECT DISTINCT tradeDate FROM broker_daily_agg WHERE tradeDate <= ? ORDER BY tradeDate DESC LIMIT ?",
    [date, windowDays],
  );
  const dates = dr.rows.map((row) => String(row.tradeDate));
  if (!dates.length) return [];

  // Get all broker-stock agg in this window where broker is net buyer
  const placeholders = dates.map(() => "?").join(",");
  const r = await execute(
    `SELECT brokerId, stockSymbol, SUM(netAmt) as totalNetAmt, SUM(netQty) as totalNetQty
     FROM broker_daily_agg
     WHERE tradeDate IN (${placeholders})
     GROUP BY brokerId, stockSymbol
     HAVING totalNetAmt > ?`,
    [...dates, minNetAmt],
  );

  // Group by broker
  const brokerMap = new Map<string, Array<{ symbol: string; netAmt: number; netQty: number }>>();
  for (const row of r.rows) {
    const brokerId = String(row.brokerId);
    const symbol = String(row.stockSymbol);
    const netAmt = Number(row.totalNetAmt);
    const netQty = Number(row.totalNetQty);
    if (!brokerMap.has(brokerId)) brokerMap.set(brokerId, []);
    brokerMap.get(brokerId)!.push({ symbol, netAmt, netQty });
  }

  // Filter brokers active across minStocks+ stocks
  const patterns: CrossStockPattern[] = [];
  for (const [brokerId, stocks] of brokerMap) {
    if (stocks.length >= minStocks) {
      const totalNetAmt = stocks.reduce((s, st) => s + st.netAmt, 0);
      patterns.push({
        brokerId,
        stocks: stocks.sort((a, b) => b.netAmt - a.netAmt),
        totalNetAmt,
        stockCount: stocks.length,
      });
    }
  }

  return patterns.sort((a, b) => b.totalNetAmt - a.totalNetAmt).slice(0, 20);
}
