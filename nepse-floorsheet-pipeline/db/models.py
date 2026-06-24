"""
Database models (SQLAlchemy 2.0 style)
=========================================

Run `python -m db.models` once to create all tables.
Equivalent raw SQL is in db/schema.sql if you'd rather inspect/run that
directly in psql.
"""

from __future__ import annotations

import os
from datetime import date, datetime

from dotenv import load_dotenv
from sqlalchemy import (
    create_engine, String, Integer, Float, Date, DateTime, Text, JSON,
    UniqueConstraint, Index, ForeignKey,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://nepse_user:nepse_pass@localhost:5432/nepse_db",
)


class Base(DeclarativeBase):
    pass


class FloorsheetTrade(Base):
    """One row = one trade contract from the floorsheet."""
    __tablename__ = "floorsheet_trades"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trade_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    buyer_broker: Mapped[str] = mapped_column(String(10), nullable=False)
    seller_broker: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    rate: Mapped[float] = mapped_column(Float, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    contract_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    trade_time: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # validation provenance — lets the frontend show a "data quality" badge
    status: Mapped[str] = mapped_column(String(20), default="clean")
    # "clean" | "flagged" | "ai_reviewed" | "needs_human_review"
    flag_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_verdict: Mapped[str | None] = mapped_column(String(30), nullable=True)
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        # prevents duplicate inserts of the exact same contract on re-scrape
        UniqueConstraint("trade_date", "contract_no", name="uq_trade_date_contract"),
        Index("ix_symbol_date", "symbol", "trade_date"),
        Index("ix_buyer_broker_date", "buyer_broker", "trade_date"),
        Index("ix_seller_broker_date", "seller_broker", "trade_date"),
    )


class MarketDepthSnapshot(Base):
    """
    Live order-book snapshot, one row per symbol per write-cycle.

    Unlike floorsheet_trades (immutable trade-by-trade history),
    market depth is a constantly-overwritten live view — there's no
    single "the" depth for a symbol, only "depth as of this moment".
    So this table is intentionally an append-only time series (many
    rows per symbol per day), written by the debounced WebSocket
    listener in scraper/market_depth_listener.py — NOT by the
    floorsheet scraper.
    """
    __tablename__ = "market_depth_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime, index=True, default=datetime.utcnow)
    bids: Mapped[list] = mapped_column(JSON)  # [{"price": float, "qty": int}, ...] best-bid first
    asks: Mapped[list] = mapped_column(JSON)  # [{"price": float, "qty": int}, ...] best-ask first
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # raw_payload kept for debugging — if the source's WS message shape
    # ever changes, you can see exactly what came through without
    # needing to re-run the listener to find out.

    __table_args__ = (
        Index("ix_symbol_captured_at", "symbol", "captured_at"),
    )


class ScrapeLog(Base):
    """
    One row per (trade_date), tracks the change-detection hash and lets
    the API report `data_version` / `last_updated` to the frontend so it
    knows when to refetch.
    """
    __tablename__ = "scrape_log"

    trade_date: Mapped[date] = mapped_column(Date, primary_key=True)
    row_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    data_version: Mapped[int] = mapped_column(Integer, default=1)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    flagged_count: Mapped[int] = mapped_column(Integer, default=0)
    first_scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_checked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SearchCache(Base):
    """
    Tracks on-demand searches (your "data I search once, store it"
    requirement). When a user searches a slice of data not yet scraped,
    the API scrapes it, stores the trades above, and logs the search here
    so future identical searches are served from `floorsheet_trades`
    directly without ever re-checking this table's logic twice.
    """
    __tablename__ = "search_cache"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    query_key: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    # e.g. "symbol=NABIL&date=2026-06-20" or "broker=45&date=2026-06-20"
    resolved: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


def get_engine():
    return create_engine(DATABASE_URL, echo=False)


def init_db():
    engine = get_engine()
    Base.metadata.create_all(engine)
    print(f"Tables created at {DATABASE_URL}")


if __name__ == "__main__":
    init_db()
