# Daily Data Collection & Auto-Refresh Setup ✅

**Purpose**: Collect fresh broker data every day at 3 PM and auto-refresh UI every 30 minutes  
**Status**: Ready to Deploy

---

## 🎯 What You Get

### Daily Data Collection (3 PM)
```
✅ Automatic collection every day at 3 PM Nepal time
✅ Fetches from multiple sources:
   - MeroLagani API
   - NepalStock API
   - NEPSE Alpha API
   - ShareHubNepal API
✅ Deduplicates & stores best source data
✅ Keeps 1 year of historical data
```

### UI Auto-Refresh (30 Minutes)
```
✅ Frontend auto-refreshes every 30 minutes
✅ New data loads smoothly
✅ No bar-by-bar loading (all data at once)
✅ Professional chart display
```

### Historical Backfill (1 Year)
```
✅ One-time 365-day data collection
✅ Fills gaps in database
✅ Enables trend analysis
✅ Loads quickly (no slow progressive loading)
```

---

## 📋 Setup Steps

### Step 1: Install Python Dependencies

```bash
cd nepse-pipeline
pip install -r requirements.txt
pip install requests schedule pytz
```

### Step 2: Option A - GitHub Actions (Automatic)

**Setup GitHub Actions Workflow:**

1. The workflow file is already created at:
   ```
   .github/workflows/daily-broker-data.yml
   ```

2. Push to GitHub:
   ```bash
   git add .github/workflows/
   git commit -m "feat: add daily broker data collection workflow"
   git push
   ```

3. Actions will run automatically at 3 PM Nepal time every weekday

### Step 2: Option B - Local Scheduler (Manual Server)

Run scheduler on your server:

```bash
cd nepse-pipeline

# Start background scheduler (runs continuously)
python -m scraper.daily_data_collector --schedule

# Or use system cron
crontab -e

# Add this line:
30 9 * * 1-5 cd /path/to/nepse-pipeline && python -m scraper.daily_data_collector --date $(date +\%Y-\%m-\%d)
```

### Step 3: One-Time Historical Backfill

Backfill last 365 days of data:

```bash
cd nepse-pipeline

# Backfill 365 days (takes ~30-45 minutes)
python -m scraper.daily_data_collector --backfill 365

# Monitor progress in logs
tail -f data_collector.log
```

### Step 4: Enable Auto-Refresh in Frontend

The UI will automatically:
- ✅ Refresh every 30 minutes
- ✅ Load fresh data from `/api/broker-performance`
- ✅ Display professionally with no lag
- ✅ Show latest statistics

---

## 🔧 How It Works

### Daily Collection Flow

```
3 PM Nepal Time (UTC 9:30 AM)
    ↓
GitHub Actions triggers
    ↓
Fetches from 4 sources in parallel
    ↓
Deduplicates by source reliability
    ↓
Stores in database
    ↓
Frontend auto-refreshes (30 min cycle)
    ↓
Users see fresh data
```

### Data Source Priority

```
1. NepalStock (Official) ← Most reliable
2. NEPSE Alpha (Premium)
3. MeroLagani (Free)
4. ShareHubNepal (Community) ← Fallback
```

### Auto-Refresh Cycle

```
User opens app
    ↓
Initial data loads (from database)
    ↓
Every 30 minutes:
  - Fetch fresh data
  - Update charts smoothly
  - No full-page reload
  - Show loading indicator
    ↓
Repeats until user closes app
```

---

## 📊 Commands Reference

### Collect Today's Data
```bash
python -m scraper.daily_data_collector
```

### Collect Specific Date
```bash
python -m scraper.daily_data_collector --date 2026-06-26
```

### Backfill Historical Data
```bash
# 365 days (1 year)
python -m scraper.daily_data_collector --backfill 365

# 90 days (3 months)
python -m scraper.daily_data_collector --backfill 90

# 30 days (1 month)
python -m scraper.daily_data_collector --backfill 30
```

### Start Background Scheduler
```bash
python -m scraper.daily_data_collector --schedule
```

### View Logs
```bash
tail -f data_collector.log
tail -100 data_collector.log
```

---

## 🎯 Features

### Professional Bar Chart
```
✅ Loads all data at once (no streaming)
✅ SVG-based rendering (crisp & fast)
✅ 10 stocks displayed with buy/sell bars
✅ Green = Buy, Red = Sell
✅ Sort by: Buy Amount, Sell Amount, Net Flow
✅ Hover shows stock details
✅ Responsive on all devices
```

### Smart Auto-Refresh
```
✅ 30-minute refresh cycle
✅ Runs only during trading hours
✅ Smooth transitions (no jarring reloads)
✅ Progress indicator
✅ Error recovery
```

### Complete Historical Data
```
✅ 365 days stored in database
✅ Enables trend analysis
✅ All time ranges: 1D, 3D, 1W, 1M, 3M
✅ No data loss between updates
```

---

## 🚀 Usage Examples

### Scenario 1: Fresh Daily Data

```
Workflow:
1. At 3 PM Nepal time, GitHub Actions triggers
2. Collects data from all sources
3. Stores in database
4. User opens app anytime after 3 PM
5. Sees fresh data from today
6. Every 30 min, UI auto-refreshes
```

### Scenario 2: Historical Analysis

```
Workflow:
1. Run backfill for 365 days
   python -m scraper.daily_data_collector --backfill 365
2. Wait ~30-45 minutes
3. User can now view:
   - 1D, 3D, 1W, 1M, 3M ranges
   - Trends over time
   - Broker performance changes
   - Complete history
```

### Scenario 3: Manual Daily Collection

```
Workflow:
1. You run daily collection manually:
   python -m scraper.daily_data_collector --date 2026-06-26
2. Data stored immediately
3. Refreshing app shows new data
```

---

## ⚙️ Configuration

### GitHub Actions Schedule

Currently set to run at:
- **Time**: 3 PM Nepal time (09:30 UTC)
- **Days**: Monday-Friday (weekdays only)
- **Frequency**: Daily

To change, edit `.github/workflows/daily-broker-data.yml`:

```yaml
on:
  schedule:
    # Change cron as needed
    - cron: '30 9 * * 1-5'
```

Cron format: `minute hour day month day-of-week`

### Frontend Auto-Refresh

Currently set to 30 minutes. To change, edit API endpoint:

```typescript
const interval = setInterval(fetchData, 30 * 60 * 1000);  // 30 minutes
```

---

## 📊 Data Storage

### Database Tables

```
merolagani_broker_daily
├─ date (YYYY-MM-DD)
├─ brokerId
├─ brokerName
├─ purchase (buy amount)
├─ sell (sell amount)
├─ source (data source)
└─ created_at (timestamp)

broker_daily_agg (aggregated)
├─ tradeDate
├─ brokerId
├─ buyAmt
├─ sellAmt
├─ ... other metrics
└─ created_at
```

### Data Retention

- ✅ Keep 1 year minimum (365 days)
- ✅ Update daily
- ✅ No data loss on updates
- ✅ Automatic cleanup of old records (optional)

---

## 🔍 Monitoring

### Check Last Collection

```bash
# View recent logs
tail -20 data_collector.log

# Check database last update
sqlite3 nepse.db "SELECT MAX(date) FROM merolagani_broker_daily;"

# Check record count
sqlite3 nepse.db "SELECT COUNT(*) FROM merolagani_broker_daily;"
```

### Set Up Alerts

Create a simple health check:

```bash
# Check if data is fresh (within 24 hours)
LAST_UPDATE=$(sqlite3 nepse.db "SELECT MAX(date) FROM merolagani_broker_daily;")
TODAY=$(date +%Y-%m-%d)

if [ "$LAST_UPDATE" = "$TODAY" ]; then
  echo "✓ Data is fresh"
else
  echo "✗ Data is stale - last update: $LAST_UPDATE"
fi
```

---

## ✅ Deployment Checklist

- [ ] Install Python dependencies
  ```bash
  pip install requests schedule pytz
  ```

- [ ] Test data collection manually
  ```bash
  python -m scraper.daily_data_collector --date 2026-06-26
  ```

- [ ] Verify data stored in database
  ```bash
  sqlite3 nepse.db "SELECT COUNT(*) FROM merolagani_broker_daily WHERE date = '2026-06-26';"
  ```

- [ ] Run 1-year historical backfill
  ```bash
  python -m scraper.daily_data_collector --backfill 365
  ```

- [ ] Push GitHub Actions workflow
  ```bash
  git add .github/workflows/
  git commit -m "feat: add daily data collection"
  git push
  ```

- [ ] Verify workflow shows in GitHub Actions
  - Go to: github.com/yourusername/repo/actions
  - Look for: "Daily Broker Data Collection"

- [ ] Test auto-refresh in frontend
  - Open: http://localhost:3000/broker-analysis
  - Wait 30 minutes
  - Verify data updates automatically

- [ ] Set up monitoring/alerts (optional)

---

## 🐛 Troubleshooting

### Issue: Data not collecting

```bash
# Check if script runs
python -m scraper.daily_data_collector --date $(date +%Y-%m-%d)

# Check logs
tail -f data_collector.log

# Common issues:
# - Missing dependencies: pip install requests schedule pytz
# - Database connection: Check DATABASE_URL env var
# - Network: Check API endpoints are accessible
```

### Issue: UI not refreshing

```
Check:
1. Browser console for errors (F12)
2. Network tab - is /api/broker-performance being called?
3. Is backend running? (localhost:3000 accessible)
4. Database has fresh data? (run manual collection)
```

### Issue: GitHub Actions not running

```
Check:
1. Workflow file exists at .github/workflows/daily-broker-data.yml
2. Pushed to GitHub (not local only)
3. Repository Actions tab shows it
4. Check workflow run history for errors
```

---

## 📞 Support

### Manual Commands

```bash
# Test collection
python -m scraper.daily_data_collector --date 2026-06-26

# View logs
tail -50 data_collector.log

# Check database
sqlite3 nepse.db "SELECT * FROM merolagani_broker_daily LIMIT 5;"

# Backfill
python -m scraper.daily_data_collector --backfill 30
```

### Check System

```bash
# Python version
python --version

# Required packages
pip list | grep -E "requests|schedule|pytz"

# Database
ls -lah nepse.db

# Logs
ls -lah data_collector.log
```

---

## 🎉 Summary

You now have:

✅ **Daily 3 PM Data Collection**
- Automatic GitHub Actions workflow
- Multi-source data aggregation
- Database storage

✅ **30-Minute Auto-Refresh**
- Smooth UI updates
- No full-page reloads
- Professional charts

✅ **1-Year Historical Data**
- Complete trend analysis
- All time ranges supported
- One-time backfill command

✅ **Professional Bar Charts**
- All data loads at once
- No streaming or lag
- Beautiful SVG rendering

---

**Status**: 🟢 **READY TO DEPLOY**

```bash
# Quick start:
cd nepse-pipeline
pip install requests schedule pytz
python -m scraper.daily_data_collector --backfill 365
# Then push GitHub Actions workflow
git add .github/workflows/daily-broker-data.yml
git push
```

Done! Data will now collect automatically at 3 PM daily. 📊✨
