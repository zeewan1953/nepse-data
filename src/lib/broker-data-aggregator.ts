import { execute } from "@/lib/db";

export interface BrokerAggregateData {
  brokerCode: string;
  brokerName: string;
  date: string;
  range: string;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
  turnover: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  transactionCount: number;
  daysInRange: number;
  averageDailyTurnover: number;
}

interface AggregationResult {
  range: string;
  fromDate: string;
  toDate: string;
  brokers: BrokerAggregateData[];
  timestamp: string;
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

/**
 * Get stored dates from merolagani_broker_daily, newest first.
 */
async function getStoredDates(): Promise<string[]> {
  const r = await execute(
    "SELECT DISTINCT tradeDate FROM merolagani_broker_daily ORDER BY tradeDate DESC"
  );
  return r.rows.map((row: any) => String(row.tradeDate));
}

/**
 * Aggregate broker data for a specific time range from merolagani_broker_daily DB.
 */
export async function aggregateBrokerDataForRange(
  range: "1D" | "3D" | "1W" | "1M" | "3M"
): Promise<AggregationResult> {
  const storedDates = await getStoredDates();
  if (!storedDates.length) {
    return { range, fromDate: "", toDate: "", brokers: [], timestamp: new Date().toISOString() };
  }

  // Use latest stored date as the "to" date
  const toDateStr = storedDates[0];

  // Compute number of trading days to go back
  const lookbackDays: Record<string, number> = { "1D": 1, "3D": 3, "1W": 5, "1M": 22, "3M": 66 };
  const nDays = lookbackDays[range] || 1;

  // Get the list of stored dates within range
  const cutoffIndex = Math.min(nDays, storedDates.length);
  const rangeDates = storedDates.slice(0, cutoffIndex);
  const fromDateStr = rangeDates[rangeDates.length - 1];

  // Query aggregated data for these dates
  const placeholders = rangeDates.map(() => "?").join(",");
  const rows = await execute(
    `SELECT brokerCode, brokerName,
            COUNT(DISTINCT tradeDate) AS daysInRange,
            SUM(purchaseAmt) AS totalBuy,
            SUM(sellAmt) AS totalSell,
            SUM(netAmt) AS totalNet,
            SUM(purchaseAmt + sellAmt) AS totalTurnover,
            SUM(buyQty) AS totalBuyVol,
            SUM(sellQty) AS totalSellVol
     FROM merolagani_broker_daily
     WHERE tradeDate IN (${placeholders})
     GROUP BY brokerCode
     ORDER BY totalTurnover DESC`,
    rangeDates,
  );

  const brokers: BrokerAggregateData[] = [];
  // Count transactions from floorsheet_trades for the same date range
  const txRows = await execute(
    `SELECT buyerMemberId AS broker, COUNT(*) AS txCount
     FROM floorsheet_trades
     WHERE tradeDate IN (${placeholders})
     GROUP BY buyerMemberId`,
    rangeDates,
  );
  const txMap = new Map<string, number>();
  for (const r of txRows.rows as any[]) {
    txMap.set(String(r.broker), (txMap.get(String(r.broker)) || 0) + Number(r.txCount));
  }

  for (const row of rows.rows as any[]) {
    const buyAmt = Number(row.totalBuy) || 0;
    const sellAmt = Number(row.totalSell) || 0;
    const turnover = Number(row.totalTurnover) || 0;
    if (turnover === 0) continue;
    const days = Number(row.daysInRange) || 1;
    brokers.push({
      brokerCode: String(row.brokerCode),
      brokerName: String(row.brokerName || `Broker ${row.brokerCode}`),
      date: toDateStr,
      range,
      buyAmount: buyAmt,
      sellAmount: sellAmt,
      netAmount: Number(row.totalNet) || 0,
      turnover,
      buyVolume: Number(row.totalBuyVol) || 0,
      sellVolume: Number(row.totalSellVol) || 0,
      netVolume: (Number(row.totalBuyVol) || 0) - (Number(row.totalSellVol) || 0),
      transactionCount: txMap.get(String(row.brokerCode)) || 0,
      daysInRange: days,
      averageDailyTurnover: turnover / days,
    });
  }

  return {
    range,
    fromDate: fromDateStr,
    toDate: toDateStr,
    brokers,
    timestamp: new Date().toISOString(),
  };
}
