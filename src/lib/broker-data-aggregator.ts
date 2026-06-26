import { getNepse, safeNepseCall } from "@/lib/nepse";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

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

interface BrokerDailyData {
  date: string;
  buyAmount: number;
  sellAmount: number;
  buyVolume: number;
  sellVolume: number;
  transactionCount: number;
}

interface AggregationResult {
  range: string;
  fromDate: string;
  toDate: string;
  brokers: BrokerAggregateData[];
  timestamp: string;
}

/**
 * Get date range for aggregation based on range type
 */
export function getDateRange(
  range: "1D" | "3D" | "1W" | "1M" | "3M"
): { daysBack: number; label: string } {
  const ranges = {
    "1D": { daysBack: 0, label: "1 Day" },
    "3D": { daysBack: 2, label: "3 Days" },
    "1W": { daysBack: 6, label: "1 Week" },
    "1M": { daysBack: 21, label: "1 Month" },
    "3M": { daysBack: 63, label: "3 Months" },
  };
  return ranges[range];
}

/**
 * Fetch floorsheet data for a specific date range
 */
async function fetchFloorsheetData(
  fromDate: Date,
  toDate: Date
): Promise<FloorSheetItem[]> {
  const nepse = getNepse();
  const allTrades: FloorSheetItem[] = [];
  const pageSize = 500;
  const maxPages = 100;

  try {
    // Fetch first page to get total
    const firstPage = await safeNepseCall(
      () =>
        nepse.getFloorSheet({
          page: 0,
          size: pageSize,
        }) as Promise<FloorSheet>,
      "Floorsheet first page"
    );

    if (!firstPage.floorsheets?.content) {
      return [];
    }

    allTrades.push(...(firstPage.floorsheets.content || []));
    const totalPages = Math.min(firstPage.floorsheets.totalPages || 1, maxPages);

    // Fetch remaining pages in batches
    for (let page = 1; page < totalPages; page += 5) {
      const batch = [];
      for (let i = 0; i < 5 && page + i < totalPages; i++) {
        batch.push(
          safeNepseCall(
            () =>
              nepse.getFloorSheet({
                page: page + i,
                size: pageSize,
              }) as Promise<FloorSheet>,
            `Floorsheet page ${page + i}`
          ).catch(() => null)
        );
      }

      const results = await Promise.all(batch);
      for (const result of results) {
        if (result?.floorsheets?.content) {
          allTrades.push(...result.floorsheets.content);
        }
      }
    }

    // Filter by date range
    return allTrades.filter((trade: any) => {
      const tradeDate = new Date(trade.contractDateTime);
      return tradeDate >= fromDate && tradeDate <= toDate;
    });
  } catch (error) {
    console.error("Error fetching floorsheet data:", error);
    return [];
  }
}

/**
 * Aggregate floorsheet trades by broker and date
 */
function aggregateTrades(
  trades: FloorSheetItem[]
): Record<string, Record<string, BrokerDailyData>> {
  const brokerDailyData: Record<string, Record<string, BrokerDailyData>> = {};

  for (const trade of trades) {
    const tradeAny = trade as any;
    const buyerBroker = String(tradeAny.buyerBroker || tradeAny.buyerMemberId);
    const sellerBroker = String(tradeAny.sellerBroker || tradeAny.sellerMemberId);
    const tradeDate = new Date(tradeAny.contractDateTime || tradeAny.tradeDate)
      .toISOString()
      .split("T")[0];
    const amount = trade.contractAmount || 0;
    const quantity = trade.contractQuantity || 0;

    // Initialize broker if not exists
    if (!brokerDailyData[buyerBroker]) {
      brokerDailyData[buyerBroker] = {};
    }
    if (!brokerDailyData[sellerBroker]) {
      brokerDailyData[sellerBroker] = {};
    }

    // Initialize date if not exists
    if (!brokerDailyData[buyerBroker][tradeDate]) {
      brokerDailyData[buyerBroker][tradeDate] = {
        date: tradeDate,
        buyAmount: 0,
        sellAmount: 0,
        buyVolume: 0,
        sellVolume: 0,
        transactionCount: 0,
      };
    }
    if (!brokerDailyData[sellerBroker][tradeDate]) {
      brokerDailyData[sellerBroker][tradeDate] = {
        date: tradeDate,
        buyAmount: 0,
        sellAmount: 0,
        buyVolume: 0,
        sellVolume: 0,
        transactionCount: 0,
      };
    }

    // Aggregate buyer data
    const buyerData = brokerDailyData[buyerBroker][tradeDate];
    buyerData.buyAmount += amount;
    buyerData.buyVolume += quantity;
    buyerData.transactionCount += 1;

    // Aggregate seller data
    const sellerData = brokerDailyData[sellerBroker][tradeDate];
    sellerData.sellAmount += amount;
    sellerData.sellVolume += quantity;
    sellerData.transactionCount += 1;
  }

  return brokerDailyData;
}

/**
 * Get broker name from NEPSE API or fallback
 */
async function getBrokerName(brokerCode: string): Promise<string> {
  // Fallback broker names for common codes
  const fallbackNames: Record<string, string> = {
    "58": "Naasa Securities",
    "32": "Premier Securities",
    "44": "Dynamic Money Management",
    "65": "Sharepro Securities",
    "42": "Sani Securities",
    "28": "Shree Krishna Securities",
    "45": "Imperial Securities",
    "48": "Trishakti Securities",
    "77": "Nabil Securities",
    "33": "Dakshinkali Investments",
  };

  return fallbackNames[brokerCode] || `Broker ${brokerCode}`;
}

/**
 * Aggregate broker data for a specific time range
 */
export async function aggregateBrokerDataForRange(
  range: "1D" | "3D" | "1W" | "1M" | "3M"
): Promise<AggregationResult> {
  const rangeInfo = getDateRange(range);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const toDate = new Date(today);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - rangeInfo.daysBack);

  const toDateStr = toDate.toISOString().split("T")[0];
  const fromDateStr = fromDate.toISOString().split("T")[0];

  // Fetch floorsheet data
  const trades = await fetchFloorsheetData(fromDate, toDate);

  if (!trades.length) {
    return {
      range,
      fromDate: fromDateStr,
      toDate: toDateStr,
      brokers: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Aggregate by broker and date
  const brokerDailyData = aggregateTrades(trades);

  // Convert to aggregated format
  const brokers: BrokerAggregateData[] = [];

  for (const brokerCode in brokerDailyData) {
    const dailyData = brokerDailyData[brokerCode];
    const datesInRange = Object.keys(dailyData).length;

    let totalBuyAmount = 0;
    let totalSellAmount = 0;
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    let totalTransactions = 0;

    for (const date in dailyData) {
      const data = dailyData[date];
      totalBuyAmount += data.buyAmount;
      totalSellAmount += data.sellAmount;
      totalBuyVolume += data.buyVolume;
      totalSellVolume += data.sellVolume;
      totalTransactions += data.transactionCount;
    }

    const turnover = totalBuyAmount + totalSellAmount;
    const netAmount = totalBuyAmount - totalSellAmount;
    const netVolume = totalBuyVolume - totalSellVolume;

    if (turnover > 0) {
      const brokerName = await getBrokerName(brokerCode);

      brokers.push({
        brokerCode,
        brokerName,
        date: toDateStr,
        range,
        buyAmount: totalBuyAmount,
        sellAmount: totalSellAmount,
        netAmount,
        turnover,
        buyVolume: totalBuyVolume,
        sellVolume: totalSellVolume,
        netVolume,
        transactionCount: totalTransactions,
        daysInRange: datesInRange,
        averageDailyTurnover: turnover / Math.max(datesInRange, 1),
      });
    }
  }

  // Sort by turnover descending
  brokers.sort((a, b) => b.turnover - a.turnover);

  return {
    range,
    fromDate: fromDateStr,
    toDate: toDateStr,
    brokers,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetch and aggregate all time ranges at once
 */
export async function aggregateAllTimeRanges(): Promise<
  Record<string, AggregationResult>
> {
  const results: Record<string, AggregationResult> = {};

  const ranges: Array<"1D" | "3D" | "1W" | "1M" | "3M"> = [
    "1D",
    "3D",
    "1W",
    "1M",
    "3M",
  ];

  // Fetch all ranges in parallel
  const promises = ranges.map((range) => aggregateBrokerDataForRange(range));
  const aggregations = await Promise.all(promises);

  aggregations.forEach((agg, idx) => {
    results[ranges[idx]] = agg;
  });

  return results;
}
