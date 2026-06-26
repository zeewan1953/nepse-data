-- Broker Holdings Data Verification Queries
-- Use these to verify data integrity and identify issues

-- ════════════════════════════════════════════════════════════
-- 1. CHECK FOR MISSING SELL DATA
-- ════════════════════════════════════════════════════════════

-- Find brokers with zero sell volume despite having buy volume
SELECT
  tradeDate, stockSymbol, brokerId,
  buyQty, buyAmt, sellQty, sellAmt,
  netQty, netAmt
FROM broker_daily_agg
WHERE sellQty = 0 AND sellAmt = 0 AND buyQty > 0
ORDER BY tradeDate DESC, ABS(netAmt) DESC
LIMIT 50;

-- Count by broker
SELECT brokerId, COUNT(*) as zeroSellCount
FROM broker_daily_agg
WHERE sellQty = 0 AND sellAmt = 0 AND buyQty > 0
GROUP BY brokerId
ORDER BY zeroSellCount DESC;

-- ════════════════════════════════════════════════════════════
-- 2. CHECK FOR DATA CONSISTENCY
-- ════════════════════════════════════════════════════════════

-- Verify netQty = buyQty - sellQty
SELECT
  COUNT(*) as totalRecords,
  COUNT(CASE WHEN netQty = (buyQty - sellQty) THEN 1 END) as correctNetQty,
  COUNT(CASE WHEN netQty != (buyQty - sellQty) THEN 1 END) as incorrectNetQty
FROM broker_daily_agg;

-- Find records with incorrect net calculations
SELECT
  tradeDate, stockSymbol, brokerId,
  buyQty, sellQty, netQty as storedNetQty, (buyQty - sellQty) as calculatedNetQty,
  buyAmt, sellAmt, netAmt as storedNetAmt, (buyAmt - sellAmt) as calculatedNetAmt
FROM broker_daily_agg
WHERE netQty != (buyQty - sellQty) OR netAmt != (buyAmt - sellAmt)
LIMIT 50;

-- ════════════════════════════════════════════════════════════
-- 3. MATCH AGAINST FLOORSHEET_TRADES
-- ════════════════════════════════════════════════════════════

-- For a specific stock, verify aggregation correctness
-- Replace 'ACLBSL' and '2026-06-26' with actual values
SELECT
  bda.brokerId,
  bda.buyQty as aggregatedBuyQty,
  fs_buy.actual_qty as floorsheetBuyQty,
  bda.sellQty as aggregatedSellQty,
  fs_sell.actual_qty as floorsheetSellQty,
  CASE
    WHEN bda.buyQty = COALESCE(fs_buy.actual_qty, 0) THEN 'MATCH'
    ELSE 'MISMATCH'
  END as buyMatch,
  CASE
    WHEN bda.sellQty = COALESCE(fs_sell.actual_qty, 0) THEN 'MATCH'
    ELSE 'MISMATCH'
  END as sellMatch
FROM broker_daily_agg bda
LEFT JOIN (
  SELECT buyerMemberId, SUM(contractQuantity) as actual_qty
  FROM floorsheet_trades
  WHERE tradeDate = '2026-06-26' AND stockSymbol = 'ACLBSL'
  GROUP BY buyerMemberId
) fs_buy ON bda.brokerId = fs_buy.buyerMemberId
LEFT JOIN (
  SELECT sellerMemberId, SUM(contractQuantity) as actual_qty
  FROM floorsheet_trades
  WHERE tradeDate = '2026-06-26' AND stockSymbol = 'ACLBSL'
  GROUP BY sellerMemberId
) fs_sell ON bda.brokerId = fs_sell.sellerMemberId
WHERE bda.tradeDate = '2026-06-26' AND bda.stockSymbol = 'ACLBSL'
ORDER BY bda.brokerId;

-- ════════════════════════════════════════════════════════════
-- 4. CHECK FOR TRANSACTION COUNTS
-- ════════════════════════════════════════════════════════════

-- Find records missing transaction counts
SELECT
  COUNT(*) as totalRecords,
  COUNT(CASE WHEN buyContracts IS NULL OR buyContracts = 0 THEN 1 END) as missingBuyContracts,
  COUNT(CASE WHEN sellContracts IS NULL OR sellContracts = 0 THEN 1 END) as missingSellContracts
FROM broker_daily_agg;

-- For specific date and stock, show transaction counts from floorsheet
SELECT
  brokerId,
  (SELECT COUNT(*) FROM floorsheet_trades WHERE tradeDate = '2026-06-26'
    AND stockSymbol = 'ACLBSL' AND buyerMemberId = bda.brokerId) as buyContracts,
  (SELECT COUNT(*) FROM floorsheet_trades WHERE tradeDate = '2026-06-26'
    AND stockSymbol = 'ACLBSL' AND sellerMemberId = bda.brokerId) as sellContracts
FROM (
  SELECT DISTINCT brokerId FROM broker_daily_agg
  WHERE tradeDate = '2026-06-26' AND stockSymbol = 'ACLBSL'
) bda
ORDER BY brokerId;

-- ════════════════════════════════════════════════════════════
-- 5. TIME-RANGE AGGREGATION TEST
-- ════════════════════════════════════════════════════════════

-- Test 1D aggregation (should match single date)
SELECT
  '1D' as range,
  brokerId, stockSymbol,
  SUM(buyQty) as totalBuyQty,
  SUM(buyAmt) as totalBuyAmt,
  SUM(sellQty) as totalSellQty,
  SUM(sellAmt) as totalSellAmt,
  SUM(netQty) as totalNetQty,
  SUM(netAmt) as totalNetAmt,
  COUNT(DISTINCT tradeDate) as daysIncluded
FROM broker_daily_agg
WHERE tradeDate = '2026-06-26' AND stockSymbol = 'ACLBSL'
GROUP BY brokerId
ORDER BY ABS(totalNetAmt) DESC;

-- Test 3D aggregation with VWAP calculation
SELECT
  '3D' as range,
  brokerId, stockSymbol,
  SUM(buyQty) as totalBuyQty,
  SUM(buyAmt) as totalBuyAmt,
  ROUND(SUM(buyAmt) * 1.0 / NULLIF(SUM(buyQty), 0), 2) as avgBuyPrice,
  SUM(sellQty) as totalSellQty,
  SUM(sellAmt) as totalSellAmt,
  ROUND(SUM(sellAmt) * 1.0 / NULLIF(SUM(sellQty), 0), 2) as avgSellPrice,
  SUM(netQty) as totalNetQty,
  SUM(netAmt) as totalNetAmt,
  COUNT(DISTINCT tradeDate) as daysIncluded
FROM broker_daily_agg
WHERE tradeDate >= DATE('2026-06-26', '-2 days') AND tradeDate <= '2026-06-26'
  AND stockSymbol = 'ACLBSL'
GROUP BY brokerId
ORDER BY ABS(totalNetAmt) DESC;

-- ════════════════════════════════════════════════════════════
-- 6. MATCHING VOLUME ANALYSIS
-- ════════════════════════════════════════════════════════════

-- Calculate matching volume (internal trading within broker)
SELECT
  tradeDate, stockSymbol, brokerId,
  buyQty, sellQty,
  CASE
    WHEN buyQty > 0 AND sellQty > 0 THEN MIN(buyQty, sellQty)
    ELSE 0
  END as matchingVolume,
  CASE
    WHEN buyQty > 0 AND sellQty > 0 THEN ROUND(100.0 * MIN(buyQty, sellQty) / GREATEST(buyQty, sellQty), 2)
    ELSE 0
  END as matchingPercent,
  CASE
    WHEN buyQty > sellQty THEN 'Net Buy'
    WHEN sellQty > buyQty THEN 'Net Sell'
    ELSE 'Neutral'
  END as bias
FROM broker_daily_agg
WHERE tradeDate = '2026-06-26' AND stockSymbol = 'ACLBSL'
ORDER BY buyQty + sellQty DESC;

-- ════════════════════════════════════════════════════════════
-- 7. CUMULATIVE HOLDINGS ANALYSIS
-- ════════════════════════════════════════════════════════════

-- Cumulative net position from earliest date to target date
SELECT
  brokerId, stockSymbol,
  SUM(netQty) as cumulativeNetQty,
  SUM(netAmt) as cumulativeNetAmt,
  COUNT(DISTINCT tradeDate) as tradeDays,
  MAX(tradeDate) as lastTradeDate,
  MIN(tradeDate) as firstTradeDate
FROM broker_daily_agg
WHERE stockSymbol = 'ACLBSL' AND tradeDate <= '2026-06-26'
GROUP BY brokerId
ORDER BY ABS(cumulativeNetAmt) DESC;

-- ════════════════════════════════════════════════════════════
-- 8. DATA QUALITY SUMMARY
-- ════════════════════════════════════════════════════════════

SELECT
  (SELECT COUNT(*) FROM broker_daily_agg) as totalRecords,
  (SELECT COUNT(DISTINCT tradeDate) FROM broker_daily_agg) as uniqueDates,
  (SELECT COUNT(DISTINCT stockSymbol) FROM broker_daily_agg) as uniqueStocks,
  (SELECT COUNT(DISTINCT brokerId) FROM broker_daily_agg) as uniqueBrokers,
  (SELECT COUNT(*) FROM broker_daily_agg WHERE buyQty > 0) as recordsWithBuys,
  (SELECT COUNT(*) FROM broker_daily_agg WHERE sellQty > 0) as recordsWithSells,
  (SELECT COUNT(*) FROM broker_daily_agg WHERE buyQty > 0 AND sellQty > 0) as recordsWithBothBuySell,
  (SELECT COUNT(*) FROM broker_daily_agg WHERE buyQty > 0 AND sellQty = 0) as recordsOnlySellZero,
  (SELECT COUNT(*) FROM floorsheet_trades) as totalFloorsheetTrades,
  (SELECT COUNT(DISTINCT DATE(tradeDate)) FROM floorsheet_trades) as floorsheetUniqueDates;

-- ════════════════════════════════════════════════════════════
-- 9. BROKER PERFORMANCE BY DATE
-- ════════════════════════════════════════════════════════════

-- Daily broker flow for a specific stock
SELECT
  tradeDate,
  brokerId,
  COUNT(DISTINCT stockSymbol) as stockCount,
  SUM(buyQty) as totalBuyQty,
  SUM(buyAmt) as totalBuyAmt,
  SUM(sellQty) as totalSellQty,
  SUM(sellAmt) as totalSellAmt,
  SUM(netQty) as totalNetQty,
  SUM(netAmt) as totalNetAmt
FROM broker_daily_agg
WHERE tradeDate >= DATE('2026-06-26', '-7 days') AND tradeDate <= '2026-06-26'
GROUP BY tradeDate, brokerId
ORDER BY tradeDate DESC, ABS(totalNetAmt) DESC;
