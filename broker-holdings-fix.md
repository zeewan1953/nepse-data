# Broker Holdings Data Issues & Fixes

## Problem Analysis

The broker holdings table shows incorrect data across multiple dimensions:

### Issue 1: Data Source Mismatch
- **Location**: `/api/broker-stocks` and `/api/broker-holding` routes
- **Root Cause**: Two different data sources used inconsistently:
  - `broker_daily_agg` table (from floorsheet trades, per-stock per-broker)
  - `merolagani_broker_daily` table (aggregated broker-level only, no per-stock detail)
- **Impact**: Per-stock holdings missing from MeroLagani API fallback

### Issue 2: Missing Sell Data
- **Symptom**: All brokers show 0 for Sell Vol/Sell Amt
- **Root Cause**: 
  - `broker_daily_agg` stores `sellQty` and `sellAmt`, but MeroLagani API provides only `purchaseAmt` and `sellAmt` (both aggregate)
  - When fallback to MeroLagani, `sellQty` is never populated (defaults to 0)
- **Impact**: Cannot calculate actual transaction ratios, matching volume

### Issue 3: Time Range Aggregation (1D, 3D, 1W, 1M, 3M)
- **Symptom**: `handleDbQuery` in broker-stocks uses `SUM()` across date ranges
- **Root Cause**: 
  - For date ranges, the code sums `netQty` and `netAmt` correctly
  - BUT: `buyQty`, `buyAmt`, `sellQty`, `sellAmt` are also summed directly
  - This is WRONG for averaging price calculations
- **Impact**: Buy/Sell amounts correct, but average prices wrong
  - Should calculate: `avgBuyPrice = SUM(buyAmt) / SUM(buyQty)`
  - Currently: Shows sum of daily averages (incorrect)

### Issue 4: Cumulative Net Calculation
- **Symptom**: `cumulativeNetQty` and `cumulativeNetAmt` show 0 in many cases
- **Root Cause**: Query sums from `MIN(tradeDate)` (earliest) to `effectiveDate`
  - Works only when brokers have continuous holding records
  - If a broker had no trades on a particular day, cumulative is correct
  - But if broker stops trading after a date, cumulative becomes negative/wrong
- **Impact**: Holding percentages cannot be calculated accurately

### Issue 5: Matching Volume/Contracts Missing
- **Symptom**: No transaction count, buy/sell contract ratios shown
- **Root Cause**: API doesn't fetch contract counts from `floorsheet_trades`
  - Need to count: GROUP BY buyer (for buy contracts), GROUP BY seller (for sell contracts)
- **Impact**: Cannot see concentration of trades (few large vs many small)

## Data Flow

```
API Request (/api/broker-stocks)
  ↓
Check DB (broker_daily_agg) for date
  ├─ YES: Return per-stock per-broker data ✓
  └─ NO: Try MeroLagani live API
      ├─ YES: Return BROKER-ONLY summary (missing per-stock) ✗
      └─ NO: Try MeroLagani DB (merolagani_broker_daily)
          └─ YES: Return BROKER-ONLY summary (missing per-stock) ✗
```

## SQL Queries to Verify Data

### Check broker_daily_agg integrity:
```sql
-- Per-stock per-broker holdings
SELECT 
  tradeDate, stockSymbol, brokerId,
  SUM(buyQty) as buyQty, SUM(buyAmt) as buyAmt,
  SUM(sellQty) as sellQty, SUM(sellAmt) as sellAmt,
  SUM(netQty) as netQty, SUM(netAmt) as netAmt,
  COUNT(*) as transCount
FROM broker_daily_agg
WHERE tradeDate = '2026-06-26' AND stockSymbol = 'ACLBSL'
GROUP BY brokerId
ORDER BY ABS(netAmt) DESC;

-- Check if any broker has 0 sellQty
SELECT DISTINCT brokerId, COUNT(*) as zeroSellCount
FROM broker_daily_agg
WHERE tradeDate = '2026-06-26' AND sellQty = 0
GROUP BY brokerId;

-- Cumulative check
SELECT brokerId, stockSymbol,
  SUM(netQty) as totalNetQty, SUM(netAmt) as totalNetAmt,
  COUNT(DISTINCT tradeDate) as tradeDays
FROM broker_daily_agg
WHERE stockSymbol = 'ACLBSL' AND tradeDate <= '2026-06-26'
GROUP BY brokerId
ORDER BY ABS(totalNetAmt) DESC;
```

### Check for missing floorsheet data:
```sql
-- Verify sell trades exist
SELECT brokerId, SUM(contractQuantity) as qty, SUM(contractAmount) as amt
FROM floorsheet_trades
WHERE tradeDate = '2026-06-26' AND stockSymbol = 'ACLBSL'
  AND sellerMemberId IS NOT NULL
GROUP BY sellerMemberId;

-- Check for 0 buy/sell imbalances
SELECT 
  COUNT(CASE WHEN sellQty = 0 THEN 1 END) as brokers_with_no_sells,
  COUNT(CASE WHEN buyQty = 0 THEN 1 END) as brokers_with_no_buys
FROM broker_daily_agg
WHERE tradeDate = '2026-06-26';
```

## Fixes Required

### Fix 1: Extend broker_daily_agg to include transaction counts
```sql
ALTER TABLE broker_daily_agg ADD COLUMN buyContracts INTEGER DEFAULT 0;
ALTER TABLE broker_daily_agg ADD COLUMN sellContracts INTEGER DEFAULT 0;
ALTER TABLE broker_daily_agg ADD COLUMN matchingVolume REAL DEFAULT 0;
ALTER TABLE broker_daily_agg ADD COLUMN matchingAmt REAL DEFAULT 0;
```

### Fix 2: Backfill transaction counts from floorsheet_trades
```sql
-- For each broker, count buy and sell contracts
UPDATE broker_daily_agg bda SET
  buyContracts = (
    SELECT COUNT(*)
    FROM floorsheet_trades fs
    WHERE fs.tradeDate = bda.tradeDate
      AND fs.stockSymbol = bda.stockSymbol
      AND fs.buyerMemberId = bda.brokerId
  ),
  sellContracts = (
    SELECT COUNT(*)
    FROM floorsheet_trades fs
    WHERE fs.tradeDate = bda.tradeDate
      AND fs.stockSymbol = bda.stockSymbol
      AND fs.sellerMemberId = bda.brokerId
  );
```

### Fix 3: Calculate matching volume
```sql
-- Matching volume = MIN(buyQty, sellQty)
UPDATE broker_daily_agg SET
  matchingVolume = CASE
    WHEN buyQty > 0 AND sellQty > 0 THEN MIN(buyQty, sellQty)
    ELSE 0
  END,
  matchingAmt = CASE
    WHEN buyQty > 0 AND sellQty > 0 THEN MIN(buyAmt, sellAmt)
    ELSE 0
  END;
```

### Fix 4: Fix API for date range aggregation
- For 1D: Return daily data (no aggregation)
- For 3D+: Calculate VWAP (Volume-Weighted Average Price)
  ```
  avgBuyPrice = SUM(buyAmt) / SUM(buyQty)
  avgSellPrice = SUM(sellAmt) / SUM(sellQty)
  ```

### Fix 5: Fix cumulative calculation
- Ensure broker has holdings before earliest_date
- Handle zero-holding dates properly
- Calculate: Cumulative = SUM(netQty/netAmt) from start_date to target_date

## Expected Table Schema

```typescript
type BrokerHoldingsRow = {
  // Per-broker per-stock per-day
  tradeDate: string;
  stockSymbol: string;
  brokerId: string;
  
  // Buy side
  buyQty: number;          // Total shares bought
  buyAmt: number;          // Total rupees spent on buys
  buyContracts: number;    // Count of buy orders
  buyAvgPrice?: number;    // buyAmt / buyQty
  
  // Sell side
  sellQty: number;         // Total shares sold
  sellAmt: number;         // Total rupees received from sales
  sellContracts: number;   // Count of sell orders
  sellAvgPrice?: number;   // sellAmt / sellQty
  
  // Net position
  netQty: number;          // buyQty - sellQty (holding)
  netAmt: number;          // buyAmt - sellAmt (cash impact)
  
  // Matching (for internal trades)
  matchingVolume: number;  // MIN(buyQty, sellQty)
  matchingAmt: number;     // MIN(buyAmt, sellAmt)
  
  // Time-aggregated (when querying ranges)
  periodStartDate?: string;
  periodEndDate?: string;
  holdingDays?: number;    // Days with active holdings
};
```

## API Response Enhancement

Current:
```json
{
  "date": "2026-06-26",
  "source": "floorsheet",
  "brokers": ["1", "2", "3"],
  "stocks": [
    {
      "brokerId": "1",
      "stockSymbol": "ACLBSL",
      "buyQty": 1000,
      "buyAmt": 50000,
      "sellQty": 0,      // BUG: Shows 0
      "sellAmt": 0,
      "netQty": 1000,
      "netAmt": 50000,
      "cumulativeNetQty": 5000,
      "cumulativeNetAmt": 250000
    }
  ],
  "totalStocks": 45
}
```

Should be:
```json
{
  "date": "2026-06-26",
  "source": "floorsheet",
  "range": "1D",
  "brokers": ["1", "2", "3"],
  "stocks": [
    {
      "brokerId": "1",
      "stockSymbol": "ACLBSL",
      "buyQty": 1000,
      "buyAmt": 50000,
      "buyContracts": 15,
      "buyAvgPrice": 50.0,
      "sellQty": 800,     // FIXED: Shows actual sell data
      "sellAmt": 40000,
      "sellContracts": 12,
      "sellAvgPrice": 50.0,
      "netQty": 200,
      "netAmt": 10000,
      "matchingVolume": 800,
      "matchingAmt": 40000,
      "matchingRatio": 0.8,  // matchingVolume / buyQty
      "cumulativeNetQty": 5000,
      "cumulativeNetAmt": 250000,
      "holdingPct": 12.5   // Based on max position
    }
  ],
  "totalStocks": 45,
  "brokerSummary": [
    {
      "brokerId": "1",
      "totalBuyQty": 50000,
      "totalBuyAmt": 2500000,
      "totalSellQty": 40000,
      "totalSellAmt": 2000000,
      "totalNetQty": 10000,
      "totalNetAmt": 500000,
      "stockCount": 45,
      "avgMatchingRatio": 0.75
    }
  ]
}
```
