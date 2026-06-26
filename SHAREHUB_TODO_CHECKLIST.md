# ShareHubNepal Adapter — TODO Checklist

## 📍 All TODO Locations in `nepse-pipeline/scraper/sharehub_broker_adapter.py`

### ✅ For JSON API Path (if DevTools shows XHR/Fetch with JSON)

**Line 102–109: API Endpoint**
- [ ] Line 109: Update `BASE_URL` from placeholder to actual endpoint
  ```python
  BASE_URL = "https://www.sharehubnepal.com/api/broker/daily"  # TODO: verify
  ```
  **Examples to look for:**
  - `/api/broker/daily`
  - `/api/broker/summary`
  - `/api/market/brokers`

**Line 112–125: Headers**
- [ ] Line 123: Update `Referer` if different from `https://www.sharehubnepal.com/`
- [ ] Line 125–127: Uncomment and fill if API requires Authorization header
  ```python
  # "Authorization": f"Bearer {os.getenv('SHAREHUB_API_KEY')}",
  ```

**Line 138–141: Query Parameters**
- [ ] Check if param name is `date` or something else (`tradeDate`, `from`, etc.)
  ```python
  params = {"date": trade_date.isoformat()}  # TODO: confirm param name
  ```

**Line 174–189: JSON Response Shape**
- [ ] Line 174: Update the condition that extracts the array from JSON
  ```python
  # Common patterns:
  rows = data.get("data")  # or
  rows = data.get("brokers")  # or
  rows = data.get("result", {}).get("brokers")  # or plain list
  ```

**Line 191–220: Field Mapping**
- [ ] Line 197–205: Update field names to match actual JSON keys
  ```python
  broker_code = str(row.get("brokerCode") or row.get("broker_code") or "")
  buy_qty = _safe_int(row.get("buyQty") or row.get("buy_qty"))
  sell_qty = _safe_int(row.get("sellQty") or row.get("sell_qty"))
  turnover = _safe_float(row.get("turnover") or row.get("amount"))
  ```
  **Look for JSON keys like:**
  - brokerCode, broker_code, brokerNo
  - brokerName, broker_name, name
  - buyQty, buy_qty, purchaseQty
  - sellQty, sell_qty, netQty
  - turnover, amount, totalAmount

---

### ✅ For HTML Table Path (if NO JSON API found, HTML-only)

**Line 243–247: Page URL**
- [ ] Line 247: Update URL to actual broker page
  ```python
  PAGE_URL = "https://www.sharehubnepal.com/broker"  # TODO: verify
  ```

**Line 250–256: Table Selector**
- [ ] Line 256: Update `ROW_SELECTOR` to match actual table/rows
  ```python
  # Example: look for <table class="broker-table"> or <table id="broker-data">
  ROW_SELECTOR = "table.broker-table tbody tr, table#broker-data tbody tr"  # TODO: verify
  ```

**Line 258–266: Column Selectors**
- [ ] Lines 262–266: Map each column to its `td:nth-child(N)` or class-based selector
  ```python
  COL_SELECTOR_MAP = {
      "broker_code": "td:nth-child(1)",      # TODO: verify (Broker Code column)
      "broker_name": "td:nth-child(2)",      # TODO: verify (Broker Name column)
      "buy_qty": "td:nth-child(3)",          # TODO: verify (Buy Qty/Amount column)
      "sell_qty": "td:nth-child(4)",         # TODO: verify (Sell Qty/Amount column)
      "turnover": "td:nth-child(5)",         # TODO: verify (Turnover/Total column)
  }
  ```
  **Inspect each column header and count:**
  1. First column = `td:nth-child(1)`, etc.

**Line 269–275: Pagination**
- [ ] Line 275: Update `NEXT_PAGE_SELECTOR` if table is paginated
  ```python
  NEXT_PAGE_SELECTOR = "button.pagination-next:not([disabled]), a.next:not(.disabled)"  # TODO: verify
  ```
  **Or set to `None` if single-page table**

**Line 277–282: Date Picker**
- [ ] Line 282: Fill in if there's a date input/filter
  ```python
  DATE_INPUT_SELECTOR = "input#trade-date"  # TODO: fill in if date picker exists
  ```
  **Or leave as `None` if page always shows today**
  
- [ ] Line 305–310: Uncomment date-setting code if selector is filled in

---

## 🎯 Quick Decision Tree

**DevTools shows JSON API?**
- ✅ YES → Fill in `ShareHubNepalAPIAdapter` TODOs (lines 102–220)
- ❌ NO → Fill in `ShareHubNepalHTMLAdapter` TODOs (lines 243–282)

---

## 📋 Sample Checklist

**Before You Start:**
- [ ] Read `SHAREHUB_SCRAPING_GUIDE.md` for detailed DevTools steps

**API Path:**
- [ ] Found JSON endpoint? → Note URL, headers, params, field names
- [ ] Fill in TODOs on lines: 109, 123, 138, 174, 197–205

**HTML Path:**
- [ ] Found HTML table? → Inspect selectors and column order
- [ ] Fill in TODOs on lines: 247, 256, 262–266, 275, 282

**After Filling:**
- [ ] Run `python -m scraper.sharehub_broker_adapter --once --debug`
- [ ] Check `debug_output/` if it fails
- [ ] Share output if stuck

---

## 🧪 Testing Commands

```bash
cd nepse-pipeline

# Quick test
python -m scraper.sharehub_broker_adapter --once

# With debug (saves HTML/errors)
python -m scraper.sharehub_broker_adapter --once --debug

# Specific date
python -m scraper.sharehub_broker_adapter --once --date 2026-06-23
```

---

## ❓ Examples of Common Values

**API Endpoint Examples:**
```
https://www.sharehubnepal.com/api/broker/daily?date=2026-06-25
https://www.sharehubnepal.com/api/market/brokers
https://www.sharehubnepal.com/broker/data
```

**HTML Selectors Examples:**
```
ROW_SELECTOR: "table.broker-summary tbody tr"
COL_SELECTOR_MAP:
  - broker_code: "td:nth-child(1)"
  - broker_name: "td.broker-name" (class-based)
  - buy_qty: "td[data-column='buy']" (data-attr based)
```

---

Good luck! 🚀 Share the actual JSON/HTML if you get stuck.
