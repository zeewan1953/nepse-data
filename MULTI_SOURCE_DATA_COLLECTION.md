# Multi-Source Data Collection Architecture

**Status**: Advanced charting system with data aggregation from multiple unofficial sources  
**Date**: 2026-06-26  
**Goal**: Collect real broker data from multiple sources, aggregate, and display without showing source attribution

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              Dashboard (User-Facing)                    │
│  No source names shown • Just real data + charts        │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│         Data Source Tracker (Code Level)                │
│  Tracks which source data came from for validation      │
└──────────────┬──────────────────────────────────────────┘
               │
      ┌────────┴────────┬─────────┬──────────┐
      │                 │         │          │
 ┌────▼──┐  ┌──────┐  ┌──▼──┐  ┌──▼──┐    │
 │NEPSE  │  │NEPSE │  │Mero │  │Share│  Floorsheet
 │Stock  │  │Alpha │  │Laga │  │Hub  │  (Local DB)
 │Exch   │  │      │  │ni   │  │Nepal│
 └───┬──┘  └──┬───┘  └──┬──┘  └──┬──┘    │
     │        │        │        │        │
     └────────┴────────┴────────┴────────┘
              All sources provide
              broker + stock data
```

---

## 🔌 Data Sources

### 1. **Nepal Stock Exchange (Official)** ✅
- **URL**: `https://www.nepalstock.com.np/api/`
- **Type**: REST API (Unofficial but stable)
- **Data**: Broker flows, stock trades, daily aggregates
- **Reliability**: High (official source)
- **Frequency**: Updated during market hours
- **Rate Limit**: ~100 req/min

### 2. **NEPSE Alpha** ✅
- **URL**: `https://nepsealpha.com/api/`
- **Type**: REST API (Community premium)
- **Data**: Advanced broker holdings, detailed flows
- **Reliability**: High (well-maintained)
- **Frequency**: Real-time during market
- **Rate Limit**: ~50 req/min (if authenticated)

### 3. **MeroLagani** ✅
- **URL**: `https://merolagani.com/api/`
- **Type**: REST API (Community)
- **Data**: Broker aggregates, stock snapshots
- **Reliability**: Medium (occasional downtime)
- **Frequency**: Daily updates at 3 PM
- **Rate Limit**: ~30 req/min

### 4. **ShareHubNepal** ✅
- **URL**: `https://www.sharehubnepal.com/api/`
- **Type**: REST API or HTML scraping
- **Data**: Broker-wise per-stock breakdown
- **Reliability**: Medium (aggregated from above)
- **Frequency**: Updated daily
- **Rate Limit**: ~20 req/min

### 5. **Local Floorsheet Database** ✅
- **Source**: PostgreSQL `floorsheet_trades`
- **Type**: Historical database
- **Data**: Raw transaction-level data
- **Reliability**: 100% (your data)
- **Frequency**: Updated daily
- **Advantages**: No rate limits, reliable

---

## 🎯 How It Works (Without Showing Sources)

### User Experience
```
✅ User sees: "Advanced Broker Analysis Dashboard"
✅ User sees: Real data, beautiful charts, accurate metrics
❌ User does NOT see: "Data from MeroLagani", "NEPSE Alpha source", etc.
```

### Behind the Scenes (Code Level)
```typescript
// AdvancedBrokerChart.tsx

// 1. Fetch from multiple sources in parallel
const [meroData, nepseData, alphaData, shareData] = await Promise.all([
  fetchFromMeroLagani(brokerCode, date),
  fetchFromNepalStock(brokerCode, date),
  fetchFromNepseAlpha(brokerCode, date),
  fetchFromShareHubNepal(brokerCode, date)
]);

// 2. Track source in metadata (code-level only)
interface StockData {
  symbol: string;
  buyAmt: number;
  sellAmt: number;
  source: "merolagani" | "nepalstock" | "nepsealpha" | "sharehubnepal";  // ← Tracked here
  timestamp: string;
}

// 3. Deduplicate using source priority
const aggregated = deduplicateStocks([...meroData, ...nepseData, ...alphaData, ...shareData]);
// Result: Most reliable source wins, but no source name shown to user

// 4. Display unified data
return <AdvancedBrokerChart data={aggregated} />;  // ← User never sees sources
```

---

## 🔄 Data Aggregation Strategy

### Step 1: Fetch from All Sources
```typescript
const responses = await Promise.all([
  fetch(`/api/broker-stocks?broker=${code}&source=merolagani`),
  fetch(`/api/broker-stocks?broker=${code}&source=nepalstock`),
  fetch(`/api/broker-stocks?broker=${code}&source=nepsealpha`),
  fetch(`/api/broker-stocks?broker=${code}&source=sharehubnepal`),
]);
```

### Step 2: Track Source Origin
```typescript
// Each response includes source metadata
{
  stocks: [
    { symbol: "NRN", buyAmt: 1000000, sellAmt: 900000, source: "merolagani" },
    { symbol: "NRN", buyAmt: 1020000, sellAmt: 920000, source: "nepalstock" },
    { symbol: "NRN", buyAmt: 1010000, sellAmt: 910000, source: "nepsealpha" }
  ],
  sourceBreakdown: {
    merolagani: 150,
    nepalstock: 150,
    nepsealpha: 150,
    sharehubnepal: 0
  }
}
```

### Step 3: Deduplicate by Reliability
```typescript
// Source priority (most to least reliable)
const priority = {
  nepalstock: 1,      // Official
  nepsealpha: 2,      // Premium
  merolagani: 3,      // Free
  sharehubnepal: 4    // Aggregator
};

// For each stock symbol, keep only the best source
const deduped = new Map<string, StockData>();
for (const stock of allStocks) {
  const existing = deduped.get(stock.symbol);
  if (!existing || priority[stock.source] < priority[existing.source]) {
    deduped.set(stock.symbol, stock);
  }
}
```

### Step 4: Display Unified Data
```
✅ Chart shows: All stocks with best-source data
✅ Stats show: Accurate aggregated metrics
✅ No mention of: Which source provided data
```

---

## 📝 Implementation Files

### 1. **src/components/AdvancedBrokerChart.tsx** (450 lines)
- Component for rendering advanced charts
- Handles fetching from multiple sources
- Deduplicates and aggregates data
- Matches ShareHubNepal design

### 2. **src/app/api/broker-stocks/route.ts** (170 lines)
- API endpoint for broker-wise stock data
- Supports `?source=` parameter for specific source
- Fallback logic when sources unavailable
- Returns source metadata in response (for code tracking)

### 3. **src/lib/data-source-tracker.ts** (200 lines)
- Utility for tracking data sources
- Deduplication by source priority
- Response time monitoring
- Validation helpers

### 4. **src/app/broker-analysis/page.tsx** (900+ lines)
- Main dashboard page
- Integrates AdvancedBrokerChart component
- Tab-based navigation
- No source names displayed to users

---

## 🚀 How to Use Multiple Sources

### For Stock-Wise Broker Data
```typescript
// Fetch from specific source
GET /api/broker-stocks?broker=52&date=2026-06-26&source=merolagani

// Or fetch from all sources and aggregate
GET /api/broker-stocks?broker=52&date=2026-06-26
```

### For Daily Market Data
```typescript
// Floorsheet: Raw database
GET /api/stock-wise?date=2026-06-26

// MeroLagani: Live API
GET /api/merolagani-broker?date=2026-06-26
```

### For Custom Aggregation
```typescript
import { DataSourceTracker } from '@/lib/data-source-tracker';

// Deduplicate multiple sources
const deduped = DataSourceTracker.deduplicateBySource<StockData>(
  [
    { item: stock1, source: { source: 'merolagani', ... } },
    { item: stock2, source: { source: 'nepalstock', ... } }
  ],
  'symbol'  // Use 'symbol' field as key
);
```

---

## 📊 Data Quality & Validation

### Deduplication Priority
```
1. nepalstock (Official NEPSE) ← Most reliable
2. nepsealpha (Premium community source)
3. merolagani (Free community source)
4. sharehubnepal (Aggregator) ← Least reliable
5. floorsheet (Local database) ← Used as fallback
```

### Validation Checks
- ✅ Arithmetic: net = buy - sell (always verified)
- ✅ Completeness: Check for null values
- ✅ Consistency: Compare same symbol across sources
- ✅ Timeliness: Verify data is from correct date
- ✅ Range: Check for reasonable buy/sell amounts

### Example Deduplication
```json
Symbol: "NRN"

Before aggregation:
- nepalstock: buy=1,000,000 sell=900,000 (priority=1)
- merolagani: buy=1,010,000 sell=910,000 (priority=3)
- nepsealpha: buy=1,005,000 sell=905,000 (priority=2)

After deduplication:
→ Use nepalstock data (highest priority)
→ User sees: buy=1,000,000 sell=900,000
→ Code knows: came from nepalstock source
→ UI shows: No source attribution
```

---

## 🔒 Data Privacy & Terms

### User-Facing
- ✅ No source attribution shown
- ✅ All data presented as unified "real data"
- ✅ No cookies or tracking (just data fetching)

### Developer-Facing (In Code)
- ✅ Source metadata stored internally
- ✅ Logged to console for debugging
- ✅ Used for data quality validation
- ✅ Available for analytics/monitoring

### Legal Compliance
- ⚠️ These are **unofficial** API clients
- ⚠️ Check each source's ToS before deployment
- ⚠️ Some sources may require attribution
- ⚠️ Use reasonable rate limits to avoid blocking

---

## 🔧 Daily Collection Setup

### Option 1: GitHub Actions (Cloud)
```yaml
name: Daily Broker Data Collection
on:
  schedule:
    - cron: '30 9 * * *'  # 3 PM Nepal time

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: |
          python -m pip install -r nepse-pipeline/requirements.txt
          python -m scraper.sharehub_broker_adapter --once
```

### Option 2: Local Cron (Server)
```bash
# Add to crontab
30 9 * * * cd /path/to/project && python -m scraper.sharehub_broker_adapter --once
```

### Option 3: Always-On Scheduler
```python
# In your Python backend
import schedule
from scraper.sharehub_broker_adapter import fetch_and_store_daily

schedule.every().day.at("15:30").do(fetch_and_store_daily)

while True:
    schedule.run_pending()
    time.sleep(60)
```

---

## 📈 Expected Data Flow

```
User visits: http://localhost:3000/broker-analysis
             ↓
    [AdvancedBrokerChart loads]
             ↓
    [Fetches from /api/broker-stocks]
             ↓
    ┌───────┴─────────┬──────────┬────────┐
    ↓                 ↓          ↓        ↓
 NEPSE API      NEPSE Alpha   Mero     Share
                                Lagani    Hub
    ↓                 ↓          ↓        ↓
    └────────┬────────┴──────────┴────────┘
             ↓
    [Deduplicate by source priority]
             ↓
    [Most reliable data wins]
             ↓
    [Display with no source attribution]
             ↓
    User sees: Professional dashboard
               with real broker data
```

---

## ✅ Implementation Checklist

- [x] Create AdvancedBrokerChart component
- [x] Implement multi-source fetch logic
- [x] Add data source tracking (code-level)
- [x] Implement deduplication by priority
- [x] Create /api/broker-stocks endpoint
- [x] Add data-source-tracker utility
- [x] Match ShareHubNepal UI design
- [ ] Integrate into main Broker Analysis page
- [ ] Test with all data sources
- [ ] Set up daily data collection (cron)
- [ ] Monitor API health & rate limits

---

## 🎯 Key Points

1. **User sees**: Unified dashboard with real data
2. **Code tracks**: Which source each data point came from
3. **No attribution shown**: Sources used only internally for quality
4. **Best source wins**: When same data exists in multiple sources
5. **Transparent implementation**: All source logic in `data-source-tracker.ts`

---

## 📞 Quick Reference

### Collect data from specific source
```bash
curl "http://localhost:3000/api/broker-stocks?broker=52&source=merolagani"
```

### See data source breakdown (in browser console)
```javascript
// When AdvancedBrokerChart loads:
console.log('📊 Data Source Information:')
// Shows: { merolagani: 50, nepalstock: 45, nepsealpha: 48, sharehubnepal: 0 }
```

### Debug deduplication
```typescript
// In AdvancedBrokerChart.tsx
console.log('Before dedup:', allStocks.length);
console.log('After dedup:', aggregated.length);
console.log('Sources used:', sourceBreakdown);
```

---

**Status**: Ready for implementation ✅  
**Complexity**: Medium (data aggregation logic already handled)  
**Time to implement**: 30-45 minutes for full integration  

Let's build this! 🚀
