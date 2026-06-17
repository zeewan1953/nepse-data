import { getNepse, cached, safeNepseCall } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fallback data when NEPSE API is unreachable
const FALLBACK_INDEX = {
  index: "NEPSE Index",
  open: 2000,
  high: 2050,
  low: 1980,
  close: 2025,
  points: 25.5,
  percentage: 1.27,
  turnover: 5000000000,
  tradedShares: 50000000,
  totalTransactions: 50000,
};

const FALLBACK_SUB_INDICES = [
  { index: "Banking Sub Index", open: 1200, high: 1220, low: 1190, close: 1210, points: 10, percentage: 0.83, turnover: 1000000000, tradedShares: 10000000, totalTransactions: 10000 },
  { index: "Development Bank Index", open: 3500, high: 3550, low: 3480, close: 3520, points: 20, percentage: 0.57, turnover: 500000000, tradedShares: 5000000, totalTransactions: 5000 },
  { index: "Finance Index", open: 2800, high: 2850, low: 2780, close: 2830, points: 30, percentage: 1.07, turnover: 300000000, tradedShares: 3000000, totalTransactions: 3000 },
  { index: "Hotels And Tourism Index", open: 8500, high: 8600, low: 8450, close: 8550, points: 50, percentage: 0.59, turnover: 200000000, tradedShares: 2000000, totalTransactions: 2000 },
  { index: "Hydro Power Index", open: 2200, high: 2250, low: 2180, close: 2230, points: 30, percentage: 1.36, turnover: 800000000, tradedShares: 8000000, totalTransactions: 8000 },
  { index: "Life Insurance Index", open: 9500, high: 9600, low: 9450, close: 9550, points: 50, percentage: 0.53, turnover: 400000000, tradedShares: 4000000, totalTransactions: 4000 },
  { index: "Manufacturing And Processing", open: 4500, high: 4550, low: 4480, close: 4520, points: 20, percentage: 0.44, turnover: 300000000, tradedShares: 3000000, totalTransactions: 3000 },
  { index: "Microfinance Index", open: 5500, high: 5600, low: 5450, close: 5550, points: 50, percentage: 0.91, turnover: 600000000, tradedShares: 6000000, totalTransactions: 6000 },
  { index: "Mutual Fund Index", open: 15, high: 15.5, low: 14.8, close: 15.2, points: 0.2, percentage: 1.33, turnover: 100000000, tradedShares: 1000000, totalTransactions: 1000 },
  { index: "Non-Life Insurance Index", open: 11000, high: 11100, low: 10950, close: 11050, points: 50, percentage: 0.45, turnover: 300000000, tradedShares: 3000000, totalTransactions: 3000 },
  { index: "Others Index", open: 1800, high: 1850, low: 1780, close: 1830, points: 30, percentage: 1.67, turnover: 200000000, tradedShares: 2000000, totalTransactions: 2000 },
  { index: "Trading Index", open: 900, high: 920, low: 890, close: 910, points: 10, percentage: 1.11, turnover: 100000000, tradedShares: 1000000, totalTransactions: 1000 },
];

export async function GET() {
  try {
    const nepse = getNepse();
    const [index, subIndices] = await cached("indices", 8_000, async () =>
      Promise.all([
        safeNepseCall(() => nepse.getNepseIndex(), "NEPSE Index"),
        safeNepseCall(() => nepse.getNepseSubIndices(), "Sub Indices"),
      ]),
    );
    
    // Check if we got valid data or empty results
    const validIndex = index && typeof index === "object" && "close" in index;
    const validSubs = Array.isArray(subIndices) && subIndices.length > 0;
    
    if (validIndex && validSubs) {
      return Response.json({ index, subIndices });
    }
    
    // Return fallback data
    return Response.json({ 
      index: FALLBACK_INDEX, 
      subIndices: FALLBACK_SUB_INDICES,
      source: "fallback"
    });
  } catch (e) {
    // Return fallback data on error
    return Response.json({ 
      index: FALLBACK_INDEX, 
      subIndices: FALLBACK_SUB_INDICES,
      source: "fallback",
      error: (e as Error)?.message
    });
  }
}
