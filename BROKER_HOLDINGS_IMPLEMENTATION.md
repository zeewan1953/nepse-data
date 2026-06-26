# Broker Holdings Data - Implementation Guide

## Overview

The broker holdings table displays per-broker per-stock trading activity with significant data quality issues. This guide provides complete fixes with validation and verification steps.

## Files Created

1. **broker-holdings-fix.md** - Detailed problem analysis
2. **scripts/broker-holdings-validator.ts** - Data quality checks
3. **scripts/broker-holdings-fixer.ts** - Automatic fixes
4. **scripts/broker-holdings-verify.sql** - Verification queries
5. **src/app/api/broker-stocks/route-fixed.ts** - Fixed API route

## Issues & Solutions

### Issue 1: Missing Sell Data (0 for Sell Vol/Sell Amt)

**Root Cause:**
- `broker_daily_agg` should store per-broker per-stock buy and sell volumes from floorsheet trades
- However, some records show `sellQty = 0` and `sellAmt = 0` despite having `buyQty > 0`
- This indicates incomplete data syncing from `floorsheet_trades`

**Solution:**
1. Run validator to identify affected records
2. Backfill from `floorsheet_trades` table:
   ```sql
   UPDATE broker_daily_agg bda SET
     sellQty = (
       SELECT SUM(contractQuantity)
       FROM floorsheet_trades
       WHERE tradeDate = bda.tradeDate
         AND stockSymbol = bda.stockSymbol
         AND sellerMemberId = bda.brokerId
     ),
     netQty = buyQty - (
       SELECT SUM(contractQuantity)
       FROM floorsheet_trades
       WHERE tradeDate = bda.tradeDate
         AND stockSymbol = bda.stockSymbol
         AND sellerMemberId = bda.brokerId
     )
   WHERE sellQty = 0 AND buyQty > 0;
   ```

### Issue 2: Missing Transaction Counts

**Root Cause:**
- Database schema doesn't include `buyContracts` and `sellContracts` columns
- Cannot calculate transaction ratios or concentration metrics

**Solution:**
1. Add columns:
   ```sql
   ALTER TABLE broker_daily_agg ADD COLUMN buyContracts INTEGER DEFAULT 0;
   ALTER TABLE broker_daily_agg ADD COLUMN sellContracts INTEGER DEFAULT 0;
   ```

2. Backfill from floorsheet:
   ```sql
   UPDATE broker_daily_agg bda SET
     buyContracts = (
       SELECT COUNT(*)
       FROM floorsheet_trades
       WHERE tradeDate = bda.tradeDate
         AND stockSymbol = bda.stockSymbol
         AND buyerMemberId = bda.brokerId
     ),
     sellContracts = (
       SELECT COUNT(*)
       FROM floorsheet_trades
       WHERE tradeDate = bda.tradeDate
         AND stockSymbol = bda.stockSymbol
         AND sellerMemberId = bda.brokerId
     );
   ```

### Issue 3: Missing Matching Volume

**Root Cause:**
- No calculation of overlap between buys and sells by same broker
- Important for identifying internal/matched trading

**Solution:**
1. Add columns:
   ```sql
   ALTER TABLE broker_daily_agg ADD COLUMN matchingVolume REAL DEFAULT 0;
   ALTER TABLE broker_daily_agg ADD COLUMN matchingAmt REAL DEFAULT 0;
   ```

2. Calculate:
   ```sql
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

### Issue 4: Time Range Aggregation (1D, 3D, 1W, 1M, 3M)

**Root Cause:**
- Current API sums all metrics directly: `SUM(buyQty)`, `SUM(buyAmt)`, etc.
- This is correct for total volumes but WRONG for prices
- When aggregating across days, need VWAP (Volume-Weighted Average Price)

**Current (Wrong):**
```
Daily 1: 1000 shares @ 50 = 50,000
Daily 2: 1000 shares @ 60 = 60,000
---
Sum: 2000 shares, 110,000 -> Avg = 55

But API shows:
Daily 1 avg: 50, Daily 2 avg: 60
If summed: 110 (wrong!)
```

**Correct (Fixed):**
```
VWAP = SUM(buyAmt) / SUM(buyQty)
      = 110,000 / 2000
      = 55 per share ✓
```

**Solution:** See `src/app/api/broker-stocks/route-fixed.ts`

### Issue 5: Cumulative Net Calculation

**Root Cause:**
- Cumulative sum from earliest date works only if broker has continuous holdings
- Missing dates or zero-holding dates break the calculation

**Example Problem:**
```
Jan 1: Buy 100 (cumulative = +100)
Jan 2: No trade (cumulative should still = +100)
Jan 3: Sell 50 (cumulative = +50)

But if Jan 2 missing from data:
Query: SUM from earliest to Jan 3 = +100 +50 = +150 (WRONG!)
Should be: +100 +0 -50 = +50 ✓
```

**Solution:**
```sql
-- Correct cumulative: sum all net activity from start to date
SELECT
  brokerId, stockSymbol,
  SUM(netQty) as correctCumulative
FROM broker_daily_agg
WHERE stockSymbol = 'ACLBSL'
  AND tradeDate >= '2020-01-01' -- earliest date broker started
  AND tradeDate <= '2026-06-26' -- target date
GROUP BY brokerId, stockSymbol;
```

## Implementation Steps

### Step 1: Run Validator
```bash
npx ts-node scripts/broker-holdings-validator.ts
```

This identifies:
- Missing sell data
- Transaction count gaps
- Inconsistencies
- Floorsheet matching issues

### Step 2: Apply Fixes
```bash
npx ts-node scripts/broker-holdings-fixer.ts
```

This:
1. Adds missing columns
2. Backfills from floorsheet_trades
3. Calculates matching volumes
4. Verifies fixes applied

### Step 3: Verify Data Integrity
```sql
-- Run each query from broker-holdings-verify.sql
-- Key queries:
-- 1. Check for missing sell data
-- 2. Verify floorsheet consistency
-- 3. Validate time-range aggregation
-- 4. Confirm matching volumes
```

### Step 4: Update API Route
```bash
# Backup current route
cp src/app/api/broker-stocks/route.ts src/app/api/broker-stocks/route.backup.ts

# Deploy fixed route
cp src/app/api/broker-stocks/route-fixed.ts src/app/api/broker-stocks/route.ts
```

**Key Changes in Fixed Route:**
- Returns `buyContracts`, `sellContracts`, `matchingVolume`
- Properly handles time-range aggregation
- Includes metadata about aggregation period
- Better error handling for cumulative calculations

### Step 5: Update Holding Page UI
Update `src/app/holding/page.tsx` to display:
- Buy/Sell contract counts
- Matching volume and ratio
- Average buy/sell prices (for ranges)
- Data quality indicators

Example addition:
```typescript
type StockHolding = {
  // ... existing fields ...
  buyContracts?: number;
  sellContracts?: number;
  matchingVolume?: number;
  matchingRatio?: number;
  buyAvgPrice?: number;
  sellAvgPrice?: number;
};
```

## Database Schema Update

```sql
-- Add new columns to broker_daily_agg
ALTER TABLE broker_daily_agg ADD COLUMN buyContracts INTEGER DEFAULT 0;
ALTER TABLE broker_daily_agg ADD COLUMN sellContracts INTEGER DEFAULT 0;
ALTER TABLE broker_daily_agg ADD COLUMN matchingVolume REAL DEFAULT 0;
ALTER TABLE broker_daily_agg ADD COLUMN matchingAmt REAL DEFAULT 0;

-- Create index for faster queries
CREATE INDEX idx_bda_matching ON broker_daily_agg(matchingVolume)
WHERE matchingVolume > 0;
```

## API Response Changes

### Before (Broken):
```json
{
  "stocks": [{
    "brokerId": "1",
    "stockSymbol": "ACLBSL",
    "buyQty": 1000,
    "buyAmt": 50000,
    "sellQty": 0,
    "sellAmt": 0,
    "netQty": 1000,
    "netAmt": 50000,
    "cumulativeNetQty": null,
    "cumulativeNetAmt": null
  }],
  "brokerSummary": []
}
```

### After (Fixed):
```json
{
  "date": "2026-06-26",
  "range": "1D",
  "stocks": [{
    "brokerId": "1",
    "stockSymbol": "ACLBSL",
    "buyQty": 1000,
    "buyAmt": 50000,
    "buyContracts": 15,
    "buyAvgPrice": 50.0,
    "sellQty": 800,
    "sellAmt": 40000,
    "sellContracts": 12,
    "sellAvgPrice": 50.0,
    "netQty": 200,
    "netAmt": 10000,
    "matchingVolume": 800,
    "matchingAmt": 40000,
    "matchingRatio": 0.8,
    "cumulativeNetQty": 5000,
    "cumulativeNetAmt": 250000,
    "holdingPct": 12.5
  }],
  "brokerSummary": [{
    "brokerId": "1",
    "buyQty": 50000,
    "buyAmt": 2500000,
    "sellQty": 40000,
    "sellAmt": 2000000,
    "netQty": 10000,
    "netAmt": 500000,
    "matchingRatio": 0.75
  }]
}
```

## Testing Checklist

- [ ] Validator identifies all data issues
- [ ] Fixer applies all corrections without errors
- [ ] SQL verification queries show consistent data
- [ ] API returns complete per-stock holdings
- [ ] Time-range aggregation calculates VWAP correctly
- [ ] Cumulative net positions match manual calculations
- [ ] UI displays all new metrics properly
- [ ] No performance degradation (query times < 1s)
- [ ] Historical data for 1D, 3D, 1W, 1M, 3M periods valid

## Performance Impact

- **Query Complexity**: Increased (added JOINs for contracts)
- **Index Strategy**: Add index on `(tradeDate, brokerId, stockSymbol)` if not present
- **Data Size**: ~2-3 columns added per record (negligible)
- **Query Time**: Should remain <500ms for typical queries

## Rollback Plan

If issues arise:
```bash
# Restore original API
cp src/app/api/broker-stocks/route.backup.ts src/app/api/broker-stocks/route.ts

# Optional: revert database
-- DROP added columns if needed
-- ALTER TABLE broker_daily_agg DROP COLUMN buyContracts;
-- etc.
```

## Monitoring

After deployment, monitor:
1. API response times (should be <1s)
2. Data consistency (run validator weekly)
3. User feedback on data accuracy
4. Missing sell data incidents

## References

- **Data Source**: `/api/broker-stocks` and `/api/broker-holding`
- **Database Tables**: `broker_daily_agg`, `floorsheet_trades`, `merolagani_broker_daily`
- **UI Component**: `src/app/holding/page.tsx`
- **Related Files**: `src/lib/db.ts`, `src/lib/date-utils.ts`
