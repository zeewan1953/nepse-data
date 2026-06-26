/**
 * Probe MeroLagani's "previous day" pointer cutover time.
 * Runs every 30 min from market close (15:00 NPT) through next morning (11:00 NPT).
 * Logs the returned broker.date each time to determine exactly when
 * the pointer advances to the next trading day.
 *
 * Usage: node scripts/probe-merolagani-cutover.mjs
 * Run on a normal trading day after market close.
 * Output is appended to probe-merolagani-cutover.log
 */
import { writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";

const LOG = join(process.cwd(), "probe-merolagani-cutover.log");
const URL = "https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary";
const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://merolagani.com/MarketSummary.aspx",
};

function nptNow() {
  return new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });
}

function log(msg) {
  const line = `[${nptNow()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
}

async function probe() {
  if (!existsSync(LOG)) {
    writeFileSync(LOG, `=== MeroLagani Cutover Probe ===\nStarted: ${nptNow()}\n\n`);
  }

  log("Probe tick...");
  try {
    const res = await fetch(URL, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      log(`  HTTP ${res.status} ${res.statusText}`);
      return "HTTP_ERROR";
    }
    const data = await res.json();
    const brokerDate = data?.broker?.date;
    const marketDate = data?.marketDate || data?.overall?.d || "?";
    const brokerCount = data?.broker?.detail?.length ?? 0;
    log(`  broker.date="${brokerDate}"  marketDate="${marketDate}"  brokers=${brokerCount}  status=${data?.mt}`);
    return brokerDate;
  } catch (e) {
    log(`  FETCH FAILED: ${e.message}`);
    return "FETCH_ERROR";
  }
}

// Schedule: every 30 min from 15:00 to 11:00 next day = ~20 iterations
const INTERVAL_MS = 30 * 60 * 1000;
const DURATION_MS = 20 * 60 * 60 * 1000; // 20 hours
const startTime = Date.now();

log("Probe started — will run every 30 min for 20 hours");
probe(); // first tick immediately

const intervalId = setInterval(async () => {
  if (Date.now() - startTime > DURATION_MS) {
    clearInterval(intervalId);
    log("\n=== Probe complete ===");
    process.exit(0);
  }
  await probe();
}, INTERVAL_MS);

process.on("SIGINT", () => {
  log("\n=== Probe interrupted ===");
  process.exit(1);
});
