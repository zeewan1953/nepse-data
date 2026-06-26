# ShareHubNepal Scraper Implementation — Next Steps

## 📋 What's Done
✅ Created adapter template: `nepse-pipeline/scraper/sharehub_broker_adapter.py`  
✅ Created verification guide: `SHAREHUB_SCRAPING_GUIDE.md`  
✅ Two implementation strategies included (JSON API + HTML fallback)  
✅ Follows same adapter pattern as existing `nepse_scraper.py`  

---

## 🔍 What You Need To Do (5–15 minutes)

### Step 1: Verify the Data Source
1. Go to https://www.sharehubnepal.com/broker (or correct URL)
2. Open DevTools (`F12`) → **Network** tab
3. Reload the page (`Ctrl+R`)
4. Look for XHR/Fetch requests that return JSON or HTML table with broker data
5. Reference: See `SHAREHUB_SCRAPING_GUIDE.md` for detailed inspection steps

### Step 2: Fill in TODO Values
Once you've identified the API endpoint or HTML structure, edit `sharehub_broker_adapter.py`:

#### If JSON API Found:
- [ ] Update `ShareHubNepalAPIAdapter.BASE_URL` (the actual endpoint)
- [ ] Update `DEFAULT_HEADERS` (add auth headers if needed)
- [ ] Update `parse()` method → adjust field mapping (brokerCode → actual JSON key, etc.)
- [ ] Update query param name if not `date` (could be `tradeDate`, `from/to`, etc.)

#### If HTML Table Only:
- [ ] Update `ShareHubNepalHTMLAdapter.PAGE_URL`
- [ ] Update `ROW_SELECTOR` (table class/id, tbody tr)
- [ ] Update `COL_SELECTOR_MAP` (td selectors for each column)
- [ ] Update `NEXT_PAGE_SELECTOR` (if paginated) or leave as `None`
- [ ] Update `DATE_INPUT_SELECTOR` (if date picker exists) or leave as `None`

### Step 3: Test Locally
```bash
# Navigate to the scraper directory
cd nepse-pipeline

# Test a single run (today's data)
python -m scraper.sharehub_broker_adapter --once

# Test with a specific date
python -m scraper.sharehub_broker_adapter --once --date 2026-06-23

# If it fails, run with debug to see HTML/selectors
python -m scraper.sharehub_broker_adapter --once --debug
# → Check debug_output/ for saved HTML and errors
```

### Step 4: Register in Pipeline
Create or update the scheduler that calls this adapter:

```python
# In your scheduler/cron handler (e.g., nepse-pipeline/api/scheduler.py)
from scraper.sharehub_broker_adapter import scrape_broker_data

async def collect_broker_data(trade_date):
    records = await scrape_broker_data(trade_date)
    # Insert into DB (merolagani_broker_daily or similar table)
    for record in records:
        # db.insert(record.to_dict())
        pass
```

### Step 5: Environment Setup
Add to `.env`:

```bash
# Choose which adapter to use
BROKER_SCRAPE_SOURCE=sharehub_api      # or sharehub_html if no JSON API
SHAREHUB_API_URL=https://...           # if API; fill in actual URL
SHAREHUB_BROKER_PAGE_URL=https://...   # if HTML; fill in actual page URL

# Optional auth (if API requires it)
SHAREHUB_API_KEY=your_api_key_here     # uncomment in adapter if needed

# Polite scraping delays (in seconds)
MIN_DELAY_SECONDS=2
MAX_DELAY_SECONDS=5
```

---

## 🚨 Potential Issues & Solutions

### Issue: "Cloudflare protected" / Bot blocking
**Solution:** ShareHubNepal may use Cloudflare like NepseAlpha. If Playwright is blocked:
- [ ] Try the [Playwright stealth plugin](https://github.com/playwright-extra/stable/tree/main/packages/plugin-stealth)
- [ ] Or switch to a paid anti-bot bypass service
- (Reference: See `NepseAlphaAdapter` commented notes in `nepse_scraper.py`)

### Issue: "Login required"
**Solution:** If the page requires authentication:
- [ ] Add login step in `_fetch_raw_html()` before navigating to the data
- [ ] Or capture a session cookie after manual login and include in headers

### Issue: "Page always shows today's data only"
**Solution:** Like the official NEPSE floorsheet, some pages have no historical data picker:
- [ ] You'll need to scrape every 15–30 min during market hours to capture all trades
- [ ] Your database becomes the historical archive (same as current floorsheet approach)

### Issue: Data structure doesn't match expectations
**Solution:** 
- [ ] Share the actual JSON response or HTML snippet
- [ ] We can adjust the parsing logic

---

## 📊 Data Flow

Once integrated, the data will flow:
```
ShareHubNepal website
        ↓ (daily scraper)
sharehub_broker_adapter.py
        ↓ (parsed BrokerFlowRecord list)
Your Postgres DB (merolagani_broker_daily table)
        ↓ (read by)
/api/broker-wise endpoint
        ↓ (rendered by)
Broker Analysis dashboard
```

---

## 📞 Questions?

If you get stuck:
1. Run with `--debug` flag to save HTML/errors
2. Check `debug_output/` directory
3. Share the actual JSON response or HTML snippet
4. We can adjust selectors/parsing immediately

Good luck! 🚀
