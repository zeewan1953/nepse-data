# Market Depth — WebSocket Research Checklist

Same process that worked for the floorsheet table. ~10 min.

## Step 1 — Confirm it's actually WebSocket
1. Open `nepalstock.com.np` → go to the Market Depth page
2. Dev Tools (`F12`) → **Network** tab → filter by **WS**
3. Reload the page
4. Do you see a connection appear in the WS filter?
   - **Yes** → great, continue to Step 2.
   - **No** → it's probably polling a REST endpoint every few seconds
     instead. Switch the filter to **Fetch/XHR**, reload, and watch for a
     repeating request (same URL, fires every few seconds). Tell me that
     URL + a sample response and I'll rewrite this as a polling adapter
     instead of a WS listener — same end result, different mechanism.

## Step 2 — Capture a real message
1. Click on the WS connection in the Network panel
2. Open its **Messages** (or "Frames") sub-tab
3. Click on any individual message that arrives
4. Copy the raw JSON text and paste it back to me — that's the only
   thing I actually need to fix `_parse_depth_message()` precisely
   instead of guessing field names.

## Step 3 — Check subscription behavior
- Does data start flowing immediately on page load for ALL symbols?
- Or do you have to click/select a specific symbol first before its
  depth starts updating?
  - If it's the latter, the WS connection likely expects you to *send* a
    subscribe message (e.g. `{"action": "subscribe", "symbol": "NABIL"}`)
    after connecting. If so, tell me what you see in the **outgoing**
    frames (sent FROM the browser TO the server) when you click a symbol
    — I'll add that send step to the listener.

## Step 4 (optional but useful) — Check the WS URL itself
Copy the full WebSocket URL (shown at the top of the Network panel entry,
something like `wss://nepalstock.com.np/...`). Useful in case the
connection requires a specific Origin/Referer header that Playwright's
default browser context might not send automatically — if connections
keep dropping, this is usually why.
