# Complete Data Fix - Stock Wise & Broker Wise Time Range Aggregation

**Status**: Stock Wise ✅ Working | Broker Wise ⏳ Needs Historical Data  
**Goal**: Ensure all time ranges (1D, 3D, 1W, 1M, 3M) work for BOTH tabs  
**Timeline**: 20 minutes total

---

## 📊 Current Status

### Stock Wise Tab ✅ WORKING
```
✓ Shows real floorsheet data (NRN, BUNGAL, RSML, etc.)
✓ Shows LTP, change %, volume, turnover
✓ Shows estimated buy/sell volumes (tick-rule)
✓ 338+ stocks displayed
✓ All data real (from floorsheet_trades table)
```

**Sample Data**:
- NRN: 1,429 LTP | 44,721 Volume | 6.56Cr Turnover | Est Buy: 20,877 | Est Sell: 23,694
- BUNGAL: 658 LTP | 67,145 Volume | 5.20Cr Turnover | Est Buy: 44,092 | Est Sell: 22,853

### Broker Wise Tab ⚠️ NEEDS HISTORICAL DATA
```
✓ Shows broker list (91 brokers)
✓ Can select brokers
✓ 1D range works (shows today's data)
✗ 3D+ ranges limited (only 1 day available)
```

---

## 🔧 THE FIX (20 Minutes)

### Fix 1: Stock Wise Time Range Aggregation

**Current**: 1D shows today's floorsheet trades  
**Need**: 3D/1W/1M/3M should aggregate across multiple days

**Implementation**:

1. **For 1D** (Today only):
```sql
SELECT symbol, SUM(quantity) as totalVolume, SUM(amount) as totalTurnover
FROM floorsheet_trades
WHERE trade_date = '2026-06-25'
GROUP BY symbol
```

2. **For 3D** (Last 3 trading days):
```sql
SELECT symbol, SUM(quantity) as totalVolume, SUM(amount) as totalTurnover
FROM floorsheet_trades
WHERE trade_date >= (CURRENT_DATE - INTERVAL '3 days')
GROUP BY symbol
```

3. **For 1W, 1M, 3M**: Similar aggregation with different date ranges

**Update API**: `src/app/api/stock-wise/route.ts`
```typescript
// Add date range logic based on ?range= parameter
const dateRange = {
  '1D': 0,
  '3D': 2,
  '1W': 6,
  '1M': 21,
  '3M': 63
}
```

### Fix 2: Broker Wise Historical Data (CRITICAL)

**Current**: Only 1 day of broker data  
**Need**: 90 days for proper aggregation

**Run Backfill**:
```bash
cd nepse-pipeline
python -m scraper.sharehub_broker_adapter --backfill --days 90
```

This will:
- ✓ Fetch last 90 days from MeroLagani
- ✓ Store in `merolagani_broker_daily` table
- ✓ Enable all 5 time ranges

---

## ✅ Complete Fix Steps

### Step 1: Update Stock Wise API (5 min)

**File**: `src/app/api/stock-wise/route.ts`

**Add this near the top**:
```typescript
const dateRangeMap: Record<string, number> = {
  '1D': 0,
  '3D': 2,
  '1W': 6,
  '1M': 21,
  '3M': 63
};

const range = sp.get("range") || "1D";
const lookbackDays = dateRangeMap[range] || 0;
const fromDate = new Date(today);
fromDate.setDate(fromDate.getDate() - lookbackDays);
```

**Update the query**:
```typescript
// Before
const allRows = await execute(
  "SELECT ... FROM floorsheet_trades WHERE tradeDate >= ? AND tradeDate <= ?",
  [fromDate, toDate]
);

// After
const allRows = await execute(
  "SELECT ... FROM floorsheet_trades WHERE trade_date >= ? AND trade_date <= ? ORDER BY symbol, trade_date",
  [fromDate.toISOString().split('T')[0], today]
);
```

### Step 2: Update Stock Wise Frontend (5 min)

**File**: `src/app/broker-analysis/page.tsx`

**In StockWiseTab component, add**:
```typescript
const [range, setRange] = useState<TimeRange>("1D");

// Update fetch to use range parameter
const fetchWithDate = useCallback(async (date: string, selectedRange: TimeRange) => {
  setLoading(true);
  try {
    const res = await fetch(`/api/stock-wise?date=${date}&range=${selectedRange}&sort=${sort}`);
    // ... rest of logic
  }
}, [sort]);
```

### Step 3: Add Time Range Selector to Stock Wise (3 min)

**In StockWiseTab, add range buttons similar to Broker Wise**:
```tsx
<div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
  {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
    <button
      key={r}
      onClick={() => {
        setRange(r);
        fetchWithDate(dateKey, r);
      }}
      className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
        range === r ? "bg-primary text-white" : "text-muted hover:text-foreground"
      }`}
    >
      {RANGE_LABELS[r]}
    </button>
  ))}
</div>
```

### Step 4: Backfill Broker Data (5 min)

```bash
cd nepse-pipeline
python -m scraper.sharehub_broker_adapter --backfill --days 90
```

### Step 5: Test All Ranges (2 min)

**Visit**: http://localhost:3000/broker-analysis

**Test Stock Wise**:
- Click "Stock Wise" tab
- Test each range: 1D → 3D → 1W → 1M → 3M
- Verify stocks show correctly for each range

**Test Broker Wise**:
- Click "Broker Wise" tab
- Select broker "52"
- Test each range: 1D → 3D → 1W → 1M → 3M
- Verify charts and stats update

---

## 📋 Expected Results

### Stock Wise After Fix

| Range | Shows | Data Aggregation |
|-------|-------|-----------------|
| **1D** | Today | Single day trades |
| **3D** | Last 3 days | Sum across 3 days |
| **1W** | Last 5-7 days | Sum across week |
| **1M** | Last 21-23 days | Sum across month |
| **3M** | Last 63 days | Sum across quarter |

**Example NRN Stock**:
- **1D**: 44,721 volume (today only)
- **3D**: 120,000+ volume (3 days aggregated)
- **1W**: 280,000+ volume (week aggregated)
- **1M**: 900,000+ volume (month aggregated)
- **3M**: 2,700,000+ volume (quarter aggregated)

### Broker Wise After Fix

| Range | Broker #52 |
|-------|----------|
| **1D** | 1 day data |
| **3D** | 3 days aggregated |
| **1W** | ~5-7 days aggregated |
| **1M** | ~21-23 days aggregated |
| **3M** | ~63 days aggregated |

---

## 🔄 Complete Workflow

```
START HERE ↓

1. Update Stock Wise API (src/app/api/stock-wise/route.ts)
   └─ Add date range logic
   
2. Update Stock Wise UI (src/app/broker-analysis/page.tsx)
   └─ Add time range buttons to Stock Wise tab
   └─ Update fetch to pass range parameter
   
3. Backfill Broker Data (5 minutes)
   └─ python -m scraper.sharehub_broker_adapter --backfill --days 90
   
4. Test Everything (browser)
   └─ Stock Wise: 1D → 3D → 1W → 1M → 3M
   └─ Broker Wise: 1D → 3D → 1W → 1M → 3M
   
5. Done! ✅
```

---

## 🎯 Final Status After Fix

### Stock Wise Tab
- ✅ 1D: Single day (today's trades)
- ✅ 3D: 3 days aggregated
- ✅ 1W: ~5-7 days aggregated
- ✅ 1M: ~21-23 days aggregated
- ✅ 3M: ~63 days aggregated
- ✅ Real floorsheet data (338+ stocks)
- ✅ Estimated buy/sell volumes (tick-rule)

### Broker Wise Tab
- ✅ 1D: Single day (today)
- ✅ 3D: 3 days aggregated
- ✅ 1W: ~5-7 days aggregated
- ✅ 1M: ~21-23 days aggregated
- ✅ 3M: ~63 days aggregated
- ✅ Real MeroLagani data (91 brokers)
- ✅ Streak detection (2+ days)
- ✅ Bar charts render correctly

---

## ✨ Key Benefits

After completing this fix:
- ✅ Both tabs support all 5 time ranges
- ✅ Stock Wise shows aggregated floorsheet data
- ✅ Broker Wise shows aggregated daily data
- ✅ Charts display meaningful data
- ✅ Trends are visible across time
- ✅ Comparisons possible (today vs week vs month vs quarter)

---

## 🚀 Implementation Priority

**MUST DO (Critical)**:
1. Backfill broker data (90 days) — 5 min
2. Test in browser — 2 min

**SHOULD DO (Recommended)**:
3. Update Stock Wise API for date ranges — 5 min
4. Add time range buttons to Stock Wise tab — 3 min
5. Comprehensive testing — 5 min

**Timeline**: 20 minutes total

---

## 📞 Commands Reference

```bash
# Backfill broker data
cd nepse-pipeline
python -m scraper.sharehub_broker_adapter --backfill --days 90

# Validate data
python -m scraper.broker_validator --backfill --days 90 --verbose

# Test in browser
# Visit: http://localhost:3000/broker-analysis
```

---

## ✅ Verification Checklist

- [ ] Stock Wise API accepts `?range=` parameter
- [ ] Stock Wise UI has time range buttons
- [ ] Broker data backfilled (90 days)
- [ ] Stock Wise 1D shows ~338 stocks
- [ ] Stock Wise 3D shows aggregated data
- [ ] Broker Wise 1D shows 1 day
- [ ] Broker Wise 3D shows 3 days
- [ ] Broker Wise 1M shows 21-23 days
- [ ] Broker Wise 3M shows 63 days
- [ ] Charts render correctly for all ranges
- [ ] No console errors
- [ ] API response < 500ms

---

**Status**: Ready to implement ✅  
**Estimated time**: 20 minutes  
**Result**: PRODUCTION READY 🚀

Let's do this! Start with backfill command.
