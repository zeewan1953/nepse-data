# Broker Analysis - Comprehensive Test Plan & Implementation

## 🎯 Objectives

1. **Daily Data Collection**: Auto-collect broker data at 3 PM daily
2. **Historical Storage**: Store ≥1 year of broker data
3. **Data Accuracy**: Validate all data against source
4. **UI/UX Testing**: Test all time ranges (1D, 3D, 1W, 1M, 3M)
5. **Performance**: Optimize queries for large datasets
6. **Future Features**: Plan for additional functionality

---

## 📊 Test Schedule

### Phase 1: Infrastructure Setup (Today)
- [ ] Create/verify database schema for broker data
- [ ] Set up daily cron job (3 PM collection)
- [ ] Backfill historical data (past 30-90 days minimum)
- [ ] Verify data accuracy with manual spot-checks

### Phase 2: API Testing (1-2 days)
- [ ] Test `/api/broker-wise/[code]?range=1D` with real data
- [ ] Test `/api/broker-wise/[code]?range=3D` (aggregation)
- [ ] Test `/api/broker-wise/[code]?range=1W` (weekly)
- [ ] Test `/api/broker-wise/[code]?range=1M` (monthly)
- [ ] Test `/api/broker-wise/[code]?range=3M` (quarterly)
- [ ] Verify streak detection works correctly

### Phase 3: UI Testing (1-2 days)
- [ ] Stock Wise tab: verify floorsheet data display
- [ ] Broker Wise tab: verify all time ranges show correct data
- [ ] Bar charts: verify buy/sell amounts render correctly
- [ ] Favorites: test broker favoriting/unfavoriting
- [ ] Data accuracy: spot-check displayed values vs database

### Phase 4: Load & Performance (1 day)
- [ ] Test with 100+ brokers, 365 days of data
- [ ] API response time < 500ms for all queries
- [ ] UI renders without lag
- [ ] Memory usage acceptable

### Phase 5: Edge Cases (1 day)
- [ ] Missing data days (market holidays)
- [ ] Brokers with 0 trades
- [ ] Data corrections/re-scrapes
- [ ] Concurrent user requests

---

## 🗄️ Database Schema

### Table: `merolagani_broker_daily`
```sql
CREATE TABLE IF NOT EXISTS merolagani_broker_daily (
    id SERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    broker_code VARCHAR(10) NOT NULL,
    broker_name VARCHAR(255),
    purchase_amt DOUBLE PRECISION,
    sell_amt DOUBLE PRECISION,
    net_amt DOUBLE PRECISION,
    total_amt DOUBLE PRECISION,
    scraped_at TIMESTAMP DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'merolagani',
    UNIQUE (trade_date, broker_code, source),
    CONSTRAINT valid_dates CHECK (trade_date >= '2020-01-01' AND trade_date <= CURRENT_DATE)
);

CREATE INDEX ix_broker_code_date ON merolagani_broker_daily (broker_code, trade_date DESC);
CREATE INDEX ix_trade_date ON merolagani_broker_daily (trade_date DESC);
```

### View: `broker_daily_with_streaks` (Computed)
```sql
CREATE OR REPLACE VIEW broker_daily_with_streaks AS
SELECT 
    trade_date,
    broker_code,
    broker_name,
    purchase_amt,
    sell_amt,
    net_amt,
    total_amt,
    LAG(net_amt) OVER (PARTITION BY broker_code ORDER BY trade_date) AS prev_net_amt,
    CASE 
        WHEN net_amt > 0 THEN 'buy'
        WHEN net_amt < 0 THEN 'sell'
        ELSE 'neutral'
    END AS direction,
    source
FROM merolagani_broker_daily;
```

---

## 📈 Data Collection (Daily @ 3 PM)

### Cron Job Configuration
```bash
# In your scheduler (e.g., GitHub Actions, cron daemon)
# Schedule: Daily at 3 PM UTC+5:45 (Nepal time)
# Command: python -m scraper.fetch_broker_daily --date TODAY

# Retry logic:
# - If API fails: retry 3x with exponential backoff
# - If incomplete: flag for manual review
# - If duplicate: deduplicate based on (date, broker_code, source)
```

### Data Pipeline
```
MeroLagani API / ShareHubNepal
    ↓ (Daily @ 3 PM)
nepse-pipeline/scraper/merolagani_broker_adapter.py
    ↓ (Fetch & Parse)
BrokerFlowRecord[] (list of broker records)
    ↓ (Validate)
nepse-pipeline/validator/broker_validator.py
    ↓ (Dedupe & Merge)
merolagani_broker_daily (PostgreSQL)
    ↓ (API Read)
/api/broker-wise/[code]?range=1D|3D|1W|1M|3M
    ↓ (UI Display)
Broker Analysis Dashboard
```

---

## 🔍 Data Accuracy Validation

### Checklist for Each Broker
- [ ] **Total Amount**: purchase_amt + sell_amt = total_amt (check arithmetic)
- [ ] **Net Amount**: purchase_amt - sell_amt = net_amt (check sign)
- [ ] **Monotonicity**: No future dates, no skipped trading days
- [ ] **Reasonableness**: net_amt not > 100% of total_amt
- [ ] **Consistency**: Broker code matches broker name
- [ ] **Completeness**: All active brokers present (91 brokers expected)

### Spot-Check Query
```sql
-- Check data accuracy for top 10 brokers by volume
SELECT 
    broker_code,
    broker_name,
    trade_date,
    purchase_amt,
    sell_amt,
    net_amt,
    total_amt,
    ROUND(purchase_amt + sell_amt, 2) as sum_check,
    CASE 
        WHEN ROUND(purchase_amt + sell_amt, 2) = ROUND(total_amt, 2) THEN '✓'
        ELSE '✗ MISMATCH'
    END as validation
FROM merolagani_broker_daily
WHERE trade_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY total_amt DESC
LIMIT 10;
```

---

## 📊 Test Data & Scenarios

### Scenario 1: Single Day (1D)
**Test**: Load today's broker data for all ranges
```
Request: GET /api/broker-wise/52?range=1D
Expected Response:
  {
    "brokerCode": "52",
    "brokerName": "Sundhara Securities Limited",
    "daysAvailable": 1,
    "history": [{ tradeDate: "2026-06-26", ... }],
    "totals": { buyAmount: 32958024, ... },
    "currentStreak": null (only 1 day),
    "source": "merolagani"
  }
```

### Scenario 2: 3-Day Range (3D)
**Test**: Verify aggregation across 3 days
```
Request: GET /api/broker-wise/52?range=3D
Expected:
  - daysAvailable: 3 (or fewer if fewer trading days)
  - history: 3 entries (one per day)
  - currentStreak: detected if direction consistent
  - totals: sum of all 3 days
```

### Scenario 3: Weekly (1W)
**Test**: Aggregate across ~5-7 trading days
```
Request: GET /api/broker-wise/52?range=1W
Expected:
  - daysAvailable: ~5 (not calendar week, trading days)
  - currentStreak: should be accurate for last 2+ days
```

### Scenario 4: Monthly (1M)
**Test**: ~21-23 trading days
```
Request: GET /api/broker-wise/52?range=1M
Expected:
  - daysAvailable: ~21-23
  - Rolling trend visible in chart
```

### Scenario 5: Quarterly (3M)
**Test**: ~63 trading days
```
Request: GET /api/broker-wise/52?range=3M
Expected:
  - daysAvailable: ~63
  - Seasonal patterns visible
```

---

## 🧪 API Test Cases

### Test 1: Data Availability
```bash
# Check available brokers
curl "http://localhost:3000/api/merolagani-broker" | jq '.brokers | length'
# Expected: 91 (all brokers)

# Check specific broker
curl "http://localhost:3000/api/broker-wise/52?range=1D"
# Expected: Status 200, valid JSON
```

### Test 2: Range Aggregation
```bash
for range in 1D 3D 1W 1M 3M; do
  curl -s "http://localhost:3000/api/broker-wise/52?range=$range" \
    | jq ".daysAvailable, .totals.buyAmount, .currentStreak"
done
```

### Test 3: Data Consistency
```bash
# Verify: sum of history = totals
curl "http://localhost:3000/api/broker-wise/52?range=1W" \
  | jq '
    (.history | map(.purchaseAmt) | add) as $buy |
    (.totals.buyAmount) as $total |
    if ($buy | round) == ($total | round) then "✓" else "✗ Mismatch" end
  '
```

### Test 4: Streak Detection
```bash
# For 3+ days of data, verify streak is correct
curl "http://localhost:3000/api/broker-wise/52?range=3D" \
  | jq '.currentStreak, .history[].netAmt'
# Expected: streak.direction matches sign of recent netAmt values
```

---

## 🎨 UI Test Checklist

### Stock Wise Tab
- [ ] Table displays all stocks from today's floorsheet
- [ ] Sort by Turnover | Est. Net | CMF works
- [ ] Search by symbol filters correctly
- [ ] Estimated values marked with "(est.)"
- [ ] Null values render as "—"

### Broker Wise Tab
- [ ] Broker dropdown searchable
- [ ] Date range pills (1D/3D/1W/1M/3M) work correctly
- [ ] Bar chart displays:
  - [ ] Green bars for buy amount
  - [ ] Red bars for sell amount
  - [ ] Correct scale (no overflow)
  - [ ] X-axis shows dates (not symbols)
- [ ] Stat cards show:
  - [ ] Total Buy Amount (green)
  - [ ] Total Sell Amount (red)
  - [ ] Net Amount (color-coded)
  - [ ] Total Turnover (neutral)
- [ ] Streak badge:
  - [ ] Shows when 2+ consecutive same-direction days
  - [ ] Shows emoji (🟢 buy, 🔴 sell) + length
  - [ ] Hidden if `currentStreak` is null
- [ ] Disclaimer shows days available

### Favorites
- [ ] Star icon toggles favorite
- [ ] Favorites persist (localStorage)
- [ ] Summary cards load for all favorites
- [ ] Streak badges update in real-time

---

## 📱 Performance Benchmarks

| Metric | Target | Acceptable | Fail |
|--------|--------|-----------|------|
| API response (1D) | <200ms | <500ms | >1s |
| API response (3M) | <300ms | <800ms | >2s |
| UI render time | <1s | <2s | >3s |
| Memory (100 brokers) | <50MB | <100MB | >200MB |
| Chart redraw | <500ms | <1s | >2s |

---

## 🚨 Known Issues & Workarounds

### Issue 1: Missing Historical Data
**Problem**: Only 1-2 days of data available
**Workaround**:
1. Query MeroLagani API for past 30-90 days
2. Backfill database with historical records
3. Set `BACKFILL_DAYS=90` in .env

**Command**:
```bash
python -m scraper.fetch_broker_daily --backfill --days 90
```

### Issue 2: Incomplete Streak Detection
**Problem**: Streak only accurate if 2+ days available
**Workaround**: Show `currentStreak: null` when `daysAvailable < 2`
**UI Impact**: Hide streak badge (done)

### Issue 3: Market Holidays
**Problem**: No trading data on holidays
**Workaround**: API should skip missing dates
**Logic**: 
```python
# In broker_wise adapter
if trading_days < 2:
    currentStreak = None  # insufficient data
```

---

## ✅ Acceptance Criteria

- [ ] Daily data collection starts at 3 PM
- [ ] At least 30 days of historical data available
- [ ] All 5 time ranges (1D, 3D, 1W, 1M, 3M) show correct aggregated data
- [ ] Bar charts render correctly with proper scales
- [ ] Streak detection works (2+ consecutive days same direction)
- [ ] API response time < 500ms
- [ ] UI renders without lag
- [ ] Spot-check: 10 random brokers, all data matches source
- [ ] No null/NaN values in critical fields
- [ ] Handles missing/incomplete data gracefully

---

## 🔮 Future Enhancements

1. **Broker Comparison**: Compare 2-3 brokers side-by-side
2. **Heatmap**: Visual intensity map of broker activity
3. **Alerts**: Notify when broker changes direction
4. **Predictions**: ML model to predict broker sentiment
5. **Export**: Download data as CSV/Excel
6. **Real-time Updates**: WebSocket for live broker data
7. **Broker Profile**: Detailed broker history & stats
8. **Correlation**: Show correlated broker movements

---

## 📅 Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Infrastructure | 1-2 hours | TODO |
| Data Collection | 1-2 days | TODO |
| API Testing | 1-2 days | TODO |
| UI Testing | 1-2 days | TODO |
| Performance | 1 day | TODO |
| Edge Cases | 1 day | TODO |
| **Total** | **5-8 days** | **IN PROGRESS** |

---

## 📞 Support & Questions

If tests fail or data looks incorrect:
1. Check `debug_output/` directory for logs
2. Query database directly: `SELECT * FROM merolagani_broker_daily WHERE trade_date = TODAY`
3. Compare with MeroLagani source: https://www.sharehubnepal.com/market
4. Share: screenshots, error logs, actual vs expected data

Good luck! 🚀
