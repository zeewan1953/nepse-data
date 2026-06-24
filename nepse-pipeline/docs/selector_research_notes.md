# Selector Research Checklist (do this once, ~10-15 min)

Since I can't reach nepsealpha.com from this sandbox, here's exactly what
to check when you run the scraper on your own machine.

## Step 1 — Run in debug mode
```bash
python -m scraper.nepse_scraper --once --debug
```
This launches a **visible** (non-headless) browser so you can watch it
load, and on any failure it saves a screenshot + full HTML to
`debug_output/`.

## Step 2 — Open the real site in your browser, inspect these 4 things

1. **Date picker** — right-click → Inspect on the date filter. Is it:
   - a plain `<input type="text">` or `<input type="date">`?
   - a React date-picker component (often has a different click sequence —
     you may need `page.click()` to open a calendar widget, then click a
     specific day, instead of `page.fill()`)
   → Update `date_input_selector` in `NepseAlphaAdapter.fetch()`.

2. **Table structure** — Inspect the floorsheet table. Note:
   - the table/tbody's actual `id` or `class`
   - the exact column order in the header row (`<thead>`)
   → Update `table_row_selector` and the column-index mapping in the
     `try:` block (`texts[1]`, `texts[2]`, etc.)

3. **Pagination** — scroll to the bottom of the table. Is there:
   - numbered page buttons?
   - a "Next" button/arrow?
   - infinite scroll (no button at all — different approach needed,
     would require scrolling + waiting for new rows to load)?
   → Update `next_btn` selector, or if it's infinite scroll, replace that
     block with a scroll-and-wait loop (ping me if you hit this case and
     want that variant written).

4. **Network tab** (optional, more robust) — Open dev tools → Network →
   filter by "Fetch/XHR" → reload the page with a date selected. If the
   floorsheet loads via a clean JSON API call (many of these dashboards do),
   it's often far more reliable to intercept that response directly (like
   `NepseOfficialAdapter` already does) than to scrape rendered HTML table
   rows. If you find such an endpoint, tell me the URL pattern and response
   shape and I'll rewrite `NepseAlphaAdapter` to use it instead.

## Step 3 — Known broker code list
`pipeline/cleaner.py` currently treats any 1-3 digit numeric string as a
"plausible" broker code. For real validation (catching a broker code that's
numerically valid-looking but doesn't actually exist), get NEPSE's current
official broker list and hardcode it as a set in `cleaner.py` — happy to
wire that in once you have the list.
