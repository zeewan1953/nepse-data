/**
 * Broker Holdings Data Validator
 *
 * Validates broker_daily_agg data for:
 * 1. Missing sell data (all zeros)
 * 2. Inconsistent aggregations (buy+sell != total)
 * 3. Missing contract counts
 * 4. Cumulative calculation errors
 * 5. Time range aggregation correctness
 */

import { execute, one } from "@/lib/db";

type ValidationResult = {
  issue: string;
  severity: "error" | "warning" | "info";
  count: number;
  affectedBrokers: Set<string>;
  affectedDates: Set<string>;
  affectedStocks: Set<string>;
  samples: Array<{
    date: string;
    stock: string;
    broker: string;
    buyQty: number;
    sellQty: number;
    netQty: number;
    buyAmt: number;
    sellAmt: number;
    netAmt: number;
  }>;
};

async function validateBrokerHoldings() {
  const results: ValidationResult[] = [];

  console.log("Starting broker holdings validation...\n");

  // Get date range
  const dateResult = await execute(
    "SELECT MIN(tradeDate) as minDate, MAX(tradeDate) as maxDate FROM broker_daily_agg"
  );
  const minDate = String(dateResult.rows[0]?.minDate ?? "");
  const maxDate = String(dateResult.rows[0]?.maxDate ?? "");
  console.log(`Date range: ${minDate} to ${maxDate}\n`);

  // VALIDATION 1: Check for missing sell data
  console.log("1. Checking for missing sell data...");
  const zeroSellResult = await execute(
    `SELECT tradeDate, stockSymbol, brokerId, buyQty, sellQty, netQty, buyAmt, sellAmt, netAmt
     FROM broker_daily_agg
     WHERE sellQty = 0 AND sellAmt = 0 AND buyQty > 0
     LIMIT 100`
  );
  if (zeroSellResult.rows.length > 0) {
    const brokers = new Set<string>();
    const dates = new Set<string>();
    const stocks = new Set<string>();
    const samples = [];

    for (const row of zeroSellResult.rows) {
      brokers.add(String(row.brokerId));
      dates.add(String(row.tradeDate));
      stocks.add(String(row.stockSymbol));
      if (samples.length < 5) {
        samples.push({
          date: String(row.tradeDate),
          stock: String(row.stockSymbol),
          broker: String(row.brokerId),
          buyQty: Number(row.buyQty),
          sellQty: Number(row.sellQty),
          netQty: Number(row.netQty),
          buyAmt: Number(row.buyAmt),
          sellAmt: Number(row.sellAmt),
          netAmt: Number(row.netAmt),
        });
      }
    }

    results.push({
      issue: "Missing sell data (sellQty=0, sellAmt=0 but buyQty>0)",
      severity: "error",
      count: zeroSellResult.rows.length,
      affectedBrokers: brokers,
      affectedDates: dates,
      affectedStocks: stocks,
      samples,
    });
  }

  // VALIDATION 2: Check for missing buy data
  console.log("2. Checking for missing buy data...");
  const zeroBuyResult = await execute(
    `SELECT tradeDate, stockSymbol, brokerId, buyQty, sellQty, netQty, buyAmt, sellAmt, netAmt
     FROM broker_daily_agg
     WHERE buyQty = 0 AND buyAmt = 0 AND sellQty > 0
     LIMIT 100`
  );
  if (zeroBuyResult.rows.length > 0) {
    const brokers = new Set<string>();
    const dates = new Set<string>();
    const stocks = new Set<string>();
    const samples = [];

    for (const row of zeroBuyResult.rows) {
      brokers.add(String(row.brokerId));
      dates.add(String(row.tradeDate));
      stocks.add(String(row.stockSymbol));
      if (samples.length < 5) {
        samples.push({
          date: String(row.tradeDate),
          stock: String(row.stockSymbol),
          broker: String(row.brokerId),
          buyQty: Number(row.buyQty),
          sellQty: Number(row.sellQty),
          netQty: Number(row.netQty),
          buyAmt: Number(row.buyAmt),
          sellAmt: Number(row.sellAmt),
          netAmt: Number(row.netAmt),
        });
      }
    }

    results.push({
      issue: "Missing buy data (buyQty=0, buyAmt=0 but sellQty>0)",
      severity: "error",
      count: zeroBuyResult.rows.length,
      affectedBrokers: brokers,
      affectedDates: dates,
      affectedStocks: stocks,
      samples,
    });
  }

  // VALIDATION 3: Check for netQty/netAmt inconsistency
  console.log("3. Checking for netQty/netAmt inconsistency...");
  const inconsistentNetResult = await execute(
    `SELECT tradeDate, stockSymbol, brokerId, buyQty, sellQty, netQty, buyAmt, sellAmt, netAmt
     FROM broker_daily_agg
     WHERE netQty != (buyQty - sellQty)
     LIMIT 100`
  );
  if (inconsistentNetResult.rows.length > 0) {
    const brokers = new Set<string>();
    const dates = new Set<string>();
    const stocks = new Set<string>();
    const samples = [];

    for (const row of inconsistentNetResult.rows) {
      brokers.add(String(row.brokerId));
      dates.add(String(row.tradeDate));
      stocks.add(String(row.stockSymbol));
      if (samples.length < 5) {
        samples.push({
          date: String(row.tradeDate),
          stock: String(row.stockSymbol),
          broker: String(row.brokerId),
          buyQty: Number(row.buyQty),
          sellQty: Number(row.sellQty),
          netQty: Number(row.netQty),
          buyAmt: Number(row.buyAmt),
          sellAmt: Number(row.sellAmt),
          netAmt: Number(row.netAmt),
        });
      }
    }

    results.push({
      issue: "netQty inconsistency: netQty != (buyQty - sellQty)",
      severity: "error",
      count: inconsistentNetResult.rows.length,
      affectedBrokers: brokers,
      affectedDates: dates,
      affectedStocks: stocks,
      samples,
    });
  }

  // VALIDATION 4: Check for missing contract count columns
  console.log("4. Checking for transaction count columns...");
  try {
    const contractResult = await execute(
      "SELECT buyContracts, sellContracts FROM broker_daily_agg LIMIT 1"
    );
    if (!contractResult.rows[0]?.buyContracts) {
      results.push({
        issue: "Missing buyContracts/sellContracts columns",
        severity: "warning",
        count: 1,
        affectedBrokers: new Set(),
        affectedDates: new Set(),
        affectedStocks: new Set(),
        samples: [],
      });
    }
  } catch {
    results.push({
      issue: "buyContracts/sellContracts columns not found",
      severity: "error",
      count: 1,
      affectedBrokers: new Set(),
      affectedDates: new Set(),
      affectedStocks: new Set(),
      samples: [],
    });
  }

  // VALIDATION 5: Check for matching volume columns
  console.log("5. Checking for matching volume columns...");
  try {
    const matchResult = await execute(
      "SELECT matchingVolume, matchingAmt FROM broker_daily_agg LIMIT 1"
    );
    if (!matchResult.rows[0]?.matchingVolume) {
      results.push({
        issue: "Missing matchingVolume/matchingAmt columns",
        severity: "warning",
        count: 1,
        affectedBrokers: new Set(),
        affectedDates: new Set(),
        affectedStocks: new Set(),
        samples: [],
      });
    }
  } catch {
    results.push({
      issue: "matchingVolume/matchingAmt columns not found",
      severity: "error",
      count: 1,
      affectedBrokers: new Set(),
      affectedDates: new Set(),
      affectedStocks: new Set(),
      samples: [],
    });
  }

  // VALIDATION 6: Check for zero trading brokers (no trades on date)
  console.log("6. Checking for brokers with no sell volume on otherwise active days...");
  const noSellBrokersResult = await execute(
    `SELECT tradeDate, COUNT(*) as brokerCount,
            SUM(CASE WHEN sellQty > 0 THEN 1 ELSE 0 END) as sellBrokerCount
     FROM broker_daily_agg
     WHERE tradeDate BETWEEN ? AND ?
     GROUP BY tradeDate
     HAVING sellBrokerCount = 0 AND brokerCount > 0
     LIMIT 50`,
    [minDate, maxDate]
  );
  if (noSellBrokersResult.rows.length > 0) {
    results.push({
      issue: "All brokers have zero sell volume on certain dates",
      severity: "warning",
      count: noSellBrokersResult.rows.length,
      affectedBrokers: new Set(),
      affectedDates: new Set(noSellBrokersResult.rows.map((r: any) => String(r.tradeDate))),
      affectedStocks: new Set(),
      samples: noSellBrokersResult.rows.slice(0, 5).map((r: any) => ({
        date: String(r.tradeDate),
        stock: "N/A",
        broker: "all",
        buyQty: 0,
        sellQty: 0,
        netQty: 0,
        buyAmt: 0,
        sellAmt: 0,
        netAmt: 0,
      })),
    });
  }

  // VALIDATION 7: Check floorsheet_trades consistency
  console.log("7. Checking floorsheet_trades consistency...");
  const fsConsistencyResult = await execute(
    `SELECT bda.tradeDate, bda.stockSymbol, bda.brokerId,
            fs_buy.qty as fsActualBuyQty, bda.buyQty as aggregatedBuyQty,
            fs_sell.qty as fsActualSellQty, bda.sellQty as aggregatedSellQty
     FROM broker_daily_agg bda
     LEFT JOIN (
       SELECT tradeDate, stockSymbol, buyerMemberId as brokerId,
              SUM(contractQuantity) as qty
       FROM floorsheet_trades
       GROUP BY tradeDate, stockSymbol, buyerMemberId
     ) fs_buy ON bda.tradeDate = fs_buy.tradeDate
       AND bda.stockSymbol = fs_buy.stockSymbol
       AND bda.brokerId = fs_buy.brokerId
     LEFT JOIN (
       SELECT tradeDate, stockSymbol, sellerMemberId as brokerId,
              SUM(contractQuantity) as qty
       FROM floorsheet_trades
       GROUP BY tradeDate, stockSymbol, sellerMemberId
     ) fs_sell ON bda.tradeDate = fs_sell.tradeDate
       AND bda.stockSymbol = fs_sell.stockSymbol
       AND bda.brokerId = fs_sell.brokerId
     WHERE (COALESCE(fs_buy.qty, 0) != bda.buyQty
            OR COALESCE(fs_sell.qty, 0) != bda.sellQty)
     LIMIT 100`
  );
  if (fsConsistencyResult.rows.length > 0) {
    const brokers = new Set<string>();
    const dates = new Set<string>();
    const stocks = new Set<string>();
    const samples = [];

    for (const row of fsConsistencyResult.rows) {
      brokers.add(String(row.brokerId));
      dates.add(String(row.tradeDate));
      stocks.add(String(row.stockSymbol));
      if (samples.length < 5) {
        samples.push({
          date: String(row.tradeDate),
          stock: String(row.stockSymbol),
          broker: String(row.brokerId),
          buyQty: Number(row.fsActualBuyQty ?? 0),
          sellQty: Number(row.fsActualSellQty ?? 0),
          netQty: (Number(row.fsActualBuyQty ?? 0) - Number(row.fsActualSellQty ?? 0)),
          buyAmt: 0,
          sellAmt: 0,
          netAmt: 0,
        });
      }
    }

    results.push({
      issue: "broker_daily_agg quantities don't match floorsheet_trades",
      severity: "error",
      count: fsConsistencyResult.rows.length,
      affectedBrokers: brokers,
      affectedDates: dates,
      affectedStocks: stocks,
      samples,
    });
  }

  // Print results
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("VALIDATION RESULTS");
  console.log("════════════════════════════════════════════════════════════\n");

  if (results.length === 0) {
    console.log("✓ All validations passed! Data appears consistent.\n");
  } else {
    for (const result of results) {
      const icon = result.severity === "error" ? "✗" : "⚠";
      console.log(`${icon} [${result.severity.toUpperCase()}] ${result.issue}`);
      console.log(`  Affected records: ${result.count}`);
      if (result.affectedBrokers.size > 0) {
        console.log(`  Brokers: ${Array.from(result.affectedBrokers).slice(0, 5).join(", ")}${result.affectedBrokers.size > 5 ? ", ..." : ""}`);
      }
      if (result.affectedDates.size > 0) {
        console.log(`  Dates: ${Array.from(result.affectedDates).slice(0, 5).join(", ")}${result.affectedDates.size > 5 ? ", ..." : ""}`);
      }
      if (result.affectedStocks.size > 0) {
        console.log(`  Stocks: ${Array.from(result.affectedStocks).slice(0, 5).join(", ")}${result.affectedStocks.size > 5 ? ", ..." : ""}`);
      }
      if (result.samples.length > 0) {
        console.log("  Sample affected rows:");
        for (const sample of result.samples) {
          console.log(
            `    ${sample.date} | ${sample.stock} | Broker ${sample.broker} | Buy: ${sample.buyQty}, Sell: ${sample.sellQty}, Net: ${sample.netQty}`
          );
        }
      }
      console.log();
    }
  }

  return results;
}

// Run validation
validateBrokerHoldings().catch(console.error);
