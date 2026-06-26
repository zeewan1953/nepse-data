# Build Prompt — NEPSE Pro Trading Dashboard ("DARI SIR")

Build a single-page market dashboard for the Nepal Stock Exchange (NEPSE), styled like a
professional trading terminal. Hand this prompt to a coder/AI verbatim.

## Stack
- Next.js (App Router) + React, TypeScript, `"use client"` page.
- Tailwind CSS. Support light + dark theme via a `useTheme()` hook (`{ dark, toggle }`)
  that toggles a `dark` class on `<html>` and persists to localStorage.
- No chart library required for the base layout (optional later).

## Overall layout (top to bottom, left to right)
A fixed left **icon sidebar rail** + a main column. The main column stacks:
1. Top bar  2. Scrolling ticker strip  3. Market-breadth row  4. Two-column body.

### 1. Left sidebar rail (~68px wide, hidden on mobile)
Vertical list of icon+label items, each a link. Active item highlighted (primary tint).
Items: Dashboard(📊, active), Market(📈), Watchlist(⭐), Portfolio(🏢), Orders(📋),
Screener(⚡), IPO(🔔), Settings(⚙️). Logout(🚪) pinned to the bottom.

### 2. Top bar (horizontal, border-bottom)
- Left: logo tile + brand "DARI SIR" / subtitle "NEPSE Pro".
- Then a divider, and inline stats: **NEPSE** index value (large, bold) with
  change + change% colored (green up / red down); **Total Turnover** (Rs. X Cr);
  **Total Volume** (integer, en-IN grouping). Hide turnover/volume on small screens.
- Right: search button (🔍), a market-status pill ("● CLOSED" / "● OPEN"),
  and a theme toggle (🌙/☀️). Render theme toggle only after mount (avoid hydration mismatch).

### 3. Ticker strip (~36px tall, horizontally scrollable, border-bottom)
Up to ~16 live stocks: `SYMBOL  LTP  +X.XX%` with the % colored. Hide scrollbar.

### 4. Market-breadth row (border-bottom, equal-width chips with dividers)
- 📈 Advanced (green, count)
- 📉 Declined (red, count)
- — Unchanged (blue, count)
- 🟢 Transactions (total transactions, integer)

### 5. Body — two columns (`lg:grid-cols-[minmax(360px,420px)_1fr]`)

**Left column — Top Movers tabbed panel** (rounded card, border):
- Tabs: TOP GAINERS / TOP LOSERS / TOP VOLUME. Active tab underlined green.
- Column header row: Symbol | LTP | Change | % Chg.
- Scrollable rows (max-height ~520px). Each row: symbol (bold) + optional category
  subtitle; LTP; absolute change (colored); % change (bold, colored). Row links to
  `/stock/{symbol}`. Empty state: "No data available".

**Right column** (stacked cards):
- **Index card**: date + time (NST) + session hours note; "NEPSE INDEX" + CLOSED pill;
  large index value colored by change; change ▲/▼ + %; "Updated …" line; a 4-up mini
  stat grid (Turnover, Volume, Transactions, Market Breadth "X up / Y dn / Z nc").
- **AI summary card** ("🧠 AI बजार सारांश"): an action badge (BUY/SELL/HOLD, colored),
  sentiment word, and "Distributing/Accumulating". Then a bulleted list of 5–6
  plain-language market points (Nepali). A recommendation line. A confidence bar
  (amber fill, % label "भरोसा X%").
- **Upcoming trading days card** ("🗓️ अर्का ५ कारोबार दिन"): 5 chips of the next 5
  trading days (skip Saturday — NEPSE's weekly holiday).

## Data sources (read-only fetches; never block render on them)
- `GET /api/movers` → `{ gainers, losers, volume, turnover }`, each
  `{ symbol, ltp, points, percentage, category? }`. Poll every 60s.
- `GET /api/nepse-summary` → `{ nepseIndex, change, changePct, upCount, downCount,
  flatCount, totalValue, totalVolume, totalTransactions, sentiment, recommendation,
  confidence, points: string[] }`. Poll every 60s. Drives the index card + AI summary.
  **The AI summary is rule-based (free, no API key)** — it derives trend, support/
  resistance, RSI/MACD, accumulation/distribution and writes Nepali bullet points.
- `GET /api/live` → `{ data: LiveMarketData[], count }` for the ticker. Poll every 30s.

## Formatting helpers
- `fmt(n, dp=2)` → en-IN grouped, fixed decimals.
- `cr(n)` → `Rs. {(n/1e7).toFixed(2)} Cr`.
- `int(n)` → rounded en-IN integer.
- `chgCls(n)` → green if >0, red if <0, gray if 0.

## Behavior / quality
- All external data is polled client-side; the page must render its full chrome
  immediately with "—" placeholders before data arrives (no full-page spinner).
- Colors: up = green-600, down = red-600, neutral = blue-500/gray-500. Amber for
  confidence. Use `tabular-nums` on all numbers.
- Fully responsive: sidebar + turnover/volume collapse on small screens; body becomes
  one column.
- Match the reference screenshot's spacing and typographic hierarchy.

## Optional enhancements (later)
- Real LLM-written summary (needs an API key) instead of rule-based.
- NEPSE intraday line chart in the index card.
- Click ticker item → stock page.
