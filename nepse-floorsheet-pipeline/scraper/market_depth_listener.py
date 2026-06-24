"""
Market Depth Listener (WebSocket-based, long-running)
=========================================================

Different model from the floorsheet scraper on purpose. Floorsheet is
"poll every 15 min, scrape the table, upsert" — that works because trade
records are static once written. Market Depth (live bid/ask order book)
is NOT static — it's pushed continuously over WebSocket while the market
is open, so polling it doesn't make sense; instead, this opens ONE
browser session at market open, keeps a persistent listener attached the
whole time, and writes a debounced snapshot to Postgres every
DEPTH_WRITE_INTERVAL_SECONDS (NOT on every single WS frame — depth can
update many times per second across all symbols, and writing every frame
would flood the database for no real benefit).

⚠️  VERIFY BEFORE RELYING ON THIS — same situation as the floorsheet
scraper originally was: I haven't been able to inspect nepalstock.com.np's
actual Market Depth page (sandboxed network, see README). What's below is
a reasonable, runnable WebSocket-interception skeleton, but you'll need to
confirm 3 things on the real site — see
docs/market_depth_research_notes.md for the exact inspection steps:

  1. Does the Market Depth page open a WebSocket connection at all?
     (some sites poll a REST endpoint every few seconds instead — if so,
     this needs to be a polling adapter, not a WS listener; tell me and
     I'll rewrite it)
  2. The WS URL pattern and a sample pushed message (JSON shape).
  3. Whether depth comes per-symbol (you must "subscribe" to each symbol)
     or broadcast for the whole market at once.

Run standalone (separate process from the FastAPI app and the floorsheet
scheduler — this should run continuously during market hours):

    python -m scraper.market_depth_listener --duration-minutes 240
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("market_depth_listener")

MARKET_DEPTH_URL = os.getenv("NEPSE_MARKET_DEPTH_URL", "https://www.nepalstock.com.np/market-depth")
WRITE_INTERVAL_SECONDS = int(os.getenv("DEPTH_WRITE_INTERVAL_SECONDS", 5))

# in-memory latest-snapshot-per-symbol cache; flushed to DB every
# WRITE_INTERVAL_SECONDS. This is the debounce — it's fine for many WS
# frames to overwrite this dict between flushes, only the latest survives.
_latest_snapshots: dict[str, dict] = {}


def _parse_depth_message(raw_text: str) -> dict | None:
    """
    TODO: VERIFY against a real captured message. This currently assumes
    something roughly like:
      {"symbol": "NABIL",
       "bids": [{"price": 850, "qty": 100}, ...],
       "asks": [{"price": 852, "qty": 50}, ...]}

    Real NEPSE-ecosystem WS messages often use different field names —
    common alternatives to try if this returns None for everything:
      symbol   → "scrip", "securityId", "stockSymbol"
      bids     → "buyOrders", "bidOrders", "buy"
      asks     → "sellOrders", "askOrders", "sell"
      price    → "rate", "orderPrice"
      qty      → "quantity", "orderQuantity"

    Once you've captured one real message (see research notes doc),
    paste it back to me and I'll fix this function precisely instead of
    guessing further.
    """
    try:
        data = json.loads(raw_text)
    except (json.JSONDecodeError, TypeError):
        return None

    symbol = data.get("symbol") or data.get("scrip") or data.get("securityId")
    bids = data.get("bids") or data.get("buyOrders") or data.get("bidOrders") or []
    asks = data.get("asks") or data.get("sellOrders") or data.get("askOrders") or []
    if not symbol:
        return None

    def _normalize_levels(levels):
        out = []
        for lvl in levels:
            try:
                price = float(lvl.get("price", lvl.get("rate", 0)))
                qty = int(lvl.get("qty", lvl.get("quantity", 0)))
                out.append({"price": price, "qty": qty})
            except (TypeError, ValueError):
                continue
        return out

    return {
        "symbol": symbol,
        "bids": _normalize_levels(bids),
        "asks": _normalize_levels(asks),
        "raw_payload": data,
    }


async def _flush_loop():
    """Every WRITE_INTERVAL_SECONDS, persist whatever's currently cached
    in-memory to Postgres, then clear nothing (next frames just overwrite
    the cache again) — this is intentionally a snapshot-of-the-moment
    write, not an attempt to capture every single update."""
    from sqlalchemy.orm import Session
    from db.models import MarketDepthSnapshot, get_engine

    engine = get_engine()
    while True:
        await asyncio.sleep(WRITE_INTERVAL_SECONDS)
        if not _latest_snapshots:
            continue
        batch = dict(_latest_snapshots)
        try:
            with Session(engine) as session:
                now = datetime.utcnow()
                for symbol, snap in batch.items():
                    session.add(MarketDepthSnapshot(
                        symbol=symbol,
                        captured_at=now,
                        bids=snap["bids"],
                        asks=snap["asks"],
                        raw_payload=snap.get("raw_payload"),
                    ))
                session.commit()
            log.info(f"Flushed depth snapshots for {len(batch)} symbols to DB")
        except Exception as e:
            log.error(f"Failed to flush depth snapshots: {e}")


async def listen(duration_minutes: int):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        def on_websocket(ws):
            log.info(f"WebSocket opened: {ws.url}")

            def on_frame_received(payload):
                text = payload
                if isinstance(payload, bytes):
                    try:
                        text = payload.decode("utf-8")
                    except UnicodeDecodeError:
                        return
                parsed = _parse_depth_message(text)
                if parsed:
                    _latest_snapshots[parsed["symbol"]] = parsed
                else:
                    log.debug(f"Unparsed WS frame (first 200 chars): {text[:200]}")

            ws.on("framereceived", on_frame_received)

        page.on("websocket", on_websocket)

        await page.goto(MARKET_DEPTH_URL, wait_until="networkidle")
        log.info(f"Listening for market depth WebSocket frames for {duration_minutes} min "
                 f"(writing snapshots every {WRITE_INTERVAL_SECONDS}s)...")

        flush_task = asyncio.create_task(_flush_loop())
        try:
            await asyncio.sleep(duration_minutes * 60)
        finally:
            flush_task.cancel()
            await browser.close()


def main():
    parser = argparse.ArgumentParser(description="NEPSE market depth WebSocket listener")
    parser.add_argument("--duration-minutes", type=int, default=240,
                         help="how long to listen before exiting (default 240 = 4 hours, "
                              "covers a typical market session)")
    args = parser.parse_args()
    asyncio.run(listen(args.duration_minutes))


if __name__ == "__main__":
    main()
