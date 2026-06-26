"""
Seed & auto-update broker history from MeroLagani.

Usage:
  python scripts/seed-broker-history.py              # save today's data
  python scripts/seed-broker-history.py --date 2026-06-22  # specific date
  python scripts/seed-broker-history.py --backfill   # try last 30 days
  python scripts/seed-broker-history.py --daily      # daily cron mode (auto date)

Stores data in both seed/darisir.db and data/darisir.db
"""
import sqlite3, json, os, sys, hashlib, time
from datetime import datetime, timedelta, timezone

BASE = r"C:\nepali bajar 2"
DBS = [
    os.path.join(BASE, "seed", "darisir.db"),
    os.path.join(BASE, "data", "darisir.db"),
]

MERO_URL = "https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary"
MERO_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://merolagani.com/MarketSummary.aspx",
}

def today_npt():
    return datetime.now(timezone(timedelta(hours=5, minutes=45))).strftime("%Y-%m-%d")

def fetch_mero():
    import urllib.request
    req = urllib.request.Request(MERO_URL, headers=MERO_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def save_broker_data(date, brokers, db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    saved = 0
    now = int(time.time() * 1000)
    raw = json.dumps(brokers, sort_keys=True)
    data_hash = hashlib.md5(raw.encode()).hexdigest()[:12]

    for b in brokers:
        code = b.get("b", "")
        if not code: continue
        try:
            cur.execute("""
                INSERT INTO merolagani_broker_daily(tradeDate, brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt, savedAt, hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tradeDate, brokerCode) DO UPDATE SET
                    brokerName=excluded.brokerName,
                    purchaseAmt=excluded.purchaseAmt,
                    sellAmt=excluded.sellAmt,
                    netAmt=excluded.netAmt,
                    totalAmt=excluded.totalAmt,
                    savedAt=excluded.savedAt,
                    hash=excluded.hash
            """, (
                date,
                code,
                b.get("n", ""),
                float(b.get("p", 0)),
                float(b.get("s", 0)),
                float(b.get("m", 0)),
                float(b.get("t", 0)),
                now,
                data_hash,
            ))
            saved += 1
        except Exception as e:
            print(f"  Error saving broker {code}: {e}")
    conn.commit()
    conn.close()
    return saved

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Seed/update broker history from MeroLagani")
    parser.add_argument("--date", help="Specific date (YYYY-MM-DD)")
    parser.add_argument("--backfill", action="store_true", help="Backfill last 30 days")
    parser.add_argument("--daily", action="store_true", help="Daily cron mode")
    args = parser.parse_args()

    date = args.date or today_npt()
    total_saved = 0

    if args.backfill:
        dates = []
        d = datetime.now(timezone(timedelta(hours=5, minutes=45)))
        for _ in range(30):
            if d.weekday() < 5:  # Mon-Fri only
                dates.append(d.strftime("%Y-%m-%d"))
            d -= timedelta(days=1)
        print(f"Backfilling {len(dates)} trading days...")
        for dt in dates:
            try:
                mero = fetch_mero()
                brokers = mero.get("broker", {}).get("detail", [])
                if not brokers:
                    print(f"  {dt}: no broker data, skipping")
                    continue
                for db_path in DBS:
                    saved = save_broker_data(dt, brokers, db_path)
                total_saved += saved
                print(f"  {dt}: saved {len(brokers)} brokers (total: {saved})")
            except Exception as e:
                print(f"  {dt}: ERROR {e}")
    else:
        print(f"Fetching MeroLagani data for {date}...")
        mero = fetch_mero()
        mt = mero.get("mt", "?")
        stock_count = len(mero.get("stock", {}).get("detail", []))
        brokers = mero.get("broker", {}).get("detail", [])
        print(f"  Market: {mt} | Stocks: {stock_count} | Brokers: {len(brokers)}")

        if not brokers:
            print("ERROR: No broker data in MeroLagani response")
            sys.exit(1)

        for db_path in DBS:
            saved = save_broker_data(date, brokers, db_path)
            total_saved += saved
            print(f"  Saved {saved} brokers to {db_path}")

    print(f"\nDone. Total broker records saved: {total_saved}")

if __name__ == "__main__":
    main()
