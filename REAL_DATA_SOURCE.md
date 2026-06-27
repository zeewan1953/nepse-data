# Real Data Source — Verified

**Data source for broker data collection is MeroLagani.**
No fake or sample data is used.

## Primary Source

| Property | Value |
|----------|-------|
| **URL** | `https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary` |
| **Method** | GET |
| **Content-Type** | JSON |
| **Used by** | `src/lib/merolagani.ts` → `fetchMeroLaganiSummary()` |
| **Collection cron** | `/api/cron/collect` (Vercel Cron, 18 9 * * 0-4 UTC = 15:03 NPT) |
| **Retry** | 3 attempts with exponential backoff |

## What It Returns

```json
{
  "mt": "ok",
  "overall": {
    "d": "2026-06-27",
    "t": "1234567890",
    "q": "9876543",
    "tn": "5432",
    "st": "200",
    "mc": "5000000000000",
    "fc": "3000000000000"
  },
  "turnover": {
    "date": "2026-06-27",
    "detail": [
      { "s": "NABIL", "n": "Nabil Bank", "lp": 850, "t": 12345678, "pc": 1.2, "h": 860, "l": 840, "op": 845, "q": 14567 }
    ]
  },
  "broker": {
    "date": "2026-06-27",
    "detail": [
      { "b": "58", "n": "Nabil Securities", "p": 15000000, "s": 12000000, "m": 3000000, "t": 27000000 }
    ]
  },
  "stock": {
    "date": "2026-06-27",
    "detail": [
      { "s": "NABIL", "lp": 850, "c": 10, "q": 5000 }
    ]
  }
}
```

## Data Mapping

| Source Field | DB Field | Table |
|---|---|---|
| `broker.detail[].b` | `brokerCode` | `merolagani_broker_daily` |
| `broker.detail[].n` | `brokerName` | `merolagani_broker_daily` |
| `broker.detail[].p` | `purchaseAmt` | `merolagani_broker_daily` |
| `broker.detail[].s` | `sellAmt` | `merolagani_broker_daily` |
| `broker.detail[].m` | `netAmt` | `merolagani_broker_daily` |
| `broker.detail[].t` | `totalAmt` | `merolagani_broker_daily` |
| `broker.date` | `tradeDate` | `merolagani_broker_daily` |

## Database Storage

- Table: `merolagani_broker_daily`
- Primary Key: `(tradeDate, brokerCode)`
- Unique constraint prevents duplicate inserts
- Hash-based change detection avoids unnecessary writes

## Secondary Sources

- **NEPSE floorsheet API** for stock-wise broker flow (`floorsheet_trades`, `broker_daily_agg`)
- **NEPSE live market API** (`@rumess/nepse-api`) for OHLC and market status

## Verification

Run this to verify live data:

```bash
curl -s "https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary" \
  -H "Accept: application/json" | head -c 500
```

Expected: JSON response with `"broker"` and `"detail"` array containing 50+ broker entries.

## Known Limitations

- Only returns **previous trading day's** data
- No historical backfill — database grows one day at a time
- ~101 brokers total
- Data becomes stable ~30 min after market close (15:00 NPT)
