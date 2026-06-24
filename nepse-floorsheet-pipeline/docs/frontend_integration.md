# Wiring this into your React Broker-Flow Dashboard

Your dashboard's analytics layer (CMF, MFI, Volume Z-score, tick-rule order
flow classification, smart-money scoring, momentum buckets) should sit
**unchanged**. Only the data-fetching layer changes — swap the sample-data
generator for calls to this API.

## 1. Replace your sample data hook

If you currently have something like:

```js
// before
import { generateSampleFloorsheet } from './sampleData';
const trades = generateSampleFloorsheet(date);
```

Replace it with:

```js
// after
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

async function fetchFloorsheet(date) {
  const res = await fetch(`${API_BASE_URL}/floorsheet/${date}`);
  if (!res.ok) throw new Error(`Failed to fetch floorsheet for ${date}`);
  const data = await res.json();
  return data.trades; // same shape your analytics functions already expect:
                       // { symbol, buyer_broker, seller_broker, quantity, rate, amount, ... }
}
```

Your existing CMF/MFI/Z-score/smart-money functions consume an array of
trade objects — keep their input contract identical to what your sample
data produced, and they don't need to change at all.

## 2. Auto-refresh when the source data changes (not just polling blindly)

Instead of refetching the whole floorsheet every N seconds, poll the
lightweight `/status/{date}` endpoint and only refetch when `data_version`
actually increments:

```js
function useAutoRefreshFloorsheet(date, pollMs = 30000) {
  const [trades, setTrades] = useState([]);
  const [dataVersion, setDataVersion] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAndMaybeRefetch() {
      const statusRes = await fetch(`${API_BASE_URL}/status/${date}`);
      const status = await statusRes.json();
      if (!status.exists) return;

      if (status.data_version !== dataVersion) {
        const fresh = await fetchFloorsheet(date);
        if (!cancelled) {
          setTrades(fresh);
          setDataVersion(status.data_version);
        }
      }
    }

    checkAndMaybeRefetch();
    const interval = setInterval(checkAndMaybeRefetch, pollMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [date, dataVersion]);

  return trades;
}
```

This means: if NepseAlpha revises a day's floorsheet, your dashboard
reflects it within one poll cycle, without ever re-rendering on a cycle
where nothing actually changed.

## 3. Search bar → on-demand cache

For a "search a stock/broker/date" UI element, call `/search` instead of
`/floorsheet`:

```js
async function searchFloorsheet({ symbol, broker, date }) {
  const params = new URLSearchParams({ trade_date: date });
  if (symbol) params.set("symbol", symbol);
  if (broker) params.set("broker", broker);
  const res = await fetch(`${API_BASE_URL}/search?${params}`);
  return (await res.json()).trades;
}
```

First search for a given date/symbol/broker combo may take a couple of
seconds (live scrape). Every search after that — by anyone, not just the
original searcher — is instant, served from Postgres.

## 4. Data-quality badges (using the validator's output)

Each trade object now includes `status`, `flag_reason`, `ai_verdict`, and
`ai_explanation`. You can surface this in the UI — e.g. a small dot or
icon on flagged rows with a tooltip showing `ai_explanation` — so analysts
can see at a glance which trades the pipeline is less than 100% sure about,
without those rows ever being silently corrupted or silently dropped.

## 5. Android

Same REST API, no separate backend needed — point your Android HTTP client
(Retrofit/OkHttp) at the same `API_BASE_URL` and reuse the same JSON shape.
