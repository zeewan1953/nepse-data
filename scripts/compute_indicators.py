"""
Historical backfill and daily update for the 24-indicator signal matrix.

Usage:
  python scripts/compute_indicators.py                    # compute for latest trading day
  python scripts/compute_indicators.py --date 2026-06-22  # specific date
  python scripts/compute_indicators.py --backfill         # last 180 trading days
  python scripts/compute_indicators.py --check            # dry-run: print what would be done

Stores data in both seed/darisir.db and data/darisir.db.
Uses the same append-only pattern as signal_daily_snapshot.
"""

import sqlite3
import sys
import os
import time
import math
import random
from datetime import datetime, timedelta, timezone

# Add project root to path so we can import indicators module
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from indicators.technical_indicators import (
    OHLCV, INDICATOR_META, INDICATOR_FUNCS, compute_indicator,
    compute_net_broker_flow, compute_order_flow_est,
)

DBS = [
    os.path.join(BASE, "seed", "darisir.db"),
    os.path.join(BASE, "data", "darisir.db"),
]

NPT = timezone(timedelta(hours=5, minutes=45))

# NEPSE holiday calendar (mirrors src/lib/date-utils.ts)
NEPSE_HOLIDAYS = {
    "2026-01-01", "2026-01-14", "2026-01-29", "2026-02-19",
    "2026-03-08", "2026-03-20", "2026-04-14", "2026-05-05",
    "2026-06-04", "2026-07-07", "2026-08-23", "2026-08-28",
    "2026-09-18", "2026-09-20", "2026-09-29", "2026-10-01",
    "2026-10-02", "2026-10-16", "2026-10-18", "2026-11-04",
    "2026-11-21", "2026-12-09", "2026-12-10", "2026-12-25",
    "2026-12-31",
}

ALL_INDICATOR_NAMES = [m["name"] for m in INDICATOR_META]

# Indicators that need external data (not just OHLCV)
EXTERNAL_INDICATORS = {"net_broker_flow", "order_flow_est"}


def is_trading_day(date_str: str) -> bool:
    if date_str in NEPSE_HOLIDAYS:
        return False
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return False
    # NEPSE trades Sunday (6) through Thursday (3)
    return d.weekday() in (6, 0, 1, 2, 3)


def get_trading_days(from_date: str, to_date: str) -> list[str]:
    days = []
    d = datetime.strptime(from_date, "%Y-%m-%d")
    end = datetime.strptime(to_date, "%Y-%m-%d")
    while d <= end:
        s = d.strftime("%Y-%m-%d")
        if is_trading_day(s):
            days.append(s)
        d += timedelta(days=1)
    return days


def get_last_n_trading_days(n: int, end_date: str | None = None) -> list[str]:
    if end_date is None:
        end_date = datetime.now(NPT).strftime("%Y-%m-%d")
    days: list[str] = []
    d = datetime.strptime(end_date, "%Y-%m-%d")
    while len(days) < n:
        s = d.strftime("%Y-%m-%d")
        if is_trading_day(s):
            days.insert(0, s)
        d -= timedelta(days=1)
    return days


def get_all_trading_days_in_range(from_date: str, to_date: str) -> list[str]:
    return get_trading_days(from_date, to_date)


def get_stocks(conn: sqlite3.Connection) -> list[str]:
    cur = conn.execute("SELECT DISTINCT symbol FROM stock_daily_ohlcv ORDER BY symbol")
    return [r[0] for r in cur.fetchall()]


def get_ohlcv_bars(conn: sqlite3.Connection, symbol: str, up_to: str, limit: int = 300) -> list[OHLCV]:
    cur = conn.execute(
        """SELECT tradeDate, open, high, low, close, volume
           FROM stock_daily_ohlcv
           WHERE symbol = ? AND tradeDate <= ?
           ORDER BY tradeDate ASC
           LIMIT ?""",
        (symbol, up_to, limit),
    )
    bars = []
    for r in cur.fetchall():
        bars.append(OHLCV(trade_date=r[0], open_=r[1], high=r[2], low=r[3], close=r[4], volume=r[5]))
    return bars


def get_net_broker_flow(conn: sqlite3.Connection, symbol: str, date_str: str) -> float | None:
    cur = conn.execute(
        """SELECT SUM(netAmt) FROM merolagani_broker_daily
           WHERE tradeDate = ? AND brokerCode IN (
               SELECT DISTINCT brokerCode FROM broker_daily_summary
               WHERE tradeDate = ? AND symbol = ?
           )""",
        (date_str, date_str, symbol),
    )
    row = cur.fetchone()
    if row and row[0] is not None:
        return round(row[0], 2)
    cur = conn.execute(
        """SELECT SUM(netAmt) FROM broker_daily_agg
           WHERE tradeDate = ? AND stockSymbol = ?""",
        (date_str, symbol),
    )
    row = cur.fetchone()
    if row and row[0] is not None:
        return round(row[0], 2)
    return None


def get_order_flow_est(conn: sqlite3.Connection, symbol: str, date_str: str) -> float | None:
    cur = conn.execute(
        """SELECT contractQuantity, contractAmount, buyerMemberId, sellerMemberId
           FROM floorsheet_trades
           WHERE tradeDate = ? AND stockSymbol = ?
           ORDER BY tradeOrder ASC""",
        (date_str, symbol),
    )
    rows = cur.fetchall()
    if len(rows) < 2:
        return None
    buy_vol = 0.0
    sell_vol = 0.0
    last_dir = "buy"
    for i, r in enumerate(rows):
        qty = float(r[0])
        amt = float(r[1])
        price = amt / qty if qty > 0 else 0
        if i > 0:
            prev_amt = float(rows[i - 1][1])
            prev_qty = float(rows[i - 1][0])
            prev_price = prev_amt / prev_qty if prev_qty > 0 else 0
            if prev_price > 0 and price > prev_price:
                last_dir = "buy"
            elif prev_price > 0 and price < prev_price:
                last_dir = "sell"
        if last_dir == "buy":
            buy_vol += qty
        else:
            sell_vol += qty
    return round(buy_vol - sell_vol, 2)


# ─── Drift spot-check ────────────────────────────────────────────────────────

def drift_check(
    conn: sqlite3.Connection,
    trade_date: str,
    symbol: str,
    indicator_name: str,
    recompute_value: float | None,
) -> bool:
    """Random spot-check: recompute from raw data and compare with just-written value.
    Returns True if match (within tolerance), False if mismatch."""
    if recompute_value is None:
        return True  # null is acceptable
    bars = get_ohlcv_bars(conn, symbol, trade_date)
    if len(bars) < 5:
        return True
    if indicator_name in EXTERNAL_INDICATORS:
        return True  # external indicators can't be recomputed from OHLCV alone
    val, _ = compute_indicator(indicator_name, bars)
    if val is None:
        return recompute_value is None
    return abs(val - recompute_value) < 0.01


# ─── Main computation ────────────────────────────────────────────────────────

def compute_for_date(
    conn: sqlite3.Connection,
    trade_date: str,
    dry_run: bool = False,
) -> tuple[int, int, int]:
    """Compute all 24 indicators for all stocks on a given date.
    Returns (inserted, skipped, errors)."""
    stocks = get_stocks(conn)
    calc_version = 1
    now_ms = int(time.time() * 1000)
    inserted = 0
    skipped = 0
    errors = 0

    for symbol in stocks:
        bars = get_ohlcv_bars(conn, symbol, trade_date)
        if len(bars) < 2:
            skipped += 1
            continue

        for ind_name in ALL_INDICATOR_NAMES:
            if ind_name in EXTERNAL_INDICATORS:
                continue  # handled below

            try:
                raw_value, signal = compute_indicator(ind_name, bars)
            except Exception:
                errors += 1
                continue

            if dry_run:
                inserted += 1
                continue

            try:
                conn.execute(
                    """INSERT OR IGNORE INTO indicator_daily_signal
                       (trade_date, symbol, indicator_name, raw_value, signal, calc_version, computed_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (trade_date, symbol, ind_name, raw_value, signal, calc_version, now_ms),
                )
                if conn.total_changes:
                    inserted += 1
                else:
                    skipped += 1
            except Exception:
                errors += 1

        # Net Broker Flow
        net_amt = get_net_broker_flow(conn, symbol, trade_date)
        if net_amt is not None:
            raw_value, signal = compute_net_broker_flow(net_amt)
            if not dry_run:
                try:
                    conn.execute(
                        """INSERT OR IGNORE INTO indicator_daily_signal
                           (trade_date, symbol, indicator_name, raw_value, signal, calc_version, computed_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (trade_date, symbol, "net_broker_flow", raw_value, signal, calc_version, now_ms),
                    )
                    if conn.total_changes:
                        inserted += 1
                    else:
                        skipped += 1
                except Exception:
                    errors += 1

        # Order Flow (est.)
        est_net = get_order_flow_est(conn, symbol, trade_date)
        if est_net is not None:
            raw_value, signal = compute_order_flow_est(est_net)
            if not dry_run:
                try:
                    conn.execute(
                        """INSERT OR IGNORE INTO indicator_daily_signal
                           (trade_date, symbol, indicator_name, raw_value, signal, calc_version, computed_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (trade_date, symbol, "order_flow_est", raw_value, signal, calc_version, now_ms),
                    )
                    if conn.total_changes:
                        inserted += 1
                    else:
                        skipped += 1
                except Exception:
                    errors += 1

    return inserted, skipped, errors


def run_backtest(conn: sqlite3.Connection) -> None:
    """Run the signal backtest by calling captureDailySnapshot + backtest logic
    through the Next.js API if available, or compute inline."""
    print("\nAuto-running backtest after backfill...")
    try:
        from scripts.run_backtest import run_backtest_inline
        run_backtest_inline(conn)
    except ImportError:
        print("  Skipping backtest (scripts/run_backtest.py not found).")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Compute 24-indicator signal matrix")
    parser.add_argument("--date", type=str, help="Single trading date (YYYY-MM-DD)")
    parser.add_argument("--backfill", action="store_true", help="Backfill last 180 trading days")
    parser.add_argument("--check", action="store_true", help="Dry run (no writes)")
    args = parser.parse_args()

    dry_run = args.check
    now = datetime.now(NPT)
    today_str = now.strftime("%Y-%m-%d")

    # Determine which dates to process
    dates_to_process: list[str] = []
    if args.date:
        dates_to_process = [args.date]
    elif args.backfill:
        dates_to_process = get_last_n_trading_days(180)
    else:
        dates_to_process = [today_str]

    if not dates_to_process:
        print("No trading days to process.")
        return

    total_inserted = 0
    total_skipped = 0
    total_errors = 0
    start_time = time.time()

    for db_path in DBS:
        if not os.path.exists(db_path):
            print(f"Skipping {db_path} (not found)")
            continue

        print(f"\n=== Processing {db_path} ===\n")
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode=WAL")

        # Ensure table exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS indicator_daily_signal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_date TEXT NOT NULL,
                symbol TEXT NOT NULL,
                indicator_name TEXT NOT NULL,
                raw_value NUMERIC,
                signal TEXT CHECK(signal IN ('BUY','SELL','NEUTRAL')),
                calc_version INTEGER NOT NULL DEFAULT 1,
                computed_at INTEGER NOT NULL
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_indicator_daily_uniq
            ON indicator_daily_signal(trade_date, symbol, indicator_name, calc_version)
        """)
        conn.commit()

        for date_str in dates_to_process:
            if not is_trading_day(date_str):
                if args.backfill:
                    continue
                print(f"  Skipping {date_str} (not a trading day)")
                continue
            cur = conn.execute("SELECT 1 FROM stock_daily_ohlcv WHERE tradeDate = ? LIMIT 1", (date_str,))
            if not cur.fetchone():
                if args.backfill:
                    continue
                print(f"  Skipping {date_str} (no OHLCV data)")
                continue

            print(f"  Processing {date_str}...", end=" ", flush=True)
            ins, skp, err = compute_for_date(conn, date_str, dry_run=dry_run)
            conn.commit()
            total_inserted += ins
            total_skipped += skp
            total_errors += err
            print(f"Inserted {ins}  Skipped {skp}  Errors {err}")

        conn.close()

    elapsed = time.time() - start_time

    print(f"\n{'=== DRY RUN ===' if dry_run else '=== Completed ==='}")
    print(f"  Trading days processed: {len(dates_to_process)}")
    print(f"  Rows inserted: {total_inserted}")
    print(f"  Rows skipped (already exist): {total_skipped}")
    print(f"  Errors: {total_errors}")
    print(f"  Elapsed time: {elapsed:.1f} seconds")

    # Validation
    if not dry_run and total_inserted > 0:
        print("\n=== Validation ===")
        for db_path in DBS:
            if not os.path.exists(db_path):
                continue
            conn = sqlite3.connect(db_path)
            cur = conn.execute("SELECT COUNT(DISTINCT trade_date) FROM indicator_daily_signal")
            days_count = cur.fetchone()[0]
            cur = conn.execute("SELECT COUNT(*) FROM indicator_daily_signal")
            total_rows = cur.fetchone()[0]
            cur = conn.execute("SELECT COUNT(DISTINCT symbol) FROM indicator_daily_signal")
            stocks_count = cur.fetchone()[0]
            print(f"  {db_path}: {days_count} trading days, {stocks_count} stocks, {total_rows} total rows")
            conn.close()


if __name__ == "__main__":
    main()
