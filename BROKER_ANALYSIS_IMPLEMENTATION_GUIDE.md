# Broker Analysis Dashboard — Full Implementation Guide

## 🎯 Complete System Architecture

```
Daily Broker Data Collection (3 PM)
        ↓
MeroLagani API / ShareHubNepal
        ↓
sharehub_broker_adapter.py (fetch & parse)
        ↓
broker_validator.py (validate accuracy)
        ↓
PostgreSQL: merolagani_broker_daily table
        ↓
/api/broker-wise/[code]?range=1D|3D|1W|1M|3M
        ↓
Broker Analysis UI (frontend)
        ↓
Bar Charts + Streak Detection + Favorites
```

---

## 📋 Implementation Checklist

### Phase 1: Database Setup (1 hour)

- [ ] **Create broker tables**
  ```bash
  psql -U your_user -d your_db -f nepse-pipeline/db/init_broker_tables.sql
  ```
  
- [ ] **Verify tables created**
  ```bash
  psql -U your_user -d your_db -c "
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND table_name LIKE '%broker%';"
  ```
  
- [ ] **Test data insertion**
  ```bash
  psql -U your_user -d your_db -c "
    INSERT INTO merolagani_broker_daily 
    (trade_date, broker_code, broker_name, purchase_amt, sell_amt, net_amt, total_amt, source)
    VALUES ('2026-06-25', '52', 'Sundhara Securities Limited', 32958024, 22263463.1, 10694560.9, 55221487.1, 'merolagani');"
  ```

### Phase 2: Fill Adapter TODOs (30 minutes)

- [ ] **Open**: `nepse-pipeline/scraper/sharehub_broker_adapter.py`
- [ ] **Reference**: `SHAREHUB_TODO_CHECKLIST.md` for all 28 TODO locations
- [ ] **Fill in**:
  - JSON API path: endpoint URL, headers, field mapping
  - OR HTML path: page URL, selectors, column mapping
- [ ] **Test adapter**:
  ```bash
  cd nepse-pipeline
  python -m scraper.sharehub_broker_adapter --once
  ```

### Phase 3: Backfill Historical Data (2-4 hours)

- [ ] **Fetch past 30 days of broker data**
  ```bash
  cd nepse-pipeline
  python -m scraper.sharehub_broker_adapter --backfill --days 30
  ```

- [ ] **Validate data accuracy**
  ```bash
  python -m scraper.broker_validator --backfill --days 30 --verbose
  ```

- [ ] **Check database**
  ```bash
  psql -U your_user -d your_db -c "
    SELECT COUNT(DISTINCT trade_date) as days, COUNT(*) as total_records
    FROM merolagani_broker_daily
    WHERE source = 'merolagani';"
  ```

### Phase 4: API Testing (1-2 hours)

- [ ] **Test single day (1D)**
  ```bash
  curl "http://localhost:3000/api/broker-wise/52?range=1D" | jq '.'
  ```
  Expected: 1 day of data, valid JSON

- [ ] **Test 3 days (3D)**
  ```bash
  curl "http://localhost:3000/api/broker-wise/52?range=3D" | jq '.'
  ```
  Expected: 3 days aggregated, totals sum correctly

- [ ] **Test weekly (1W)**
  ```bash
  curl "http://localhost:3000/api/broker-wise/52?range=1W" | jq '.daysAvailable, .totals'
  ```
  Expected: ~5-7 trading days

- [ ] **Test monthly (1M)**
  ```bash
  curl "http://localhost:3000/api/broker-wise/52?range=1M" | jq '.daysAvailable'
  ```
  Expected: ~21-23 trading days

- [ ] **Test quarterly (3M)**
  ```bash
  curl "http://localhost:3000/api/broker-wise/52?range=3M" | jq '.daysAvailable'
  ```
  Expected: ~63 trading days

### Phase 5: UI Testing (1-2 hours)

- [ ] **Visit**: http://localhost:3000/broker-analysis
- [ ] **Stock Wise tab**:
  - [ ] Table loads with real floorsheet data
  - [ ] Search filters work
  - [ ] Sort options (Turnover, Est. Net, CMF) work
  - [ ] Estimated values marked with "(est.)"

- [ ] **Broker Wise tab**:
  - [ ] Broker dropdown searchable
  - [ ] Select broker 52 (Sundhara Securities)
  - [ ] Time range pills work: 1D → 3D → 1W → 1M → 3M
  - [ ] Bar chart displays correctly
  - [ ] Stat cards show: Buy, Sell, Net, Turnover
  - [ ] Streak badge shows (if 2+ consecutive days same direction)
  - [ ] Disclaimer shows days available

- [ ] **Favorites**:
  - [ ] Star icon toggles
  - [ ] Favorites persist in localStorage
  - [ ] Summary cards load for all favorites

### Phase 6: Data Accuracy Validation (1 hour)

- [ ] **Spot-check 10 brokers against source**:
  ```bash
  # Top 10 by turnover in last 7 days
  psql -U your_user -d your_db -c "
    SELECT broker_code, broker_name, SUM(total_amt) as turnover
    FROM merolagani_broker_daily
    WHERE trade_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY broker_code, broker_name
    ORDER BY turnover DESC
    LIMIT 10;" > /tmp/top_brokers.txt
  ```

- [ ] **Validate arithmetic for each**:
  ```bash
  psql -U your_user -d your_db -c "
    SELECT 
      broker_code,
      ABS(ROUND(purchase_amt + sell_amt, 2) - ROUND(total_amt, 2)) as discrepancy
    FROM merolagani_broker_daily
    WHERE trade_date >= CURRENT_DATE - INTERVAL '7 days'
      AND discrepancy > 0.01
    LIMIT 10;" # Should be empty
  ```

- [ ] **Verify against MeroLagani**:
  - [ ] Go to https://www.sharehubnepal.com/market
  - [ ] Check top 5 brokers today
  - [ ] Compare turnover amounts with your database
  - [ ] Record any discrepancies

### Phase 7: Performance Testing (1 hour)

- [ ] **Response time benchmark**:
  ```bash
  time curl -s "http://localhost:3000/api/broker-wise/52?range=3M" > /dev/null
  # Expected: < 500ms
  ```

- [ ] **Load test (100 concurrent requests)**:
  ```bash
  ab -n 100 -c 10 "http://localhost:3000/api/broker-wise/52?range=1W"
  # Expected: < 1s median time
  ```

- [ ] **UI responsiveness**:
  - [ ] Open DevTools → Performance tab
  - [ ] Record while switching time ranges
  - [ ] Check main thread isn't blocked (< 50ms frame time)

### Phase 8: Setup Daily Cron (30 minutes)

Choose one:

**Option A: GitHub Actions** (Recommended)
```yaml
# .github/workflows/broker-daily.yml
name: Daily Broker Data Collection
on:
  schedule:
    - cron: '30 9 * * *'  # 3 PM Nepal time (UTC+5:45)

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: |
          python -m scraper.sharehub_broker_adapter --once
          python -m scraper.broker_validator --check-latest
```

**Option B: System Cron**
```bash
# In: crontab -e
30 9 * * * cd /path/to/nepse-pipeline && python -m scraper.sharehub_broker_adapter --once >> /var/log/broker-daily.log 2>&1
```

**Option C: Docker Cron**
```dockerfile
# In Dockerfile
CMD ["crond", "-f", "-l", "2"]
# Add: 30 9 * * * python -m scraper.sharehub_broker_adapter --once
```

---

## 🧪 Test Cases & Expected Results

### Test Case 1: Historical Data Completeness
```bash
# Query: Check how many days of data we have
SELECT COUNT(DISTINCT trade_date) as trading_days
FROM merolagani_broker_daily
WHERE source = 'merolagani';

# Expected: >= 30 (after backfill)
```

### Test Case 2: Broker Count Per Day
```bash
# Query: Check if all ~91 brokers are present each day
SELECT trade_date, COUNT(DISTINCT broker_code) as broker_count
FROM merolagani_broker_daily
WHERE source = 'merolagani'
  AND trade_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY trade_date
ORDER BY trade_date DESC;

# Expected: ~85-91 brokers per day
```

### Test Case 3: Streak Detection
```bash
# Query: Validate streak for broker 52
WITH daily_net AS (
  SELECT 
    trade_date,
    net_amt,
    CASE WHEN net_amt > 0 THEN 'buy' ELSE 'sell' END as direction
  FROM merolagani_broker_daily
  WHERE broker_code = '52'
    AND source = 'merolagani'
  ORDER BY trade_date DESC
  LIMIT 10
)
SELECT trade_date, direction, net_amt
FROM daily_net;

# Expected: Identify if last N days have same direction
```

### Test Case 4: Time Range Aggregation
```bash
# Test: 1W range aggregation
SELECT 
  SUM(purchase_amt) as week_buy,
  SUM(sell_amt) as week_sell,
  SUM(net_amt) as week_net,
  COUNT(DISTINCT trade_date) as trading_days
FROM merolagani_broker_daily
WHERE broker_code = '52'
  AND source = 'merolagani'
  AND trade_date >= CURRENT_DATE - INTERVAL '7 days';

# Expected: Sums match API /api/broker-wise/52?range=1W
```

---

## 📊 Data Quality Metrics

Track these daily:

```sql
-- Create metrics view
INSERT INTO broker_data_metrics (trade_date, total_brokers, total_buy_amount, total_sell_amount, data_quality_score)
SELECT 
  CURRENT_DATE,
  COUNT(DISTINCT broker_code),
  SUM(purchase_amt),
  SUM(sell_amt),
  (COUNT(DISTINCT broker_code)::float / 91) * 100
FROM merolagani_broker_daily
WHERE source = 'merolagani'
  AND trade_date = CURRENT_DATE;
```

**Target Metrics**:
- Daily brokers: ≥85 (out of 91)
- Data quality score: ≥90%
- Arithmetic errors: 0
- Missing values: <1%

---

## 🚨 Troubleshooting

### Issue: "daysAvailable is 1 for all ranges"
**Cause**: Only 1-2 days of data in database
**Solution**:
```bash
python -m scraper.sharehub_broker_adapter --backfill --days 90
# Wait for completion, then re-test
```

### Issue: "Totals don't match individual days"
**Cause**: Aggregation logic incorrect in API
**Solution**: Check `src/app/api/broker-wise/[brokerCode]/route.ts`
```typescript
// Verify aggregation:
const totals = history.reduce(
  (a, r) => ({
    buyAmount: a.buyAmount + r.purchaseAmt,
    sellAmount: a.sellAmount + r.sellAmt,
    netAmount: a.netAmount + r.netAmt,
    turnover: a.turnover + r.totalAmt,
  }),
  { buyAmount: 0, sellAmount: 0, netAmount: 0, turnover: 0 }
);
```

### Issue: "Bar chart doesn't display"
**Cause**: `history` array is empty or malformed
**Solution**: Check API response in DevTools
```javascript
// In browser console:
fetch('/api/broker-wise/52?range=3D').then(r => r.json()).then(d => console.log(d.history))
```

### Issue: "Streak badge shows wrong direction"
**Cause**: `currentStreak` detection logic incorrect
**Solution**: Verify in `sharehub_broker_adapter.py`
```python
# currentStreak should be null if daysAvailable < 2
if daysAvailable < 2:
    currentStreak = None
```

---

## 📱 UI Checklist

After implementation, verify:

- [ ] **Stock Wise Tab**
  - [ ] Displays real floorsheet data
  - [ ] Search works
  - [ ] Sort options work (Turnover, Est. Net, CMF)
  - [ ] Estimated values show "(est.)" label
  - [ ] Null values render as "—"
  - [ ] No broker IDs/names visible

- [ ] **Broker Wise Tab**
  - [ ] Broker dropdown is searchable
  - [ ] Can select any broker from list
  - [ ] Date range pills change time window
  - [ ] Bar chart renders correctly
  - [ ] Green bars = buy amount
  - [ ] Red bars = sell amount
  - [ ] X-axis = dates (not stock symbols)
  - [ ] Stat cards: Buy | Sell | Net | Turnover
  - [ ] Streak badge shows when applicable (2+ days)
  - [ ] Disclaimer shows "Based on N day(s) of stored data"
  - [ ] No stock symbols visible on this tab

- [ ] **Favorites**
  - [ ] Star icon toggles favorite
  - [ ] Favorites persist after reload
  - [ ] Summary cards load for all favorites
  - [ ] Shows buy/sell/net/streak for each

- [ ] **Data Validation**
  - [ ] Random 10 brokers checked vs source
  - [ ] All totals match (buy + sell = turnover)
  - [ ] Net amounts are correct signs
  - [ ] No future dates
  - [ ] No missing trading days (except weekends/holidays)

---

## 🎯 Success Criteria

**When you can answer YES to all:**

✅ Do you have ≥30 days of broker data in database?
✅ Do the API endpoints return correct data for all 5 time ranges?
✅ Do the bar charts render correctly with proper scales?
✅ Are streak badges showing when 2+ consecutive days same direction?
✅ Are favorite brokers persisting and loading correctly?
✅ Does spot-checking 10 brokers match MeroLagani source data?
✅ Are API response times < 500ms?
✅ Is daily cron scheduled to run at 3 PM?
✅ Can users see no difference between 1D, 3D, 1W, 1M, 3M views?

---

## 📞 Support Resources

| Issue | Reference |
|-------|-----------|
| ShareHubNepal data source | `SHAREHUB_SCRAPING_GUIDE.md` |
| Adapter implementation | `SHAREHUB_TODO_CHECKLIST.md` |
| Database setup | `nepse-pipeline/db/init_broker_tables.sql` |
| Data validation | `nepse-pipeline/scraper/broker_validator.py` |
| API endpoints | `src/app/api/broker-wise/[brokerCode]/route.ts` |
| UI components | `src/app/broker-analysis/page.tsx` |

---

## 🎉 What's Next

Once all tests pass and data is flowing correctly:

1. **Monitor** daily collection for 1 week
2. **Accumulate** 90 days of historical data
3. **Analyze** trends and patterns
4. **Plan** future features:
   - Broker comparison charts
   - Heatmaps of activity
   - Real-time WebSocket updates
   - ML predictions
   - Export to CSV/Excel

---

Good luck! You've got this! 🚀
