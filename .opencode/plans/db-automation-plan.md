# DB Automation & 5s Auto-Refresh Plan

## Step 1: Centralize constants
**File:** `src/lib/trading-periods.ts`
- Remove `import "server-only"` so client components can import `TRADING_DAYS`
- Add `export const RANGE_LABELS` with `{ "1D": "1D", "3D": "3D", "1W": "1W", "1M": "1M", "3M": "3M" }`

## Step 2: Fix /api/broker/[code]/route.ts
**File:** `src/app/api/broker/[code]/route.ts`
- Import `{ TRADING_DAYS, getTradingDaysForRange }` from `@/lib/trading-periods`
- Replace hardcoded `lookback` with `TRADING_DAYS`
- Replace calendar-date range with `getTradingDaysForRange(range)`, query via `IN (?)`
- Remove `"TODAY"` special case

## Step 3: Fix broker-data-aggregator.ts
**File:** `src/lib/broker-data-aggregator.ts`
- Import `{ TRADING_DAYS }` from `@/lib/trading-periods`
- Replace inline `lookbackDays` with `TRADING_DAYS`

## Step 4: Fix broker-performance.tsx
**File:** `src/app/broker-analysis/broker-performance.tsx`
- Import `{ TRADING_DAYS, RANGE_LABELS }` from `@/lib/trading-periods`
- Remove hardcoded `RANGE_DAYS` and `RANGE_LABELS`

## Step 5: Clean broker-performance/route.ts
**File:** `src/app/api/broker-performance/route.ts`
- Remove unused `RANGE_DAYS` dict
- Replace validation with `export const VALID_RANGES = new Set(["1D","3D","1W","1M","3M"])`

## Step 6: Add 5s refresh to all tabs
**Files:** `page.tsx`, `StockBrokerFlow.tsx`, `broker-performance.tsx`
- Add `setInterval(fetchData, 5000)` pattern to BrokerWiseTab, SummaryTab, BrokerFavoriteTab, Flow, Performance
