# ShareHubNepal Broker Data Scraping Guide

## Context
ShareHubNepal (https://www.sharehubnepal.com) provides broker-level trading data that we want to collect daily. However, the sandbox environment **cannot directly access sharehubnepal.com**, so we've prepared a template adapter with TODO markers. You must manually verify the actual API/HTML structure first.

---

## Step 1: Open ShareHubNepal in Your Browser

1. Go to https://www.sharehubnepal.com/broker (or the broker-analysis page if the URL differs)
2. You should see a table or dashboard with broker data (buy amount, sell amount, net flow, etc.)

---

## Step 2: Open DevTools & Inspect Network Traffic

**Windows/Linux:** Press `F12`  
**Mac:** Press `Cmd + Option + I`

In DevTools:
1. Click the **Network** tab
2. Make sure the filter icon shows **All** (or toggle the XHR/Fetch filter to see API calls)
3. **Reload the page** (`Ctrl+R` / `Cmd+R`)

---

## Step 3: Look for JSON API Calls

Watch for network requests that might contain broker data:
- Look for requests named like: `broker`, `daily`, `analysis`, `summary`, etc.
- Filter by **XHR** (XMLHttpRequest) and **Fetch** to see only API calls
- Look for responses that are **JSON** (not HTML)

### Common patterns to look for:
```
GET /api/broker/daily
GET /api/broker/summary  
GET /broker/data
POST /api/analyse
```

---

## Step 4A: If You Find a JSON API

If you see a JSON response, note:

1. **Full URL**: Copy from the Address bar in Network tab
   - Example: `https://www.sharehubnepal.com/api/broker/daily?date=2026-06-25`

2. **Headers Required?** Right-click the request → **Copy as cURL** → paste it in a text editor
   - Check if there are special headers like `Authorization`, `X-API-Key`, cookies
   - Share these with us

3. **Response Structure**: Click the request → **Response** tab → copy a few sample rows
   ```json
   {
     "data": [
       {
         "brokerCode": "45",
         "brokerName": "Example Securities",
         "buyAmount": 1500000,
         "sellAmount": 1200000,
         ...
       }
     ]
   }
   ```

**→ If this is the case**, update these in `sharehub_broker_adapter.py`:
- `ShareHubNepalAPIAdapter.BASE_URL`
- `ShareHubNepalAPIAdapter.DEFAULT_HEADERS` (if auth needed)
- `ShareHubNepalAPIAdapter.parse()` → the field mapping

---

## Step 4B: If No JSON API (HTML-only)

If you only see HTML responses:

1. **Find the Broker Table**: Right-click the broker table → **Inspect** (or press `Ctrl+Shift+C` and click the table)
2. **Get the Table Selector**:
   ```html
   <table class="broker-table">  <!-- or class="table" or id="broker-summary" -->
     <tbody>
       <tr>
         <td>45</td>                    <!-- Broker Code -->
         <td>Example Securities</td>    <!-- Broker Name -->
         <td>1,500,000</td>            <!-- Buy Amount -->
         <td>1,200,000</td>            <!-- Sell Amount -->
         ...
       </tr>
     </tbody>
   </table>
   ```

3. **Copy the relevant selectors**:
   - Table selector: e.g., `table.broker-table` or `table#broker-summary`
   - Row selector: e.g., `tbody tr`
   - Column positions (or classes/ids for each column)

**→ If this is the case**, update these in `sharehub_broker_adapter.py`:
- `ShareHubNepalHTMLAdapter.PAGE_URL`
- `ShareHubNepalHTMLAdapter.ROW_SELECTOR`
- `ShareHubNepalHTMLAdapter.COL_SELECTOR_MAP` (map each column to its selector)
- `ShareHubNepalHTMLAdapter.NEXT_PAGE_SELECTOR` (if paginated)

---

## Step 5: Check robots.txt

Before deploying, verify:
```bash
curl https://www.sharehubnepal.com/robots.txt
```

Respect any `Disallow:` rules. If `/api/*` is disallowed, you'll need permission from ShareHubNepal.

---

## Step 6: Verify Date Handling

- **Can you set a date picker?** If yes, note the selector and parameter name
- **Does it always show today?** Like the official NEPSE floorsheet, some pages only show the current day

Update `ShareHubNepalHTMLAdapter.fetch_raw()` or the API params accordingly.

---

## Step 7: Share Findings

Once you've verified the structure, provide:

### For JSON API:
```markdown
**Endpoint:** https://www.sharehubnepal.com/api/broker/daily
**Method:** GET
**Query Params:** date (YYYY-MM-DD format)
**Sample Response:**
{
  "data": [
    {
      "brokerCode": "45",
      "brokerName": "Example Securities Ltd.",
      "buyQty": 150000,
      "sellQty": 120000,
      "netQty": 30000,
      "turnover": 1500000
    }
  ]
}
**Headers Required:** (if auth needed, list here)
```

### For HTML Table:
```markdown
**Page URL:** https://www.sharehubnepal.com/broker
**Table Selector:** table.broker-table
**Row Selector:** tbody tr
**Columns (left to right):**
1. Broker Code → td:nth-child(1)
2. Broker Name → td:nth-child(2)
3. Buy Amount → td:nth-child(3)
4. Sell Amount → td:nth-child(4)
5. Net → td:nth-child(5)
6. Turnover → td:nth-child(6)
```

---

## Step 8: Wiring Into the Pipeline

Once verified, you (or Claude) will:

1. Fill in the TODO values in `sharehub_broker_adapter.py`
2. Register it in the adapter factory (similar to `get_adapter()` in `nepse_scraper.py`)
3. Add a `BROKER_SCRAPE_SOURCE` env var (`.env`) to select which adapter to use
4. Wire it into your data pipeline (daily cron, same as floorsheet)

---

## Questions?

- If the page is Cloudflare-protected (like NepseAlpha), let us know — we may need extra tools
- If data requires authentication (login), we'll need credentials or a session approach
- If the structure is unclear, just share screenshots + the page URL
