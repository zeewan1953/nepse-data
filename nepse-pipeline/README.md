# NEPSE Floorsheet Pipeline — Full Plan

This is a working starter for your diagram:

```
NepseAlpha Floorsheet → Selenium/Playwright Bot → Data Cleaner & Validator
        → PostgreSQL → FastAPI → Web App / Android App
```

It's built to plug directly into your existing React broker-flow dashboard
(CMF, MFI, Volume Z-score, tick-rule classification, smart-money score) —
replacing the sample-data layer with real, validated, auto-refreshing data.

> **Status update (verified against the live site):** Selectors are no
> longer placeholders — they were confirmed by direct inspection of
> `nepalstock.com.np/floor-sheet`. Two important findings changed the plan:
>
> 1. **NepseAlpha is Cloudflare-protected** and blocks automated browsers
>    outright. `SCRAPE_SOURCE` now defaults to `nepse_official` instead.
> 2. **NEPSE official has no date picker — it only shows TODAY's
>    floorsheet.** There's no way to ask it for a past date. This means
>    **your Postgres database is the only historical archive that will
>    ever exist** — the scheduler running every 15 min during market
>    hours isn't optional polish, it's the *only* way any given day's
>    data gets captured before it disappears from the source. If the
>    scheduler is down for a stretch during market hours, that slice of
>    that day's trades is gone for good (no replay). Plan your uptime
>    accordingly — e.g. run the scheduler on a server that stays on
>    during 11:00–15:00 NPT, not just your laptop.

---

## 1. Which source should you scrape?

You named **NepseAlpha**. One thing worth knowing before you commit to it:

| Source | Pros | Cons |
|---|---|---|
| **NepseAlpha** (nepsealpha.com) | Already has cleaned floorsheet UI, broker filters, nice pagination | It's a *third-party* site — it itself pulls from NEPSE/TMS. Scraping it means depending on **their** HTML + ToS, and you inherit any delay/errors they have. |
| **NEPSE official** (nepalstock.com.np) | Source of truth, no middle-man, official numbers | Their UI loads data via internal JSON endpoints (not officially public/documented), which can change without notice and sometimes requires session cookies. |

**Recommendation:** build the scraper with an **adapter pattern** (done below) —
one common interface, two adapters (`NepseAlphaAdapter`, `NepseOfficialAdapter`).
Start with NepseAlpha since that's what you asked for; if you ever hit
rate-limits or ToS friction, swap the adapter without touching the rest of
the pipeline. **Always check the target site's `robots.txt` and Terms of
Service before scraping at scale**, and keep request rates polite (the
scheduler below defaults to a 15-minute interval during market hours, not
constant hammering).

---

## 2. Architecture (refined from your diagram)

```
┌─────────────────────┐
│  Scheduler (APScheduler)  — runs every 15 min, 11:00–15:00 NPT (market hours)
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│ Playwright Scraper   │  scraper/nepse_scraper.py
│ (Source Adapter)     │  — NepseAlphaAdapter / NepseOfficialAdapter
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│ Change Detector      │  pipeline/change_detector.py
│ (hash diff per day)  │  — skips DB write if nothing changed
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│ Rule-based Validator │  pipeline/cleaner.py
│ (fast, deterministic)│  — types, ranges, broker codes, duplicates
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│ AI Validator (opt-in)│  pipeline/ai_validator.py
│ Claude API            │  — only runs on rows the rule-validator FLAGS
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│ PostgreSQL            │  db/models.py + db/schema.sql
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│ FastAPI                │  api/main.py
│  /floorsheet           │  — serves from DB (cache-first)
│  /search (on-demand)   │  — triggers a scrape if data isn't cached yet
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│ React Web App + Android (same REST API) │
└─────────────────────┘
```

### Why a 2-stage validator (rule-based + AI)?
- Rule-based catches 95% of garbage instantly and for free: nulls, wrong
  types, negative prices/quantities, broker codes not in NEPSE's official
  broker list, duplicate trade IDs, date gaps.
- The **AI step only runs on the rows the rule-validator flags as
  suspicious** (e.g. a price 10x the day's average, a broker code that's
  valid but never traded this script before). This keeps API cost tiny —
  you're not running every row through an LLM, just the edge cases — and it
  gives you a human-readable explanation of *why* a row looks wrong, plus a
  suggested correction you can accept/reject.

### "Site data changes → auto-update the app" (your requirement)
Handled by the **Change Detector**: each scrape computes a hash of that
day's floorsheet. If the hash differs from what's stored (NEPSE sometimes
revises a day's floorsheet after correction), only then does it re-validate
and upsert. The FastAPI layer exposes a `last_updated` timestamp per script;
your React dashboard polls (or you upgrade to Server-Sent Events later — see
`docs/frontend_integration.md`) so the UI reflects new data without a manual
refresh.

### "Data I search once, store it" (your requirement)
Handled by `/search` cache-aside logic in `api/main.py`: if a requested
script/date/broker isn't in Postgres yet, the API triggers an on-demand
scrape for *just that slice*, validates it, stores it, and returns it. Next
time anyone asks for the same slice, it's served straight from the DB — no
re-scrape.

---

## 3. What's in this folder

```
nepse-floorsheet-pipeline/
├── README.md                      ← you are here
├── requirements.txt
├── .env.example
├── scraper/
│   └── nepse_scraper.py           Playwright scraper, adapter pattern
├── pipeline/
│   ├── cleaner.py                 rule-based validator
│   ├── ai_validator.py            optional Claude-API anomaly reviewer
│   └── change_detector.py         hash-based diffing
├── db/
│   ├── models.py                  SQLAlchemy models
│   └── schema.sql                 raw SQL if you'd rather not use an ORM
├── api/
│   ├── main.py                    FastAPI app (routes)
│   └── scheduler.py               APScheduler periodic job
└── docs/
    ├── frontend_integration.md    how your React dashboard wires in
    └── selector_research_notes.md what to inspect on the real site
```

## 4. Setup (run this on YOUR machine, not in this sandbox)

```bash
cd nepse-floorsheet-pipeline
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
playwright install chromium

cp .env.example .env       # fill in DB creds + (optional) ANTHROPIC_API_KEY

# 1. create the DB tables
python -m db.models

# 2. run one manual scrape to test + fix selectors
python -m scraper.nepse_scraper --once

# 3. start the API (also boots the background scheduler)
uvicorn api.main:app --reload --port 8000
```

Then point your React dashboard's `API_BASE_URL` at `http://localhost:8000`
(see `docs/frontend_integration.md`).
