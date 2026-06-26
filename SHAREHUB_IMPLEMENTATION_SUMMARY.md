# ShareHubNepal Broker Scraper — Implementation Summary

## ✅ Completed
- **Adapter Template Created**: `nepse-pipeline/scraper/sharehub_broker_adapter.py`
  - Follows existing adapter pattern from `nepse_scraper.py`
  - Two implementations: `ShareHubNepalAPIAdapter` (JSON) + `ShareHubNepalHTMLAdapter` (HTML fallback)
  - All TODO markers clearly labeled
  - Syntax validated ✓

- **Documentation Created**:
  - `SHAREHUB_SCRAPING_GUIDE.md` — Step-by-step DevTools inspection guide
  - `SHAREHUB_NEXT_STEPS.md` — Integration checklist & troubleshooting
  - This summary

---

## 🎯 Verification Checklist (Your Turn)

**Before wiring into pipeline**, you must verify:

- [ ] Open https://www.sharehubnepal.com/broker (correct page URL?)
- [ ] DevTools F12 → Network tab → reload
- [ ] Identify: Is there a JSON API call, or HTML table only?
- [ ] If JSON API:
  - [ ] Get endpoint URL
  - [ ] Get query parameter names
  - [ ] Note any auth headers needed
  - [ ] Capture sample JSON response
- [ ] If HTML table:
  - [ ] Get table CSS selector
  - [ ] Get row selector
  - [ ] Inspect each column → get td selectors
  - [ ] Check if paginated
  - [ ] Check if date picker exists

**Then fill in TODO values in `sharehub_broker_adapter.py`**

---

## 📝 File Locations

| File | Purpose | Status |
|------|---------|--------|
| `nepse-pipeline/scraper/sharehub_broker_adapter.py` | Main adapter code | Ready (TODOs to fill) |
| `SHAREHUB_SCRAPING_GUIDE.md` | How to verify source structure | Reference |
| `SHAREHUB_NEXT_STEPS.md` | Integration steps & troubleshooting | Checklist |
| `.env` | Configuration (new vars to add) | Pending |

---

## 🏗️ Architecture

The adapter uses the **source-adapter pattern** (same as `nepse_scraper.py`):

```
BrokerSource (abstract)
├── ShareHubNepalAPIAdapter (recommended if JSON available)
│   ├── Uses httpx (lightweight, no browser)
│   ├── Retry logic with exponential backoff
│   └── parse() maps JSON keys → BrokerFlowRecord
│
└── ShareHubNepalHTMLAdapter (fallback if HTML-only)
    ├── Uses Playwright (browser automation)
    ├── Handles pagination
    └── parse() extracts from CSS selectors

get_adapter() factory function selects based on BROKER_SCRAPE_SOURCE env var
```

**Data Class**: `BrokerFlowRecord`
- source: "sharehubnepal"
- trade_date, broker_code, broker_name
- buy_qty, sell_qty, net_qty, turnover
- scraped_at (timestamp)
- Converts to dict for DB insertion

---

## 🚀 Integration Points

### 1. Scheduler (Daily Cron)
```python
# Example: nepse-pipeline/api/scheduler.py or similar
import asyncio
from scraper.sharehub_broker_adapter import scrape_broker_data

async def daily_broker_collection():
    records = await scrape_broker_data(date.today())
    # Insert into merolagani_broker_daily table or similar
    for record in records:
        db.upsert(record.to_dict())
```

### 2. Environment Variables
```bash
# .env
BROKER_SCRAPE_SOURCE=sharehub_api      # or sharehub_html
SHAREHUB_API_URL=https://...           # (if API)
SHAREHUB_BROKER_PAGE_URL=https://...   # (if HTML)
MIN_DELAY_SECONDS=2
MAX_DELAY_SECONDS=5
```

### 3. Database Schema
Adapter expects a table like:
```sql
CREATE TABLE merolagani_broker_daily (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50),        -- "sharehubnepal"
  trade_date DATE,
  broker_code VARCHAR(10),
  broker_name VARCHAR(255),
  buy_qty INT,
  sell_qty INT,
  net_qty INT,
  turnover FLOAT,
  scraped_at TIMESTAMP,
  UNIQUE(source, trade_date, broker_code)
);
```

---

## 💾 Testing

Once TODOs are filled:

```bash
cd nepse-pipeline

# Single run (today)
python -m scraper.sharehub_broker_adapter --once

# Specific date
python -m scraper.sharehub_broker_adapter --once --date 2026-06-23

# Debug mode (saves HTML/errors)
python -m scraper.sharehub_broker_adapter --once --debug

# Check output
ls debug_output/
```

---

## 🤝 Handoff

1. **You verify** the ShareHubNepal source structure (DevTools inspection)
2. **You fill in** TODO values in the adapter
3. **You test** locally with `--once` and `--debug`
4. **You integrate** into your scheduler/pipeline
5. **Done!** Daily broker data collection starts

If you hit issues:
- Run with `--debug` to see HTML/errors
- Share the actual JSON/HTML response
- We adjust selectors/parsing immediately

---

## 📚 Reference Docs

- `nepse_scraper.py` — Existing adapter pattern (floorsheet)
- `SHAREHUB_SCRAPING_GUIDE.md` — DevTools inspection steps
- `SHAREHUB_NEXT_STEPS.md` — Integration checklist

Good luck! 🚀
