// Module C: Tick-Rule Order-Flow Approximation (Lee-Ready)
// Classifies trades as buy/sell-initiated based on price changes
// DISCLAIMER: This is an approximation without real bid/ask data
import "server-only";
import { execute } from "@/lib/db";

export type ClassifiedTrade = {
  tradeOrder: number;
  price: number;
  quantity: number;
  direction: "buy" | "sell" | "neutral";
};

// Fetch trades ordered by trade_order and classify using tick rule
export async function classifyTrades(symbol: string, date: string): Promise<ClassifiedTrade[]> {
  const r = await execute(
    "SELECT tradeOrder, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ? AND stockSymbol = ? ORDER BY tradeOrder ASC",
    [date, symbol],
  );

  if (!r.rows.length) return [];

  const trades = r.rows.map((row) => ({
    tradeOrder: Number(row.tradeOrder),
    quantity: Number(row.contractQuantity),
    amount: Number(row.contractAmount),
    price: Number(row.contractAmount) / Math.max(1, Number(row.contractQuantity)),
  }));

  const classified: ClassifiedTrade[] = [];
  let lastDirection: "buy" | "sell" = "buy";

  for (let i = 0; i < trades.length; i++) {
    if (i === 0) {
      classified.push({ ...trades[i], direction: "neutral" });
      continue;
    }
    const priceDiff = trades[i].price - trades[i - 1].price;
    let dir: "buy" | "sell";
    if (priceDiff > 0) dir = "buy";       // uptick = buy-initiated
    else if (priceDiff < 0) dir = "sell";  // downtick = sell-initiated
    else dir = lastDirection;               // zero-tick = last direction

    lastDirection = dir;
    classified.push({ ...trades[i], direction: dir });
  }

  return classified;
}

// Net order-flow imbalance: buy volume - sell volume
export async function calcNetOrderFlowImbalance(symbol: string, date: string): Promise<{
  buyVolume: number; sellVolume: number; netImbalance: number;
  buyTrades: number; sellTrades: number; neutralTrades: number;
  disclaimer: string;
}> {
  const trades = await classifyTrades(symbol, date);
  let buyVol = 0, sellVol = 0, buyCount = 0, sellCount = 0, neutralCount = 0;

  for (const t of trades) {
    if (t.direction === "buy") { buyVol += t.quantity; buyCount++; }
    else if (t.direction === "sell") { sellVol += t.quantity; sellCount++; }
    else { neutralCount++; }
  }

  return {
    buyVolume: buyVol,
    sellVolume: sellVol,
    netImbalance: buyVol - sellVol,
    buyTrades: buyCount,
    sellTrades: sellCount,
    neutralTrades: neutralCount,
    disclaimer: "Tick-rule approximation: without real bid/ask data, classification has known error rates.",
  };
}
