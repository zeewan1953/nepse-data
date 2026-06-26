/**
 * Broker Holdings Data Fixer
 *
 * Applies fixes for:
 * 1. Missing sell data (backfills from floorsheet_trades)
 * 2. Adds transaction count columns
 * 3. Calculates matching volume
 * 4. Fixes cumulative calculations
 */

import { execute } from "@/lib/db";

const BATCH_SIZE = 500;

async function fixBrokerHoldings() {
  console.log("Starting broker holdings data fixes...\n");

  // STEP 1: Add missing columns if not present
  console.log("Step 1: Adding missing columns...");
  try {
    await execute("ALTER TABLE broker_daily_agg ADD COLUMN buyContracts INTEGER DEFAULT 0");
    console.log("  ✓ Added buyContracts");
  } catch {
    console.log("  (buyContracts already exists)");
  }

  try {
    await execute("ALTER TABLE broker_daily_agg ADD COLUMN sellContracts INTEGER DEFAULT 0");
    console.log("  ✓ Added sellContracts");
  } catch {
    console.log("  (sellContracts already exists)");
  }

  try {
    await execute("ALTER TABLE broker_daily_agg ADD COLUMN matchingVolume REAL DEFAULT 0");
    console.log("  ✓ Added matchingVolume");
  } catch {
    console.log("  (matchingVolume already exists)");
  }

  try {
    await execute("ALTER TABLE broker_daily_agg ADD COLUMN matchingAmt REAL DEFAULT 0");
    console.log("  ✓ Added matchingAmt");
  } catch {
    console.log("  (matchingAmt already exists)");
  }

  // STEP 2: Get all records that need fixing
  console.log("\nStep 2: Scanning for records with missing sell data...");
  const recordsNeedingFix = await execute(
    `SELECT DISTINCT tradeDate, stockSymbol, brokerId
     FROM broker_daily_agg
     WHERE sellQty = 0 OR sellContracts = 0
     ORDER BY tradeDate DESC`
  );

  const recordCount = recordsNeedingFix.rows.length;
  console.log(`  Found ${recordCount} record(s) potentially needing fixes\n`);

  // STEP 3: Backfill sell data from floorsheet_trades
  console.log("Step 3: Backfilling sell data from floorsheet_trades...");
  let fixedCount = 0;

  for (let i = 0; i < recordCount; i += BATCH_SIZE) {
    const batch = recordsNeedingFix.rows.slice(i, Math.min(i + BATCH_SIZE, recordCount));

    for (const row of batch) {
      const tradeDate = String(row.tradeDate);
      const stockSymbol = String(row.stockSymbol);
      const brokerId = String(row.brokerId);

      // Get sell data from floorsheet_trades
      const sellResult = await execute(
        `SELECT SUM(contractQuantity) as totalQty, SUM(contractAmount) as totalAmt, COUNT(*) as contractCount
         FROM floorsheet_trades
         WHERE tradeDate = ? AND stockSymbol = ? AND sellerMemberId = ?`,
        [tradeDate, stockSymbol, brokerId]
      );

      const sellQty = Number(sellResult.rows[0]?.totalQty ?? 0);
      const sellAmt = Number(sellResult.rows[0]?.totalAmt ?? 0);
      const sellContracts = Number(sellResult.rows[0]?.contractCount ?? 0);

      if (sellQty > 0 || sellAmt > 0 || sellContracts > 0) {
        // Update the record
        await execute(
          `UPDATE broker_daily_agg
           SET sellQty = ?, sellAmt = ?, sellContracts = ?,
               netQty = buyQty - ?, netAmt = buyAmt - ?
           WHERE tradeDate = ? AND stockSymbol = ? AND brokerId = ?`,
          [sellQty, sellAmt, sellContracts, sellQty, sellAmt, tradeDate, stockSymbol, brokerId]
        );
        fixedCount++;

        if (fixedCount % 100 === 0) {
          console.log(`  Fixed ${fixedCount}/${recordCount} records...`);
        }
      }
    }
  }
  console.log(`  ✓ Fixed ${fixedCount} records with sell data\n`);

  // STEP 4: Backfill buy contract counts
  console.log("Step 4: Backfilling buy contract counts...");
  let buyCounted = 0;

  const buyCountResult = await execute(
    "SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE buyContracts = 0 AND buyQty > 0"
  );
  const buyCounts = buyCountResult.rows.length > 0 ? Number(buyCountResult.rows[0]?.cnt ?? 0) : 0;

  if (buyCounts > 0) {
    const buyRecords = await execute(
      `SELECT DISTINCT tradeDate, stockSymbol, brokerId
       FROM broker_daily_agg
       WHERE buyContracts = 0 AND buyQty > 0
       LIMIT 5000`
    );

    for (const row of buyRecords.rows) {
      const tradeDate = String(row.tradeDate);
      const stockSymbol = String(row.stockSymbol);
      const brokerId = String(row.brokerId);

      const buyCountQuery = await execute(
        `SELECT COUNT(*) as contractCount
         FROM floorsheet_trades
         WHERE tradeDate = ? AND stockSymbol = ? AND buyerMemberId = ?`,
        [tradeDate, stockSymbol, brokerId]
      );

      const buyContracts = Number(buyCountQuery.rows[0]?.contractCount ?? 0);

      await execute(
        `UPDATE broker_daily_agg
         SET buyContracts = ?
         WHERE tradeDate = ? AND stockSymbol = ? AND brokerId = ?`,
        [buyContracts, tradeDate, stockSymbol, brokerId]
      );
      buyCounted++;
    }
  }
  console.log(`  ✓ Counted buy contracts for ${buyCounted} records\n`);

  // STEP 5: Calculate matching volume
  console.log("Step 5: Calculating matching volume...");
  const updateMatchingResult = await execute(
    `UPDATE broker_daily_agg
     SET matchingVolume = CASE
           WHEN buyQty > 0 AND sellQty > 0 THEN MIN(buyQty, sellQty)
           ELSE 0
         END,
         matchingAmt = CASE
           WHEN buyQty > 0 AND sellQty > 0 THEN MIN(buyAmt, sellAmt)
           ELSE 0
         END
     WHERE matchingVolume = 0 OR matchingAmt = 0`
  );
  console.log(`  ✓ Updated matching volumes\n`);

  // STEP 6: Verify fixes
  console.log("Step 6: Verifying fixes...");
  const stillZeroSell = await execute(
    `SELECT COUNT(*) as cnt
     FROM broker_daily_agg
     WHERE sellQty = 0 AND sellAmt = 0 AND buyQty > 0`
  );
  const zeroSellCount = Number(stillZeroSell.rows[0]?.cnt ?? 0);

  const stillZeroBuyContract = await execute(
    `SELECT COUNT(*) as cnt
     FROM broker_daily_agg
     WHERE buyContracts = 0 AND buyQty > 0`
  );
  const zeroBuyContractCount = Number(stillZeroBuyContract.rows[0]?.cnt ?? 0);

  const inconsistentNet = await execute(
    `SELECT COUNT(*) as cnt
     FROM broker_daily_agg
     WHERE netQty != (buyQty - sellQty) OR netAmt != (buyAmt - sellAmt)`
  );
  const inconsistentNetCount = Number(inconsistentNet.rows[0]?.cnt ?? 0);

  console.log(`  Still missing sell data: ${zeroSellCount} records`);
  console.log(`  Still missing buy contracts: ${zeroBuyContractCount} records`);
  console.log(`  Inconsistent net calculations: ${inconsistentNetCount} records`);

  if (zeroSellCount === 0 && zeroBuyContractCount === 0 && inconsistentNetCount === 0) {
    console.log("\n  ✓ All fixes applied successfully!\n");
  } else {
    console.log("\n  ⚠ Some issues remain. These may be legitimate zero-sell or one-sided trades.\n");
  }

  // STEP 7: Generate summary statistics
  console.log("Step 7: Summary statistics...");
  const summaryStats = await execute(
    `SELECT
       COUNT(*) as totalRecords,
       COUNT(DISTINCT tradeDate) as uniqueDates,
       COUNT(DISTINCT stockSymbol) as uniqueStocks,
       COUNT(DISTINCT brokerId) as uniqueBrokers,
       SUM(CASE WHEN buyQty > 0 THEN 1 ELSE 0 END) as recordsWithBuys,
       SUM(CASE WHEN sellQty > 0 THEN 1 ELSE 0 END) as recordsWithSells,
       SUM(CASE WHEN matchingVolume > 0 THEN 1 ELSE 0 END) as recordsWithMatching,
       ROUND(AVG(CASE WHEN buyQty > 0 AND sellQty > 0 THEN CAST(MIN(buyQty, sellQty) AS FLOAT) / CAST(GREATEST(buyQty, sellQty) AS FLOAT) ELSE 0 END), 3) as avgMatchingRatio
     FROM broker_daily_agg`
  );

  const stats = summaryStats.rows[0];
  console.log(`  Total records: ${stats.totalRecords}`);
  console.log(`  Unique dates: ${stats.uniqueDates}`);
  console.log(`  Unique stocks: ${stats.uniqueStocks}`);
  console.log(`  Unique brokers: ${stats.uniqueBrokers}`);
  console.log(`  Records with buys: ${stats.recordsWithBuys}`);
  console.log(`  Records with sells: ${stats.recordsWithSells}`);
  console.log(`  Records with matching volume: ${stats.recordsWithMatching}`);
  console.log(`  Avg matching ratio: ${stats.avgMatchingRatio}\n`);

  console.log("════════════════════════════════════════════════════════════");
  console.log("FIXES COMPLETE");
  console.log("════════════════════════════════════════════════════════════\n");
}

// Run fixer
fixBrokerHoldings().catch(console.error);
