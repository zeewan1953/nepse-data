# Spec: Broker-wise Buy/Sell/Holding Accuracy Module (NEPSE)

**Project:** NEPSE Broker-Flow Analysis Dashboard
**Module:** Post-close broker buy/sell/holding finalization + presentation
**Audience:** Backend + frontend implementer (human or AI coding agent). Read this fully before writing code — it assumes the existing pipeline already described below.

---

## 0. Existing system this builds on top of

Do not rebuild these — they already exist:

- **Scraper**: Playwright, source-adapter pattern. `NepseOfficialAdapter` targets `nepalstock.com.np` (the only working source — `NepseAlpha` is Cloudflare-blocked). Verified selectors: `table.table tbody tr` for floorsheet rows, `ul.ngx-pagination li.pagination-next` for pagination. Column order: `SN / Contract No / Symbol / Buyer / Seller / Quantity / Rate / Amount`.
- **Validation**: `cleaner.py` (rule-based) + `ai_validator.py` (Claude API, only for flagged rows). Hash-based change detector avoids redundant writes.
- **DB**: PostgreSQL + SQLAlchemy. `floorsheet_trades` is the single historical archive — NEPSE's site only ever shows *today's* floorsheet, so anything not captured and stored same-day is lost permanently.
- **API**: FastAPI, cache-first, on-demand scrape fallback, APScheduler job running 11:00–15:00 NPT (market hours).
- **Frontend analytics**: `broker_flow_analytics.js` (pure functions: CMF, MFI, volume z-score, broker net flow, tick-rule order flow, momentum/smart-money scoring) + sample fixtures + integration notes.
- **UI convention**: dark trading-terminal look, Space Grotesk + IBM Plex Mono, tick-rule-derived numbers always labeled "(est.)", missing data shown as "—" / "insufficient history" — never silently zero.

---

## 1. Problem this spec solves

Two different things currently risk getting conflated:

1. **Intraday order-flow signals** (CMF, MFI, tick-rule buy/sell classification) — these are *statistical estimates* from market depth, because NEPSE's live feed does not expose which broker is on which side of a trade in real time.
2. **Broker-wise buy/sell quantity** — this is **not** an estimate. It is a *fact* sitting in the official floorsheet (`Buyer` and `Seller` columns, already scraped). The only reason it can be wrong is if the floorsheet was scraped before NEPSE finished publishing/correcting it for the day.

This spec is only about (2): making broker buy/sell/holding numbers **exact**, sourced once and only once from the **finalized** end-of-day floorsheet, and never mixed with the tick-rule estimates from (1).

---

## 2. Data source — clarify up front

NEPSE (nepalstock.com.np) has **no published, free, public REST API** for external developers. There is no API key signup, no documentation, no SLA. The site's own frontend calls internal endpoints that are not meant for third-party use and can change without notice — which is exactly why this project scrapes the rendered floorsheet table via Playwright instead of hitting undocumented internal endpoints directly. Do not present "free NEPSE API" as a thing that exists; the scraper *is* the API, and it must stay resilient to markup changes (already handled by the adapter pattern).

If a free public option is needed later for cross-checking, the only practical fallback is volunteer-maintained NEPSE data mirrors (e.g. some open-source GitHub repos re-publish daily floorsheet dumps) — but these are unofficial, lag by a day, and should never be the primary source. Treat them as optional secondary validation only, never as a source of truth.

---

## 3. Core requirement: accurate broker buy/sell/holding

### 3.1 What "accurate" means here

For a given `(symbol, trade_date)`:

- `total_buy_qty` (sum across all brokers) **must equal** `total_sell_qty` (sum across all brokers) **must equal** the symbol's official total traded quantity for that day. If they don't match, the floorsheet capture was incomplete (pagination missed pages, or scrape ran before all contracts settled) — flag it, don't serve it.
- Every contract row has exactly one buyer broker and one seller broker. Holding/net-flow per broker for the day is:
  ```
  net_qty(broker, symbol, date) = buy_qty(broker, symbol, date) - sell_qty(broker, symbol, date)
  ```
- This must be computed from the **complete, finalized** floorsheet — not from a partial scrape mid-session, and not inferred from market depth.

### 3.2 Why "update only 3–5pm NPT" matters

NEPSE trades Sunday–Thursday, ~11:00–15:00 NPT. The floorsheet is provisional while the market is open (late corrections, busted-trade reversals, settlement adjustments can still land right after close). Pulling broker buy/sell numbers mid-session and presenting them as final is how you get numbers that quietly change later and erode user trust.

**Decision: add a dedicated post-close finalization job, separate from the existing 11:00–15:00 intraday scheduler.**

- **Window**: 15:00–17:00 NPT, market days only (skip Fri/Sat and NEPSE holiday calendar — reuse/extend whatever holiday list the project already has, or hardcode the published annual list).
- **Behavior**: poll every 15–30 minutes inside that window. After each scrape, compare the new floorsheet hash (reuse the existing hash-based change detector) against the previous one.
  - If hash changed → not yet stable, store as `status='provisional'`, keep polling.
  - If hash unchanged for two consecutive polls → mark `status='finalized'`, stop polling for that date, run the broker aggregation (3.1) and persist it.
- If 17:00 NPT arrives and it never stabilized, mark `status='finalized_with_warning'` and surface that in the UI rather than silently presenting it as clean.
- The **existing intraday scheduler (11:00–15:00) is untouched** — it keeps powering live tick-rule estimates and market depth. This new job only feeds the broker buy/sell/holding table, and that table should only ever show data with `status IN ('finalized', 'finalized_with_warning')`. Never serve `provisional` rows to the broker-flow endpoints.

---

## 4. Database schema addition

New table, additive — doesn't touch `floorsheet_trades` or `MarketDepthSnapshot`.

```sql
CREATE TABLE broker_daily_summary (
    id              SERIAL PRIMARY KEY,
    trade_date      DATE NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    broker_code     VARCHAR(10) NOT NULL,
    buy_qty         BIGINT NOT NULL DEFAULT 0,
    sell_qty        BIGINT NOT NULL DEFAULT 0,
    net_qty         BIGINT NOT NULL,              -- buy_qty - sell_qty
    buy_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
    sell_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
    buy_contracts   INT NOT NULL DEFAULT 0,
    sell_contracts  INT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'provisional',
        -- 'provisional' | 'finalized' | 'finalized_with_warning'
    finalized_at    TIMESTAMP,
    UNIQUE (trade_date, symbol, broker_code)
);

CREATE INDEX idx_broker_summary_symbol_date ON broker_daily_summary (symbol, trade_date);
CREATE INDEX idx_broker_summary_broker_date ON broker_daily_summary (broker_code, trade_date);
```

`net_qty` is the per-day "holding change" for that broker in that symbol — running holding over time is just a cumulative sum of `net_qty` ordered by `trade_date`, computed at query time (don't store a running total — it gets out of sync if a day is reprocessed).

---

## 5. API endpoints to add

- `GET /broker-flow/{symbol}/{date}` → all brokers' buy/sell/net/amount for that symbol+date, `status` field included, sorted by `net_qty` desc.
- `GET /broker/{broker_code}/{date}` → all symbols that broker traded that date.
- `GET /broker/{broker_code}/holding/{symbol}?from=&to=` → cumulative net position over a date range (sum of `net_qty`), for "what does this broker currently hold" style views. Be explicit in the response that this is a *change in position over the queried range from floorsheet activity*, not a verified custodian/CDS holding balance — NEPSE's public floorsheet cannot tell you a broker's true total holding from before the data history began, only the net buy/sell since tracking started. Label this clearly in the API response (`"note": "Net flow since <earliest_tracked_date>, not total custodial holding"`) and surface that same caveat in the UI — don't let it imply more certainty than the data supports.
- All three return `"status": "finalized" | "finalized_with_warning"` per date so the frontend can show the right badge. Never silently return provisional data — if asked for a date that hasn't finalized yet, return `202`-style "not yet finalized" rather than partial numbers.

---

## 6. Frontend requirements

Two new pieces, consistent with the existing dark trading-terminal aesthetic (Space Grotesk headers / IBM Plex Mono numbers, dark charcoal-blue surface, gold accent for highlights):

1. **Broker flow table** (per symbol+date): columns = Broker | Buy Qty | Sell Qty | Net Qty | Buy Amt | Sell Amt. Net Qty colored (buyers vs sellers — pick one consistent semantic pair, e.g. green/red, and keep it consistent with however `broker_flow_analytics.js` already colors buy vs sell elsewhere in the app). A status badge for the date ("Finalized · official floorsheet" vs "Finalized · late settlement" for the warning case) — never an "(est.)" tag here, that tag is reserved for the tick-rule intraday numbers elsewhere in the app. Mixing the two visual languages is exactly the bug this spec exists to prevent.
2. **Top brokers bar chart**: horizontal diverging bar, one bar per broker, length = `net_qty`, sorted descending, top N (8–10) shown with a "show all" expansion.

---

## 7. Validation / acceptance criteria

- [ ] For any finalized `(symbol, date)`: `SUM(buy_qty) == SUM(sell_qty) == total_traded_quantity` for that symbol/date (cross-check against the existing `floorsheet_trades` aggregate). Reject finalization if this fails.
- [ ] Provisional data is never exposed through `/broker-flow/*` endpoints.
- [ ] Re-running the finalization job for an already-finalized date is idempotent (upsert on the unique constraint, doesn't double-count).
- [ ] Non-trading days (Fri/Sat, holidays) don't trigger the job and don't produce empty/zero rows that could be misread as "no one traded."
- [ ] UI never shows a broker buy/sell number without its `status` badge visible nearby.

## 8. Explicit non-goals

- This module does **not** attempt to reconstruct historical broker holdings from before the scraper started running — NEPSE's site only exposes the current day, so anything before day 1 of this project's data collection is unrecoverable. Don't build features that imply otherwise.
- This module does **not** replace or modify the existing intraday tick-rule order-flow estimates — both systems coexist, clearly labeled, serving different purposes (live signal vs. end-of-day fact).
