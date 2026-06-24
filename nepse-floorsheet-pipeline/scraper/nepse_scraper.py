"""
NEPSE Floorsheet Scraper
========================

Adapter pattern: one common interface (`FloorsheetSource`), two
implementations. Swap `SCRAPE_SOURCE` in .env to switch without touching
the rest of the pipeline. Default source is `nepse_official`
(nepalstock.com.np/floor-sheet) — selectors VERIFIED against the live site.
NepseAlpha is kept as a secondary adapter but is currently blocked by
Cloudflare bot-protection.

This scrapes the rendered HTML table directly — it does NOT call NEPSE's
internal API (which requires a token). So "API block but I need the data"
is exactly the case this solves: no auth, just reads what's on the page.

Usage:
    python -m scraper.nepse_scraper --once
        # one manual run, prints row count + a sample row

    python -m scraper.nepse_scraper --once --export-csv floorsheet_today.csv
        # same, but also dumps EVERY scraped row to a CSV file —
        # no Postgres/FastAPI setup needed, just the raw data, immediately

    python -m scraper.nepse_scraper --once --debug
        # non-headless browser + saves screenshot/HTML on failure to ./debug_output/

    python -m scraper.nepse_scraper --date 2026-06-22
        # NOTE: NepseOfficialAdapter only has TODAY's data (no date picker
        # on the live site) — a non-today date will raise unless you're
        # using a source/adapter that supports historical lookup.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout
from tenacity import retry, stop_after_attempt, wait_exponential

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("nepse_scraper")

DEBUG_DIR = Path("debug_output")


@dataclass
class FloorsheetRow:
    """Canonical row shape — every adapter must normalize into this."""
    trade_date: str          # YYYY-MM-DD
    symbol: str               # e.g. "NABIL"
    buyer_broker: str         # broker code, e.g. "45"
    seller_broker: str        # broker code, e.g. "12"
    quantity: int
    rate: float                # price per share
    amount: float              # quantity * rate
    contract_no: Optional[str] = None
    trade_time: Optional[str] = None  # HH:MM:SS if the source exposes it

    def to_dict(self) -> dict:
        return asdict(self)


class FloorsheetSource(ABC):
    """Common interface every scraping adapter implements."""

    @abstractmethod
    async def fetch(self, page: Page, trade_date: date) -> list[FloorsheetRow]:
        ...


class NepseAlphaAdapter(FloorsheetSource):
    """
    Adapter for nepsealpha.com/trading/floorsheet

    ⚠️  CONFIRMED BLOCKED (live test, 2026-06-23): nepsealpha.com sits
    behind Cloudflare bot-protection, which blocks Playwright/Selenium
    automated browsers outright. This adapter is kept for reference/in
    case that changes (e.g. with stealth-plugin tricks or a paid
    anti-bot bypass service), but NepseOfficialAdapter below is the one
    actually in use — see SCRAPE_SOURCE in .env.

    The site paginates floorsheet data and (last verified by the page
    structure typical of these dashboards) loads it client-side, so we
    wait for the table to render rather than reading raw HTML directly.
    """

    BASE_URL = os.getenv("NEPSEALPHA_FLOORSHEET_URL", "https://nepsealpha.com/trading/floorsheet")

    async def fetch(self, page: Page, trade_date: date) -> list[FloorsheetRow]:
        rows: list[FloorsheetRow] = []

        await page.goto(self.BASE_URL, wait_until="networkidle")

        # VERIFIED against live site (2026-06-23): <input type="text"
        # class="form-control date-picker" id="trade-date">
        date_input_selector = "input#trade-date"
        try:
            await page.fill(date_input_selector, trade_date.strftime("%Y-%m-%d"))
            await page.keyboard.press("Enter")
        except PWTimeout:
            log.warning("Date input not found with placeholder selector — "
                        "site may default to 'today'. Update date_input_selector.")

        # TODO: VERIFY SELECTOR — main floorsheet table body
        table_row_selector = "table#floorsheet-table tbody tr, table.floorsheet tbody tr"
        await page.wait_for_selector(table_row_selector, timeout=20_000)

        page_num = 1
        while True:
            row_elements = await page.query_selector_all(table_row_selector)
            if not row_elements:
                break

            for el in row_elements:
                cells = await el.query_selector_all("td")
                if len(cells) < 6:
                    continue
                texts = [(await c.inner_text()).strip() for c in cells]

                # TODO: VERIFY COLUMN ORDER — adjust indices to match the
                # real table header order. Typical NEPSE floorsheet columns:
                # [S.No, Contract No, Symbol, Buyer, Seller, Quantity, Rate, Amount]
                try:
                    rows.append(FloorsheetRow(
                        trade_date=trade_date.isoformat(),
                        contract_no=texts[1],
                        symbol=texts[2],
                        buyer_broker=texts[3],
                        seller_broker=texts[4],
                        quantity=int(texts[5].replace(",", "")),
                        rate=float(texts[6].replace(",", "")),
                        amount=float(texts[7].replace(",", "")),
                    ))
                except (ValueError, IndexError) as e:
                    log.debug(f"Skipping unparseable row: {texts} ({e})")

            # TODO: VERIFY SELECTOR — "next page" control, if paginated
            next_btn = await page.query_selector("button.next-page:not([disabled]), a.pagination-next:not(.disabled)")
            if not next_btn:
                break
            await next_btn.click()
            await page.wait_for_timeout(_polite_delay_ms())
            page_num += 1
            if page_num > 500:  # safety valve against infinite pagination loops
                log.error("Pagination exceeded 500 pages — aborting, check selectors.")
                break

        log.info(f"NepseAlpha: scraped {len(rows)} rows for {trade_date}")
        return rows


class NepseOfficialAdapter(FloorsheetSource):
    """
    Adapter for nepalstock.com.np/floor-sheet — VERIFIED against the live
    site (selectors confirmed by direct inspection, not guessed).

    IMPORTANT LIMITATION, confirmed live: this page has NO date picker —
    it only ever shows TODAY's floorsheet. There is no way to ask it for
    2026-06-20's data on 2026-06-23; once the day ends, that page's data is
    gone from the source's view (a separate historical-data endpoint may
    exist but wasn't found). This means:

      - `trade_date` passed into `fetch()` is NOT used to filter the
        source — it's only used to LABEL whatever rows come back (which
        will always be "today" while the market is open).
      - This adapter will raise if asked for a non-today date, since
        silently returning today's data for a different requested date
        would corrupt your historical records.
      - Practical consequence: your own Postgres database IS the only
        historical archive. The scheduler (api/scheduler.py) running
        every 15 min during market hours isn't just "nice to have" with
        this source — it's the ONLY way you ever get a full day's data,
        because trades accumulate on this page through the day and you
        must keep re-scraping + upserting until market close to capture
        all of them. If the scheduler misses a chunk of the day, that
        data is permanently gone (no replay).

    Verified selectors (live, 2026-06-23):
      - row:            table.table tbody tr
      - pagination next: ul.ngx-pagination li.pagination-next
      - items-per-page:  select  (options: 10, 20, 50, 200, 300, 500)
      - columns: [SN, Contract No, Symbol, Buyer, Seller, Quantity, Rate, Amount]
    """

    BASE_URL = os.getenv("NEPSE_OFFICIAL_BASE_URL", "https://www.nepalstock.com.np")
    ROW_SELECTOR = "table.table tbody tr"
    NEXT_PAGE_SELECTOR = "ul.ngx-pagination li.pagination-next"
    PAGE_SIZE_SELECTOR = "select"
    MAX_PAGE_SIZE = "500"  # largest option available — minimizes pagination round-trips

    async def fetch(self, page: Page, trade_date: date) -> list[FloorsheetRow]:
        if trade_date != date.today():
            raise ValueError(
                f"NepseOfficialAdapter only exposes TODAY's floorsheet "
                f"(no date picker on the live page). Requested {trade_date}, "
                f"today is {date.today()}. This date must already be in "
                f"Postgres from when it WAS today, or it's unavailable."
            )

        rows: list[FloorsheetRow] = []

        await page.goto(f"{self.BASE_URL}/floor-sheet", wait_until="networkidle")

        # bump items-per-page to the max so we paginate as few times as possible
        try:
            await page.select_option(self.PAGE_SIZE_SELECTOR, self.MAX_PAGE_SIZE)
            await page.wait_for_timeout(_polite_delay_ms())
        except PWTimeout:
            log.warning("Could not set page size to 500 — falling back to default page size, "
                       "will just paginate more times.")

        await page.wait_for_selector(self.ROW_SELECTOR, timeout=20_000)

        page_num = 1
        while True:
            row_elements = await page.query_selector_all(self.ROW_SELECTOR)
            if not row_elements:
                break

            for el in row_elements:
                cells = await el.query_selector_all("td")
                if len(cells) < 8:
                    continue
                texts = [(await c.inner_text()).strip() for c in cells]

                # verified column order: [SN, Contract No, Symbol, Buyer,
                # Seller, Quantity, Rate, Amount]
                try:
                    rows.append(FloorsheetRow(
                        trade_date=trade_date.isoformat(),
                        contract_no=texts[1],
                        symbol=texts[2],
                        buyer_broker=texts[3],
                        seller_broker=texts[4],
                        quantity=int(texts[5].replace(",", "")),
                        rate=float(texts[6].replace(",", "")),
                        amount=float(texts[7].replace(",", "")),
                    ))
                except (ValueError, IndexError) as e:
                    log.debug(f"Skipping unparseable row: {texts} ({e})")

            next_btn = await page.query_selector(self.NEXT_PAGE_SELECTOR)
            if not next_btn:
                break
            # ngx-pagination disables the Next li via a CSS class, not an
            # HTML disabled attribute — check the class list to know when to stop
            class_attr = await next_btn.get_attribute("class") or ""
            if "disabled" in class_attr:
                break
            await next_btn.click()
            await page.wait_for_timeout(_polite_delay_ms())
            page_num += 1
            if page_num > 500:  # safety valve against infinite pagination loops
                log.error("Pagination exceeded 500 pages — aborting, check selectors.")
                break

        log.info(f"NepseOfficial: scraped {len(rows)} rows for {trade_date} ({page_num} pages)")
        return rows


def get_adapter() -> FloorsheetSource:
    # default changed to nepse_official — NepseAlpha is Cloudflare-protected
    # and blocks automated browsers, confirmed against the live site
    source = os.getenv("SCRAPE_SOURCE", "nepse_official")
    if source == "nepsealpha":
        return NepseAlphaAdapter()
    return NepseOfficialAdapter()


def _polite_delay_ms() -> int:
    lo = int(os.getenv("MIN_DELAY_SECONDS", 2))
    hi = int(os.getenv("MAX_DELAY_SECONDS", 5))
    return random.randint(lo, hi) * 1000


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=20))
async def scrape_floorsheet(trade_date: date, debug: bool = False) -> list[FloorsheetRow]:
    adapter = get_adapter()
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=not debug)
        context = await browser.new_context(user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ))
        page = await context.new_page()
        try:
            rows = await adapter.fetch(page, trade_date)
        except Exception:
            if debug:
                DEBUG_DIR.mkdir(exist_ok=True)
                await page.screenshot(path=str(DEBUG_DIR / f"failure_{trade_date}.png"))
                html = await page.content()
                (DEBUG_DIR / f"failure_{trade_date}.html").write_text(html)
                log.error(f"Saved debug artifacts to {DEBUG_DIR}/ — inspect and fix selectors.")
            raise
        finally:
            await browser.close()
        return rows


def main():
    parser = argparse.ArgumentParser(description="NEPSE floorsheet scraper")
    parser.add_argument("--once", action="store_true", help="run a single scrape and exit")
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD, defaults to today")
    parser.add_argument("--debug", action="store_true", help="save screenshot+HTML on failure, run non-headless")
    parser.add_argument("--export-csv", type=str, default=None,
                         help="dump ALL scraped rows straight to this CSV path — "
                              "no Postgres/FastAPI needed, just the raw data, now")
    args = parser.parse_args()

    trade_date = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()

    rows = asyncio.run(scrape_floorsheet(trade_date, debug=args.debug))
    print(f"\nScraped {len(rows)} rows for {trade_date}")
    if rows:
        print("Sample row:", rows[0].to_dict())

    if args.export_csv:
        import csv
        out_path = Path(args.export_csv)
        with out_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].to_dict().keys()) if rows else [])
            writer.writeheader()
            for r in rows:
                writer.writerow(r.to_dict())
        print(f"Wrote {len(rows)} rows to {out_path.resolve()}")


if __name__ == "__main__":
    main()
