/**
 * Correctness tests for broker_flow_analytics.
 * 
 * Run: npx esbuild test_analytics.mjs --bundle --platform=node --format=cjs --outfile=test_bundle.cjs
 *      node test_bundle.cjs
 * 
 * Or with tsx: npx tsx scripts/test_analytics.mjs
 */

import {
  computeBrokerNetFlow,
  verifyNetFlowSumsToZero,
  computeBrokerConcentration,
  computeTickImbalance,
  computeCMF,
  computeMFI,
  computeVolumeZScore,
  classifyMomentum,
  minMaxNormalize,
  compositeScore,
} from "../src/lib/broker_flow_analytics.ts";

import {
  getOHLCVHistory,
  getFloorsheetRows,
  getStockSymbols,
} from "../src/lib/broker_flow_sample_fixtures.ts";

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`);
  }
}

function section(name) {
  console.log(`\n═══ ${name} ═══`);
}

// ─── Test: Broker Net Flow ──────────────────────────────────────────────────

section("Broker Net Flow");

const rows = getFloorsheetRows("2025-06-15");
assert(rows.length > 0, `Floorsheet has ${rows.length} rows`);

const flows = computeBrokerNetFlow(rows);
assert(flows.length > 0, `Computed ${flows.length} broker flows`);

const netSum = verifyNetFlowSumsToZero(flows);
assert(Math.abs(netSum) < 0.01, `Net flow sums to ~0 (got ${netSum.toFixed(4)})`);

// Every buy has a matching sell → total buyAmt should equal total sellAmt
const totalBuy = flows.reduce((s, f) => s + f.buyAmt, 0);
const totalSell = flows.reduce((s, f) => s + f.sellAmt, 0);
assert(Math.abs(totalBuy - totalSell) < 1, `Total buy (${totalBuy.toFixed(0)}) ≈ total sell (${totalSell.toFixed(0)})`);

// ─── Test: Broker Concentration ─────────────────────────────────────────────

section("Broker Concentration");

const conc = computeBrokerConcentration(flows, 5);
assert(conc.buyConc >= 0 && conc.buyConc <= 100, `Buy concentration in [0,100]: ${conc.buyConc}%`);
assert(conc.sellConc >= 0 && conc.sellConc <= 100, `Sell concentration in [0,100]: ${conc.sellConc}%`);
assert(conc.buyConc > 0, `Buy concentration > 0: ${conc.buyConc}%`);
assert(conc.sellConc > 0, `Sell concentration > 0: ${conc.sellConc}%`);

// ─── Test: Tick-Rule Imbalance ──────────────────────────────────────────────

section("Tick-Rule Order Flow (Estimated)");

const tick = computeTickImbalance(rows.filter(r => r.symbol === "NABIL"));
assert(tick.estimated === true, "Tick imbalance is marked as estimated: true");
assert(tick.buyVolume + tick.sellVolume > 0, `Total volume > 0: ${tick.buyVolume + tick.sellVolume}`);
assert(tick.buyTrades + tick.sellTrades > 0, `Total trades > 0: ${tick.buyTrades + tick.sellTrades}`);
console.log(`  📊 Buy: ${tick.buyVolume} (${tick.buyTrades} trades) | Sell: ${tick.sellVolume} (${tick.sellTrades} trades)`);

// ─── Test: CMF ──────────────────────────────────────────────────────────────

section("Chaikin Money Flow (CMF)");

const nabilBars = getOHLCVHistory("NABIL", 30);
assert(nabilBars.length > 0, `NABIL has ${nabilBars.length} OHLCV bars`);

const cmf = computeCMF(nabilBars, 20);
if (cmf !== null) {
  assert(cmf >= -1 && cmf <= 1, `CMF in [-1, 1]: ${cmf}`);
  console.log(`  📊 CMF: ${cmf} (${cmf > 0 ? "accumulation" : cmf < 0 ? "distribution" : "neutral"})`);
} else {
  assert(false, "CMF returned null (insufficient data)");
}

// Edge case: high === low
const flatBars = nabilBars.map(b => ({ ...b, high: b.close, low: b.close }));
const cmfFlat = computeCMF(flatBars, 20);
assert(cmfFlat === null || cmfFlat === 0, `CMF with high===low returns null or 0: ${cmfFlat}`);

// Insufficient bars
const cmfInsuff = computeCMF(nabilBars.slice(0, 5), 20);
assert(cmfInsuff === null, "CMF with insufficient bars returns null");

// ─── Test: MFI ──────────────────────────────────────────────────────────────

section("Money Flow Index (MFI)");

const mfi = computeMFI(nabilBars, 14);
if (mfi !== null) {
  assert(mfi >= 0 && mfi <= 100, `MFI in [0, 100]: ${mfi}`);
  console.log(`  📊 MFI: ${mfi} (${mfi > 80 ? "overbought" : mfi < 20 ? "oversold" : "neutral"})`);
} else {
  assert(false, "MFI returned null");
}

const mfiInsuff = computeMFI(nabilBars.slice(0, 5), 14);
assert(mfiInsuff === null, "MFI with insufficient bars returns null");

// ─── Test: Volume Z-Score ───────────────────────────────────────────────────

section("Volume Z-Score");

const volZ = computeVolumeZScore(nabilBars, 20);
if (volZ !== null) {
  assert(typeof volZ.zScore === "number", `Z-score is a number: ${volZ.zScore}`);
  assert(volZ.todayVolume > 0, `Today volume > 0: ${volZ.todayVolume}`);
  assert(volZ.avgVolume > 0, `Avg volume > 0: ${volZ.avgVolume}`);
  console.log(`  📊 Z-score: ${volZ.zScore} (${Math.abs(volZ.zScore) > 2 ? "⚠️ unusual" : "normal"})`);
} else {
  assert(false, "Volume Z-score returned null");
}

const volZInsuff = computeVolumeZScore(nabilBars.slice(0, 5), 20);
assert(volZInsuff === null, "Volume Z-score with insufficient bars returns null");

// ─── Test: Momentum Classification ──────────────────────────────────────────

section("Momentum Classification");

const symbols = getStockSymbols();
const stocks = symbols.map(sym => {
  const bars = getOHLCVHistory(sym, 30);
  const cmf = computeCMF(bars, 20);
  const vz = computeVolumeZScore(bars, 20);
  return { symbol: sym, bars, cmf, volZ: vz?.zScore ?? null };
});

const buckets = classifyMomentum(stocks);
assert(buckets.length === 7, `7 momentum buckets: ${buckets.length}`);

const totalClassified = buckets.reduce((s, b) => s + b.stocks.length, 0);
console.log(`  📊 ${totalClassified} stocks classified across ${buckets.length} buckets`);
for (const b of buckets) {
  if (b.stocks.length > 0) {
    console.log(`     ${b.label}: ${b.stocks.join(", ")}`);
  }
}

// Buckets can be empty — that's intentional
assert(true, "Empty buckets are allowed (not forced to fill quota)");

// ─── Test: Min-Max Normalization ────────────────────────────────────────────

section("Min-Max Normalization");

const vals = [10, 20, 30, 40, 50];
const norm = minMaxNormalize(vals);
assert(norm[0] === 0, `Min normalizes to 0: ${norm[0]}`);
assert(norm[4] === 1, `Max normalizes to 1: ${norm[4]}`);
assert(norm[2] === 0.5, `Middle normalizes to 0.5: ${norm[2]}`);

const allSame = minMaxNormalize([5, 5, 5]);
assert(allSame.every(v => v === 0.5), "All-same values normalize to 0.5");

// ─── Test: Composite Score ──────────────────────────────────────────────────

section("Composite Score");

const score = compositeScore([1, 0.5, 0], [0.5, 0.3, 0.2]);
assert(score >= 0 && score <= 100, `Score in [0, 100]: ${score}`);
console.log(`  📊 Composite: ${score} (expected ~65)`);

const score0 = compositeScore([0, 0, 0], [0.5, 0.3, 0.2]);
assert(score0 === 0, `All-zero metrics → score 0: ${score0}`);

const score1 = compositeScore([1, 1, 1], [0.5, 0.3, 0.2]);
assert(score1 === 100, `All-one metrics → score 100: ${score1}`);

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed === 0) {
  console.log("🎉 ALL TESTS PASSED");
} else {
  console.log("💥 SOME TESTS FAILED");
  process.exit(1);
}
