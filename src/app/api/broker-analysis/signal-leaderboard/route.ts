// Signal Leaderboard API
// Computes real technical signals from live market data and floorsheet aggregation
// NO forecasting, NO accuracy metrics, NO price predictions

import { nepse } from "@/lib/nepse";
import { getMeroLaganiData } from "@/lib/merolagani";
import {
  computeCMF,
  computeMFI,
  computeVolumeZScore,
  computeBrokerNetFlow,
  classifyTickRuleOrderFlow,
  computeMomentumScore,
  computeSmartMoneyScore,
  detectDivergence,
} from "@/lib/broker_flow_analytics";
import type { LiveMarketData } from "@/lib/types";

export const runtime = "nodejs";

type SignalRow = {
  symbol: string;
  momentumScore: number | null;
  smartMoneyScore: number | null;
  volumeZScore: number | null;
  cmf: number | null;
  mfi: number | null;
  orderFlow: "Buy Pressure" | "Sell Pressure" | "Neutral" | null;
  divergenceFlag: "Bullish Div" | "Bearish Div" | "None" | null;
  netBrokerFlow: number | null;
  dataCompleteness: number;
  source: "merolagani" | "floorsheet";
  asOf: string;
};

export async function GET() {
  try {
    // Fetch live market data
    const liveData = await nepse.getLiveMarketData();
    
    if (!liveData || liveData.length === 0) {
      return Response.json({
        error: "No live market data available",
        asOf: new Date().toISOString(),
        marketStatus: "unknown",
        disclaimer: "Rankings below reflect current technical and order-flow signals computed from real data. This is not a price forecast and not investment advice. Signal values do not predict future stock performance.",
        data: [],
      });
    }

    // Fetch floorsheet data for order flow analysis
    let floorsheetData: any[] = [];
    try {
      const floorsheet = await nepse.getFloorSheet({ page: 0, size: 1000 });
      floorsheetData = floorsheet?.data || [];
    } catch (err) {
      console.error("[Signal Leaderboard] Floorsheet fetch failed:", err);
    }

    // Compute signals for each stock
    const signals: SignalRow[] = liveData
      .filter((stock: LiveMarketData) => {
        // Filter out invalid symbols
        return /\D/.test(stock.symbol) && stock.symbol.length <= 10;
      })
      .map((stock: LiveMarketData) => {
        const symbol = stock.symbol;
        let nonNullCount = 0;
        let totalColumns = 8; // Total signal columns

        // 1. Momentum Score
        const momentumScore = computeMomentumScore([stock]);
        if (momentumScore !== null) nonNullCount++;

        // 2. Smart Money Score (requires floorsheet data)
        const stockFloorsheet = floorsheetData.filter((t: any) => 
          t.symbol === symbol || t.securityName === symbol
        );
        const smartMoneyScore = stockFloorsheet.length > 0 
          ? computeSmartMoneyScore(stockFloorsheet) 
          : null;
        if (smartMoneyScore !== null) nonNullCount++;

        // 3. Volume Z-Score
        const volumeZScore = computeVolumeZScore([stock]);
        if (volumeZScore !== null) nonNullCount++;

        // 4. CMF (requires historical data - using simplified version)
        const cmf = stockFloorsheet.length > 19 
          ? computeCMF(stockFloorsheet.slice(0, 20)) 
          : null;
        if (cmf !== null) nonNullCount++;

        // 5. MFI (requires historical data - using simplified version)
        const mfi = stockFloorsheet.length > 13 
          ? computeMFI(stockFloorsheet.slice(0, 14)) 
          : null;
        if (mfi !== null) nonNullCount++;

        // 6. Order Flow (tick-rule based)
        const orderFlow = classifyTickRuleOrderFlow(stockFloorsheet);
        if (orderFlow !== null) nonNullCount++;

        // 7. Divergence Flag (requires historical data)
        const divergenceFlag = stockFloorsheet.length > 19 
          ? detectDivergence(stockFloorsheet.slice(0, 20)) 
          : "None";
        if (divergenceFlag !== "None") nonNullCount++;

        // 8. Net Broker Flow (from MeroLagani)
        const netBrokerFlow = computeBrokerNetFlow(stockFloorsheet);
        if (netBrokerFlow !== null) nonNullCount++;

        // Calculate data completeness
        const dataCompleteness = Math.round((nonNullCount / totalColumns) * 100);

        return {
          symbol,
          momentumScore,
          smartMoneyScore,
          volumeZScore,
          cmf,
          mfi,
          orderFlow,
          divergenceFlag,
          netBrokerFlow,
          dataCompleteness,
          source: stockFloorsheet.length > 0 ? "floorsheet" : "merolagani",
          asOf: new Date().toISOString(),
        };
      })
      .filter((row) => row.dataCompleteness > 0) // Hide rows with all null signals
      .sort((a, b) => {
        // Default sort: Momentum Score descending
        const aMomentum = a.momentumScore ?? -Infinity;
        const bMomentum = b.momentumScore ?? -Infinity;
        if (bMomentum !== aMomentum) return bMomentum - aMomentum;
        // Ties: alphabetical by symbol
        return a.symbol.localeCompare(b.symbol);
      });

    return Response.json({
      asOf: new Date().toISOString(),
      marketStatus: "closed", // Could be enhanced with market hours check
      disclaimer: "Rankings below reflect current technical and order-flow signals computed from real data. This is not a price forecast and not investment advice. Signal values do not predict future stock performance.",
      data: signals,
    });
  } catch (error: any) {
    console.error("[Signal Leaderboard] Error:", error);
    return Response.json(
      {
        error: "Failed to compute signals",
        details: error.message,
        asOf: new Date().toISOString(),
        data: [],
      },
      { status: 500 },
    );
  }
}
