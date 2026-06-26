"""
ShareHubNepal Broker Scraper
=============================

Adapter pattern: one common interface (`BrokerSource`), two implementations
(JSON API vs HTML fallback). This mirrors the floorsheet scraper pattern
(nepse_scraper.py) but for daily broker-level trading data instead of
per-trade data.

⚠️  SELECTOR & ENDPOINT DISCLAIMER
This was written without live access to sharehubnepal.com (sandboxed network).
The JSON API endpoint and CSS selectors below are TODO placeholders — they
were determined from common ShareHub patterns, but MUST be verified against
the live site before deployment.

Quick verification checklist:
  1. Open https://www.sharehubnepal.com/broker in Chrome
  2. Press F12 → Network tab → Reload page
  3. Look for XHR/Fetch requests containing broker data
  4. If JSON API found → fill in ShareHubNepalAPIAdapter TODOs
  5. If HTML table only → fill in ShareHubNepalHTMLAdapter TODOs
  6. See SHAREHUB_SCRAPING_GUIDE.md for detailed steps

Usage:
    python -m scraper.sharehub_broker_adapter --once
    python -m scraper.sharehub_broker_adapter --once --debug
    python -m scraper.sharehub_broker_adapter --date 2026-06-22
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout
from tenacity import retry, stop_after_attempt, wait_exponential

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sharehub_broker_adapter")

DEBUG_DIR = Path("debug_output")


@dataclass
class BrokerFlowRecord:
    """
    Canonical broker-level record shape — every adapter must normalize into this.

    This is BROKER-LEVEL data (market-wide per broker), not per-stock.
    Compare to FloorsheetRow (nepse_scraper.py) which is PER-TRADE granularity.
    """
    source: str                  # "sharehubnepal"
    trade_date: str              # YYYY-MM-DD
    broker_code: str             # e.g. "45"
    broker_name: Optional[str]   # e.g. "Example Securities Ltd."
    buy_qty: Optional[int]       # total buy quantity, market-wide for this broker
    sell_qty: Optional[int]      # total sell quantity
    net_qty: Optional[int]       # buy_qty - sell_qty, optional if not provided
    turnover: Optional[float]    # total buy amount (or should it be buy+sell? see note below)
    scraped_at: str              # ISO timestamp when we fetched this

    def to_dict(self) -> dict:
        return asdict(self)

    # NOTE on turnover: ShareHub calls this "amount" sometimes, actual definition
    # (total traded value, buy value, buy+sell value?) should be verified when
    # you see the actual JSON/HTML. Adjust field name here if needed.


class BrokerSource(ABC):
    """Common interface every broker scraping adapter implements."""

    @abstractmethod
    async def fetch(self, trade_date: date) -> list[BrokerFlowRecord]:
        """Fetch broker-level data for the given date."""


class ShareHubNepalAPIAdapter(BrokerSource):
    """
    Adapter for ShareHubNepal JSON API endpoint.

    Use this if DevTools Network tab shows an XHR/Fetch request returning
    JSON with broker data.

    TODO: Replace all values marked TODO below with actual values from
    DevTools Network inspection.
    """

    # TODO: Correct API endpoint — verify from DevTools Network tab
    # Example guesses (NOT verified):
    #   - https://www.sharehubnepal.com/api/broker/daily
    #   - https://www.sharehubnepal.com/api/broker/summary
    #   - https://www.sharehubnepal.com/api/market/brokers
    BASE_URL = os.getenv(
        "SHAREHUB_API_URL",
        "https://www.sharehubnepal.com/api/broker/daily"  # TODO: verify
    )

    # TODO: Confirm headers. Many Next.js-based sites require Referer
    # and User-Agent matching to prevent bot blocks. Check if any
    # Authorization header, X-API-Key, or cookies are needed by:
    #   1. Right-click XHR request in DevTools → Copy as cURL
    #   2. Paste into a text editor and look for headers
    DEFAULT_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        ),
        "Referer": "https://www.sharehubnepal.com/",  # TODO: adjust if different
        "Accept": "application/json",
        # TODO: uncomment if API requires auth:
        # "Authorization": f"Bearer {os.getenv('SHAREHUB_API_KEY')}",
    }

    def __init__(self, client: Optional[httpx.AsyncClient] = None, max_retries: int = 3):
        self._client = client or httpx.AsyncClient(
            timeout=20.0,
            headers=self.DEFAULT_HEADERS,
            follow_redirects=True
        )
        self.max_retries = max_retries

    async def fetch(self, trade_date: date) -> list[BrokerFlowRecord]:
        # TODO: confirm actual query parameter name/format
        # Common patterns:
        #   - ?date=2026-06-25
        #   - ?tradeDate=2026-06-25
        #   - ?from=2026-06-25&to=2026-06-25
        params = {"date": trade_date.isoformat()}

        raw = await self._fetch_raw(params)
        records = self.parse(raw, trade_date)
        log.info(f"ShareHubAPI: parsed {len(records)} broker records for {trade_date}")
        return records

    async def _fetch_raw(self, params: dict) -> str:
        """Fetch raw JSON from the API with retries."""
        last_exc: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = await self._client.get(self.BASE_URL, params=params)
                resp.raise_for_status()
                return resp.text
            except (httpx.HTTPStatusError, httpx.TransportError) as exc:
                last_exc = exc
                wait = (2 ** attempt) + random.uniform(0, 1)
                log.warning(
                    f"ShareHubAPI fetch attempt {attempt}/{self.max_retries} failed "
                    f"({exc}); retrying in {wait:.1f}s"
                )
                await asyncio.sleep(wait)
        raise RuntimeError(
            f"ShareHubAPI fetch failed after {self.max_retries} attempts"
        ) from last_exc

    def parse(self, raw: str, trade_date: date) -> list[BrokerFlowRecord]:
        """Parse JSON response into BrokerFlowRecord list."""
        data = json.loads(raw)

        # TODO: adjust to match actual JSON shape
        # Common patterns:
        #   - {"data": [...]}
        #   - {"result": {..., "brokers": [...]}}
        #   - {"success": true, "brokers": [...]}
        #   - Plain list [...] at top level
        # Once you see a real sample, update this:
        if isinstance(data, dict):
            rows = data.get("data") or data.get("brokers") or data.get("result", {}).get("brokers") or []
        elif isinstance(data, list):
            rows = data
        else:
            rows = []

        records: list[BrokerFlowRecord] = []
        now = datetime.utcnow().isoformat()
        for row in rows:
            # TODO: adjust field names to match actual JSON keys
            # Common field name patterns:
            #   - brokerCode, broker_code, brokerNo, code
            #   - brokerName, broker_name, name
            #   - buyQty, buy_qty, purchaseQty, qty_buy
            #   - sellQty, sell_qty, netQty, net_qty
            #   - turnover, amount, totalAmount
            # Once you see a sample, update mapping:
            broker_code = str(row.get("brokerCode") or row.get("broker_code") or "")
            if not broker_code:
                continue  # skip rows without broker code

            buy_qty = _safe_int(row.get("buyQty") or row.get("buy_qty"))
            sell_qty = _safe_int(row.get("sellQty") or row.get("sell_qty"))
            net_qty = None
            if buy_qty is not None and sell_qty is not None:
                net_qty = buy_qty - sell_qty

            records.append(
                BrokerFlowRecord(
                    source="sharehubnepal",
                    trade_date=trade_date.isoformat(),
                    broker_code=broker_code,
                    broker_name=row.get("brokerName") or row.get("broker_name"),
                    buy_qty=buy_qty,
                    sell_qty=sell_qty,
                    net_qty=net_qty,
                    turnover=_safe_float(row.get("turnover") or row.get("amount")),
                    scraped_at=now,
                )
            )
        return records

    async def aclose(self):
        await self._client.aclose()


class ShareHubNepalHTMLAdapter(BrokerSource):
    """
    Adapter for ShareHubNepal HTML table (fallback if no JSON API).

    Use this if:
      1. DevTools shows NO XHR/Fetch API calls returning JSON
      2. The data is embedded in HTML tables that you must scrape with
         CSS selectors
      3. (Or the site is behind Cloudflare/bot-protection — note: this
         may still fail; see NepseAlphaAdapter in nepse_scraper.py for
         workarounds, like stealth-plugin or paid anti-bot services)

    Structure mirrors NepseOfficialAdapter (nepse_scraper.py).
    """

    # TODO: Confirm real page URL — inspect the URL bar when viewing
    # ShareHub's broker page, or check if there's a /broker or /brokers path
    PAGE_URL = os.getenv(
        "SHAREHUB_BROKER_PAGE_URL",
        "https://www.sharehubnepal.com/broker"  # TODO: verify
    )

    # TODO: CSS selectors — right-click table in browser, Inspect,
    # get the class/id, then fill in:
    # Example table might be:
    #   <table class="broker-summary">
    #   <table class="table" id="brokerTable">
    #   <div class="broker-table"> (if not a <table>)
    ROW_SELECTOR = "table.broker-table tbody tr, table#broker-data tbody tr"  # TODO: verify

    # TODO: Column selectors — map each visible column to its td selector
    # Typical pattern: td:nth-child(N) where N=1,2,3...
    # Once you inspect the HTML, update this dict to match column order:
    COL_SELECTOR_MAP = {
        "broker_code": "td:nth-child(1)",      # TODO: verify
        "broker_name": "td:nth-child(2)",      # TODO: verify
        "buy_qty": "td:nth-child(3)",          # TODO: verify
        "sell_qty": "td:nth-child(4)",         # TODO: verify
        "turnover": "td:nth-child(5)",         # TODO: verify
    }

    # TODO: If table is paginated, find the "Next" button selector:
    # Common patterns:
    #   - button.pagination-next
    #   - a.next
    #   - li.pagination-next (ngx-pagination)
    #   - (none if single-page table)
    NEXT_PAGE_SELECTOR = "button.pagination-next:not([disabled]), a.next:not(.disabled)"  # TODO: verify

    # TODO: If there's a date picker or date-range control, note its selector:
    #   - input#trade-date
    #   - input.date-picker
    #   - select#date-range
    # Then uncomment the date-setting code in fetch_raw() below.
    DATE_INPUT_SELECTOR = None  # TODO: fill in if date picker exists

    async def fetch(self, trade_date: date) -> list[BrokerFlowRecord]:
        raw = await self._fetch_raw_html(trade_date)
        records = self.parse(raw, trade_date)
        log.info(f"ShareHubHTML: parsed {len(records)} broker records for {trade_date}")
        return records

    async def _fetch_raw_html(self, trade_date: date) -> str:
        """Scrape HTML from the ShareHub broker page with pagination."""
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Safari/537.36"
                )
            )
            page = await context.new_page()
            try:
                await page.goto(self.PAGE_URL, wait_until="networkidle")

                # TODO: uncomment and adjust if there's a date picker:
                # if self.DATE_INPUT_SELECTOR:
                #     try:
                #         await page.fill(self.DATE_INPUT_SELECTOR, trade_date.isoformat())
                #         await page.keyboard.press("Enter")
                #         await page.wait_for_timeout(1000)
                #     except PWTimeout:
                #         log.warning(f"Date selector '{self.DATE_INPUT_SELECTOR}' not found")

                await page.wait_for_selector(self.ROW_SELECTOR, timeout=20_000)

                all_html: list[str] = []
                page_num = 1
                while True:
                    html = await page.content()
                    all_html.append(html)

                    next_btn = await page.query_selector(self.NEXT_PAGE_SELECTOR)
                    if not next_btn:
                        break
                    # Check if disabled (some pagination uses CSS class, others HTML attr)
                    class_attr = await next_btn.get_attribute("class") or ""
                    if "disabled" in class_attr:
                        break

                    await next_btn.click()
                    await page.wait_for_timeout(_polite_delay_ms())
                    page_num += 1
                    if page_num > 500:
                        log.error("Pagination exceeded 500 pages — aborting, check selectors.")
                        break

                return "\n<!--PAGEBREAK-->\n".join(all_html)
            finally:
                await browser.close()

    def parse(self, raw: str, trade_date: date) -> list[BrokerFlowRecord]:
        """Parse HTML into BrokerFlowRecord list."""
        from bs4 import BeautifulSoup

        records: list[BrokerFlowRecord] = []
        now = datetime.utcnow().isoformat()

        for chunk in raw.split("<!--PAGEBREAK-->"):
            soup = BeautifulSoup(chunk, "html.parser")
            for row in soup.select(self.ROW_SELECTOR):
                cells = {}
                for key, sel in self.COL_SELECTOR_MAP.items():
                    el = row.select_one(sel)
                    cells[key] = _clean_text(el) if el else None

                broker_code = cells.get("broker_code") or ""
                if not broker_code:
                    continue

                buy_qty = _safe_int(cells.get("buy_qty"))
                sell_qty = _safe_int(cells.get("sell_qty"))
                net_qty = None
                if buy_qty is not None and sell_qty is not None:
                    net_qty = buy_qty - sell_qty

                records.append(
                    BrokerFlowRecord(
                        source="sharehubnepal",
                        trade_date=trade_date.isoformat(),
                        broker_code=broker_code,
                        broker_name=cells.get("broker_name"),
                        buy_qty=buy_qty,
                        sell_qty=sell_qty,
                        net_qty=net_qty,
                        turnover=_safe_float(cells.get("turnover")),
                        scraped_at=now,
                    )
                )
        return records


def get_adapter() -> BrokerSource:
    """Factory function to select adapter based on env var."""
    # Default to API adapter; fall back to HTML if API fails or is disabled
    source = os.getenv("BROKER_SCRAPE_SOURCE", "sharehub_api")
    if source == "sharehub_html":
        return ShareHubNepalHTMLAdapter()
    return ShareHubNepalAPIAdapter()


def _clean_text(el) -> Optional[str]:
    """Extract and normalize text from an HTML element."""
    if el is None:
        return None
    text = el.get_text(strip=True)
    # Remove commas from numbers
    text = text.replace(",", "")
    return text or None


def _safe_int(val: Optional[str]) -> Optional[int]:
    """Safely convert string to int."""
    if val is None or val == "":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _safe_float(val: Optional[str]) -> Optional[float]:
    """Safely convert string to float."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _polite_delay_ms() -> int:
    """Random delay between requests, respecting min/max env vars."""
    lo = int(os.getenv("MIN_DELAY_SECONDS", 2))
    hi = int(os.getenv("MAX_DELAY_SECONDS", 5))
    return random.randint(lo, hi) * 1000


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=20))
async def scrape_broker_data(trade_date: date, debug: bool = False) -> list[BrokerFlowRecord]:
    """Entry point: scrape broker data with retries and optional debug output."""
    adapter = get_adapter()
    try:
        records = await adapter.fetch(trade_date)
    except Exception:
        if debug:
            DEBUG_DIR.mkdir(exist_ok=True)
            log.error(f"Broker scrape failed for {trade_date}; saved debug artifacts to {DEBUG_DIR}/")
        raise
    finally:
        if isinstance(adapter, ShareHubNepalAPIAdapter):
            await adapter.aclose()
    return records


def main():
    parser = argparse.ArgumentParser(description="ShareHubNepal broker scraper")
    parser.add_argument("--once", action="store_true", help="run a single scrape and exit")
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD, defaults to today")
    parser.add_argument("--debug", action="store_true", help="enable debug output on failure")
    args = parser.parse_args()

    trade_date = (
        datetime.strptime(args.date, "%Y-%m-%d").date()
        if args.date
        else date.today()
    )

    records = asyncio.run(scrape_broker_data(trade_date, debug=args.debug))
    print(f"\nScraped {len(records)} broker records for {trade_date}")
    if records:
        print("Sample record:", records[0].to_dict())


if __name__ == "__main__":
    main()
