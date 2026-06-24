"""
FastAPI Backend
=================

Routes:
  GET  /floorsheet/{trade_date}              -> all trades for a date (cache-first)
  GET  /floorsheet/{trade_date}/symbol/{sym}  -> filtered by symbol
  GET  /search?symbol=&broker=&date=          -> on-demand: scrape if missing, then serve
  GET  /broker-summary/{trade_date}           -> per-broker buy/sell totals, DERIVED from
                                                  floorsheet_trades — no separate scraping needed
  GET  /market-depth/{symbol}/latest          -> most recent WebSocket-pushed depth snapshot
  GET  /market-depth/{symbol}/history         -> depth snapshots over a time range (for charting)
  GET  /health
  GET  /status/{trade_date}                    -> data_version/last_updated, for polling

On startup, also boots the APScheduler background job (api/scheduler.py)
that periodically re-scrapes during market hours and auto-updates the DB
when the source data changes.

Note: Market Depth data is NOT written by this app or the scheduler — it
comes from scraper/market_depth_listener.py, a separate long-running
process you run alongside this one during market hours (see that file's
docstring). This API only reads what that listener has already written.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import FloorsheetTrade, ScrapeLog, SearchCache, MarketDepthSnapshot, get_engine
from pipeline import cleaner, ai_validator, change_detector
from scraper.nepse_scraper import scrape_floorsheet
from api.scheduler import start_scheduler

app = FastAPI(title="NEPSE Floorsheet API")

# Loosen for local dev; tighten to your actual frontend origin in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = get_engine()


@app.on_event("startup")
def on_startup():
    start_scheduler()


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.get("/floorsheet/{trade_date}")
def get_floorsheet(trade_date: date):
    """Cache-first: serve from Postgres. If we've never scraped this date
    at all, trigger a scrape inline (small latency hit, once).

    Note: NEPSE official has no date picker — it only ever shows TODAY's
    floorsheet (confirmed live). So a cache-miss on a PAST date isn't
    recoverable by scraping; it means the scheduler never captured that
    day while it was live, and that data is gone from the source for good.
    We surface that clearly instead of crashing."""
    with Session(engine) as session:
        rows = session.scalars(
            select(FloorsheetTrade).where(FloorsheetTrade.trade_date == trade_date)
        ).all()

        if rows:
            return {"trade_date": str(trade_date), "source": "cache", "count": len(rows),
                     "trades": [_serialize(r) for r in rows]}

    if trade_date != date.today():
        raise HTTPException(
            status_code=404,
            detail=(
                f"No cached data for {trade_date} and this source has no "
                f"historical date access — it only exposes today's floorsheet. "
                f"This date was never captured by the scheduler while it was live."
            ),
        )

    # today, and nothing cached yet — scrape it now, once
    trades = asyncio.run(_scrape_validate_store(trade_date))
    return {"trade_date": str(trade_date), "source": "live_scrape", "count": len(trades),
             "trades": trades}


@app.get("/floorsheet/{trade_date}/symbol/{symbol}")
def get_floorsheet_by_symbol(trade_date: date, symbol: str):
    with Session(engine) as session:
        rows = session.scalars(
            select(FloorsheetTrade).where(
                FloorsheetTrade.trade_date == trade_date,
                FloorsheetTrade.symbol == symbol.upper(),
            )
        ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No data for that symbol/date — try /search to fetch it on demand.")
    return {"trade_date": str(trade_date), "symbol": symbol.upper(), "count": len(rows),
             "trades": [_serialize(r) for r in rows]}


@app.get("/search")
async def search(
    symbol: str | None = Query(default=None),
    broker: str | None = Query(default=None),
    trade_date: date = Query(...),
):
    """
    On-demand cache-aside search — your "data I search once, store it"
    requirement. First call for a given (symbol/broker, date) combo scrapes
    + stores; every call after that for the SAME combo is a pure DB read.
    """
    query_key = f"date={trade_date}|symbol={symbol or ''}|broker={broker or ''}"

    with Session(engine) as session:
        cache_entry = session.scalar(select(SearchCache).where(SearchCache.query_key == query_key))
        already_have_date = session.scalar(
            select(ScrapeLog).where(ScrapeLog.trade_date == trade_date)
        )

        if not already_have_date:
            if trade_date != date.today():
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"No cached data for {trade_date} — this source has no "
                        f"historical date access, so this date can only be "
                        f"served if the scheduler already captured it while it "
                        f"was live."
                    ),
                )
            # never scraped today at all yet — do it now
            await _scrape_validate_store(trade_date)

        if not cache_entry:
            session.add(SearchCache(query_key=query_key, resolved=True, resolved_at=datetime.utcnow()))
            session.commit()

        stmt = select(FloorsheetTrade).where(FloorsheetTrade.trade_date == trade_date)
        if symbol:
            stmt = stmt.where(FloorsheetTrade.symbol == symbol.upper())
        if broker:
            stmt = stmt.where(
                (FloorsheetTrade.buyer_broker == broker) | (FloorsheetTrade.seller_broker == broker)
            )
        rows = session.scalars(stmt).all()

    return {"query": query_key, "count": len(rows), "trades": [_serialize(r) for r in rows]}


@app.get("/broker-summary/{trade_date}")
def broker_summary(trade_date: date):
    """
    Per-broker buy/sell totals for a date — DERIVED from floorsheet_trades
    we already have, not a separate scrape. Every floorsheet row already
    records buyer_broker + seller_broker, so summing those gives exact
    broker-level volumes, more granular than any pre-aggregated 'top
    brokers' widget the site might show.
    """
    with Session(engine) as session:
        rows = session.scalars(
            select(FloorsheetTrade).where(FloorsheetTrade.trade_date == trade_date)
        ).all()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No floorsheet data cached for {trade_date} yet.")

    summary: dict[str, dict] = defaultdict(lambda: {
        "buy_quantity": 0, "buy_amount": 0.0,
        "sell_quantity": 0, "sell_amount": 0.0,
    })
    for r in rows:
        summary[r.buyer_broker]["buy_quantity"] += r.quantity
        summary[r.buyer_broker]["buy_amount"] += r.amount
        summary[r.seller_broker]["sell_quantity"] += r.quantity
        summary[r.seller_broker]["sell_amount"] += r.amount

    result = []
    for broker, s in summary.items():
        result.append({
            "broker": broker,
            "buy_quantity": s["buy_quantity"], "buy_amount": round(s["buy_amount"], 2),
            "sell_quantity": s["sell_quantity"], "sell_amount": round(s["sell_amount"], 2),
            "net_quantity": s["buy_quantity"] - s["sell_quantity"],
            "net_amount": round(s["buy_amount"] - s["sell_amount"], 2),
        })
    result.sort(key=lambda x: abs(x["net_amount"]), reverse=True)

    return {"trade_date": str(trade_date), "broker_count": len(result), "brokers": result}


@app.get("/market-depth/{symbol}/latest")
def market_depth_latest(symbol: str):
    """
    Most recent depth snapshot written by scraper/market_depth_listener.py.
    That listener must be running separately during market hours — this
    endpoint only reads what it already wrote, it doesn't trigger a scrape.
    """
    with Session(engine) as session:
        row = session.scalar(
            select(MarketDepthSnapshot)
            .where(MarketDepthSnapshot.symbol == symbol.upper())
            .order_by(MarketDepthSnapshot.captured_at.desc())
        )
    if not row:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No market depth data for {symbol.upper()} yet. Is "
                f"scraper/market_depth_listener.py running?"
            ),
        )
    return {
        "symbol": row.symbol,
        "captured_at": row.captured_at.isoformat(),
        "bids": row.bids,
        "asks": row.asks,
    }


@app.get("/market-depth/{symbol}/history")
def market_depth_history(symbol: str, minutes: int = Query(default=30, le=480)):
    """Snapshots over the last N minutes — e.g. for plotting how the
    order book imbalance shifted through the session."""
    since = datetime.utcnow() - timedelta(minutes=minutes)
    with Session(engine) as session:
        rows = session.scalars(
            select(MarketDepthSnapshot)
            .where(MarketDepthSnapshot.symbol == symbol.upper(), MarketDepthSnapshot.captured_at >= since)
            .order_by(MarketDepthSnapshot.captured_at.asc())
        ).all()
    return {
        "symbol": symbol.upper(),
        "count": len(rows),
        "snapshots": [
            {"captured_at": r.captured_at.isoformat(), "bids": r.bids, "asks": r.asks}
            for r in rows
        ],
    }


@app.get("/status/{trade_date}")
def status(trade_date: date):
    """Lightweight endpoint for the frontend to poll: 'has this day's data
    changed since I last fetched it?' Compare data_version client-side."""
    with Session(engine) as session:
        log = session.scalar(select(ScrapeLog).where(ScrapeLog.trade_date == trade_date))
    if not log:
        return {"trade_date": str(trade_date), "exists": False}
    return {
        "trade_date": str(trade_date),
        "exists": True,
        "data_version": log.data_version,
        "row_count": log.row_count,
        "flagged_count": log.flagged_count,
        "last_changed_at": log.last_changed_at.isoformat(),
        "last_checked_at": log.last_checked_at.isoformat(),
    }


async def _scrape_validate_store(trade_date: date) -> list[dict]:
    """Shared scrape → validate → (optional AI review) → upsert pipeline.
    Used by both the scheduler and the on-demand endpoints above."""
    raw_rows = await scrape_floorsheet(trade_date)
    row_dicts = [r.to_dict() for r in raw_rows]

    day_avgs = cleaner.compute_day_average_rates(row_dicts)
    result = cleaner.validate_batch(row_dicts, day_avgs)

    if result.flagged:
        result.flagged = await ai_validator.review_flagged_rows(result.flagged)

    changed, new_hash = change_detector.has_changed(
        result.clean + result.flagged, previous_hash=_get_previous_hash(trade_date)
    )

    with Session(engine) as session:
        if changed:
            # upsert clean + flagged (AI-reviewed) rows; rejected rows are
            # logged but never written to the trades table
            for row in result.clean:
                _upsert_trade(session, trade_date, row, status="clean")
            for row in result.flagged:
                status = "ai_reviewed" if row.get("_ai_verdict") not in (None, "skipped_no_api_key") else "needs_human_review"
                _upsert_trade(session, trade_date, row, status=status)

            log = session.get(ScrapeLog, trade_date) or ScrapeLog(trade_date=trade_date)
            log.row_hash = new_hash
            log.data_version = (log.data_version or 0) + 1
            log.row_count = len(result.clean) + len(result.flagged)
            log.flagged_count = len(result.flagged)
            log.last_changed_at = datetime.utcnow()
            log.last_checked_at = datetime.utcnow()
            session.merge(log)
        else:
            log = session.get(ScrapeLog, trade_date)
            if log:
                log.last_checked_at = datetime.utcnow()
                session.merge(log)
        session.commit()

        rows = session.scalars(
            select(FloorsheetTrade).where(FloorsheetTrade.trade_date == trade_date)
        ).all()
        return [_serialize(r) for r in rows]


def _get_previous_hash(trade_date: date) -> str | None:
    with Session(engine) as session:
        log = session.get(ScrapeLog, trade_date)
        return log.row_hash if log else None


def _upsert_trade(session: Session, trade_date: date, row: dict, status: str):
    existing = session.scalar(
        select(FloorsheetTrade).where(
            FloorsheetTrade.trade_date == trade_date,
            FloorsheetTrade.contract_no == row.get("contract_no"),
        )
    )
    target = existing or FloorsheetTrade(trade_date=trade_date, contract_no=row.get("contract_no"))
    target.symbol = row["symbol"]
    target.buyer_broker = row["buyer_broker"]
    target.seller_broker = row["seller_broker"]
    target.quantity = row["quantity"]
    target.rate = row["rate"]
    target.amount = row["amount"]
    target.trade_time = row.get("trade_time")
    target.status = status
    target.flag_reason = row.get("_flag_reason")
    target.ai_verdict = row.get("_ai_verdict")
    target.ai_explanation = row.get("_ai_explanation")
    session.add(target)


def _serialize(row: FloorsheetTrade) -> dict:
    return {
        "id": row.id,
        "trade_date": str(row.trade_date),
        "symbol": row.symbol,
        "buyer_broker": row.buyer_broker,
        "seller_broker": row.seller_broker,
        "quantity": row.quantity,
        "rate": row.rate,
        "amount": row.amount,
        "contract_no": row.contract_no,
        "status": row.status,
        "flag_reason": row.flag_reason,
        "ai_verdict": row.ai_verdict,
        "ai_explanation": row.ai_explanation,
    }
