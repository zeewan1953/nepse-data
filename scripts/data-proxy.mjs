/**
 * Local Data Proxy — runs on YOUR machine to fetch from nepalstock/nepsealpha
 * Bypasses Vercel geo-block by using your local IP. Then pushes data to the app.
 *
 * Usage:
 *   node scripts/data-proxy.mjs                    # collect all sources
 *   node scripts/data-proxy.mjs --stocks           # only stocks
 *   node scripts/data-proxy.mjs --broker --date 2026-06-24  # broker data
 *   node scripts/data-proxy.mjs --watch            # run every 3 min during market hours
 */

const APP_URL = process.env.APP_URL || "https://nepse-data-sand.vercel.app";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// ======================= HELPERS =======================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isMarketHours() {
  const now = new Date();
  const npt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  if (npt.getDay() > 4) return false;
  const mins = npt.getHours() * 60 + npt.getMinutes();
  return mins >= 660 && mins < 900; // 11:00-15:00 NPT
}

async function postToApp(endpoint, data) {
  const url = `${APP_URL}${endpoint}`;
  const key = process.env.API_KEY || "data-proxy-key";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "User-Agent": "DataProxy/1.0",
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  });
  const result = await res.json().catch(() => ({ error: "parse failed" }));
  return { status: res.status, ...result };
}

// ======================= NEPSEALPHA SCRAPER =======================
async function scrapeNepseAlphaLive() {
  console.log("\n--- NepseAlpha Live Market ---");
  try {
    const res = await fetch("https://nepsealpha.com", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    console.log(`  Status: ${res.status}, HTML: ${html.length} bytes`);

    // Try to find JSON data in the HTML
    const jsonMatch = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*({.*?});?\s*<\/script>/i);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        console.log("  Found __INITIAL_STATE__ with keys:", Object.keys(data));
        return data;
      } catch {}
    }

    // Fallback: try to extract from API endpoint
    const apiRes = await fetch("https://nepsealpha.com/api/live", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (apiRes.ok) {
      const apiData = await apiRes.json();
      console.log("  Live API: OK — keys:", Object.keys(apiData).slice(0, 10));
      return apiData;
    }

    console.log("  No structured data found, extracting HTML tables...");
    // Extract table data from HTML
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tables = [];
    let m;
    while ((m = tableRegex.exec(html)) !== null) {
      if (m[1].includes("NEPSE") || m[1].includes("Rs.") || m[1].includes("trading")) {
        tables.push(m[1]);
      }
    }
    console.log(`  Found ${tables.length} relevant tables`);
    return { html, tables: tables.length };
  } catch (e) {
    console.log("  Error:", e.message);
    return null;
  }
}

async function scrapeNepseAlphaStock(symbol) {
  console.log(`\n--- NepseAlpha ${symbol} ---`);
  try {
    const res = await fetch(`https://nepsealpha.com/stock/${symbol}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    console.log(`  Status: ${res.status}, HTML: ${html.length} bytes`);

    // Extract price data
    const priceMatch = html.match(/id="ltp"[^>]*>([^<]+)</i);
    const changeMatch = html.match(/id="change"[^>]*>([^<]+)</i);
    const volumeMatch = html.match(/id="volume"[^>]*>([^<]+)</i);

    const data = {
      symbol,
      ltp: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null,
      change: changeMatch ? parseFloat(changeMatch[1].replace(/,/g, "")) : null,
      volume: volumeMatch ? parseInt(volumeMatch[1].replace(/,/g, "")) : null,
    };
    console.log(`  Price: Rs ${data.ltp || "N/A"}, Change: ${data.change || "N/A"}, Vol: ${data.volume || "N/A"}`);
    return data;
  } catch (e) {
    console.log("  Error:", e.message);
    return null;
  }
}

// ======================= NEPALSTOCK SCRAPER =======================
async function scrapeNepalStockLive() {
  console.log("\n--- NepalStock Live ---");
  const endpoints = [
    "https://nepalstock.com/api/nots/nepse-data/today-price",
    "https://nepalstock.com.np/api/nots/nepse-data/today-price",
    "https://nepalstock.com/api/nots/nepse-data/live-market",
    "https://nepalstock.com.np/api/nots/nepse-data/live-market",
    "https://nepalstock.com/today-price",
    "https://nepalstock.com.np/today-price",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "application/json, text/html",
          "Referer": "https://nepalstock.com/",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          console.log(`  ${url} — JSON OK, rows: ${Array.isArray(data) ? data.length : Object.keys(data).length}`);
          return data;
        } catch {
          console.log(`  ${url} — Status ${res.status}, ${text.length} bytes (not JSON)`);
          return { html: text, url };
        }
      } else {
        console.log(`  ${url} — Status ${res.status}`);
      }
    } catch (e) {
      console.log(`  ${url} — ${e.message.slice(0, 50)}`);
    }
  }
  return null;
}

// ======================= MAIN COLLECTOR =======================
async function collectAll() {
  console.log("=== Data Proxy Collector ===");
  console.log(`App: ${APP_URL}`);
  console.log(`Time (NPT): ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" })}`);
  console.log(`Market: ${isMarketHours() ? "OPEN" : "CLOSED"}`);

  const results = { nepalstock: null, nepsealpha: null, pushed: false };

  // Collect from NEPSE Stock
  const nsData = await scrapeNepalStockLive();
  results.nepalstock = nsData ? { status: "ok", type: Array.isArray(nsData) ? "json" : "html" } : { status: "failed" };

  // Collect from NepseAlpha
  const naData = await scrapeNepseAlphaLive();
  results.nepsealpha = naData ? { status: "ok" } : { status: "failed" };

  // Push to app
  if (nsData || naData) {
    const pushResult = await postToApp("/api/data-collector", {
      timestamp: new Date().toISOString(),
      source: "data-proxy",
      nepalstock: nsData,
      nepsealpha: naData,
    });
    results.pushed = pushResult.status === 200;
    console.log(`\nPush to app: ${results.pushed ? "OK" : "FAILED"} — ${pushResult.message || ""}`);
  }

  return results;
}

async function watchMode() {
  console.log("=== DATA PROXY WATCH MODE ===");
  console.log("Running every 3 minutes during market hours...\n");
  let cycle = 0;
  while (true) {
    cycle++;
    console.log(`\n[Cycle ${cycle}] ${new Date().toLocaleString()}`);
    if (isMarketHours()) {
      await collectAll();
    } else {
      console.log("Market closed. Sleeping 5 min...");
    }
    await sleep(180_000); // 3 min
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--watch")) {
    await watchMode();
    return;
  }

  if (args.includes("--stock")) {
    const symbol = args[args.indexOf("--stock") + 1] || "NABIL";
    const data = await scrapeNepseAlphaStock(symbol.toUpperCase());
    if (data) {
      await postToApp("/api/data-collector", {
        timestamp: new Date().toISOString(),
        source: "data-proxy",
        stock: data,
      });
    }
    return;
  }

  await collectAll();
}

main().catch(console.error);
