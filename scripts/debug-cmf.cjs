const sqlite3 = require('better-sqlite3');
const db = new sqlite3('data/darisir.db');

// Simulate what stock-wise API does for NABIL
const symbols = ['NABIL'];
const ohlcvRows = db.prepare(
  `SELECT symbol, tradeDate, open, high, low, close, volume FROM stock_daily_ohlcv 
   WHERE symbol IN (${symbols.map(() => '?').join(',')}) 
   ORDER BY symbol, tradeDate DESC`
).all(...symbols);

console.log('OHLCV rows for NABIL: ' + ohlcvRows.length);
ohlcvRows.forEach(r => console.log(
  r.tradeDate + ' O=' + r.open + ' H=' + r.high + ' L=' + r.low + ' C=' + r.close + ' V=' + r.volume
));

// Group by symbol
const ohlcvMap = new Map();
for (const r of ohlcvRows) {
  const sym = String(r.symbol);
  if (!ohlcvMap.has(sym)) ohlcvMap.set(sym, []);
  ohlcvMap.get(sym).push({
    date: String(r.tradeDate),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  });
}

// For NABIL
const ohlcv = ohlcvMap.get('NABIL') || [];
console.log('\nGrouped OHLCV: ' + ohlcv.length + ' bars');
const ohlcvAsc = [...ohlcv].reverse();
console.log('After reverse: ' + ohlcvAsc.length + ' bars');

// Test computeCMF
function computeCMF(bars, period = 7) {
  console.log('computeCMF: bars=' + bars.length + ' period=' + period);
  if (bars.length < period) { console.log('  -> null (insufficient bars)'); return null; }
  const slice = bars.slice(-period);
  let mfvSum = 0, volSum = 0;
  for (const b of slice) {
    const range = b.high - b.low;
    console.log('  bar: date=' + b.date + ' H=' + b.high + ' L=' + b.low + ' C=' + b.close + ' V=' + b.volume + ' range=' + range);
    if (range <= 0) continue;
    const mfm = ((b.close - b.low) - (b.high - b.close)) / range;
    mfvSum += mfm * b.volume;
    volSum += b.volume;
  }
  if (volSum === 0) { console.log('  -> null (volSum=0)'); return null; }
  const cmf = mfvSum / volSum;
  console.log('  -> CMF=' + cmf + ' (mfvSum=' + mfvSum + ' volSum=' + volSum + ')');
  return Math.max(-1, Math.min(1, Math.round(cmf * 1000) / 1000));
}

const cmfVal = computeCMF(ohlcvAsc, 7);
console.log('\nCMF for NABIL: ' + cmfVal);

function computeMFI(bars, period = 5) {
  console.log('\ncomputeMFI: bars=' + bars.length + ' period=' + period);
  if (bars.length < period + 1) { console.log('  -> null'); return null; }
  const slice = bars.slice(-(period + 1));
  let posFlow = 0, negFlow = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    const prevTP = (prev.high + prev.low + prev.close) / 3;
    const currTP = (curr.high + curr.low + curr.close) / 3;
    const rawMF = currTP * curr.volume;
    if (currTP > prevTP) posFlow += rawMF;
    else if (currTP < prevTP) negFlow += rawMF;
  }
  if (negFlow === 0) return posFlow > 0 ? 100 : 50;
  const ratio = posFlow / negFlow;
  return Math.round((100 - 100 / (1 + ratio)) * 100) / 100;
}

const mfiVal = computeMFI(ohlcvAsc, 5);
console.log('MFI for NABIL: ' + mfiVal);

function computeVolumeZScore(bars, lookback = 7) {
  console.log('\ncomputeVolumeZScore: bars=' + bars.length + ' lookback=' + lookback);
  if (bars.length < lookback + 1) { console.log('  -> null'); return null; }
  const historical = bars.slice(-(lookback + 1), -1);
  const today = bars[bars.length - 1];
  const avg = historical.reduce((s, b) => s + b.volume, 0) / historical.length;
  if (avg === 0) return null;
  const variance = historical.reduce((s, b) => s + (b.volume - avg) ** 2, 0) / historical.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return { zScore: 0, todayVolume: today.volume, avgVolume: avg };
  return {
    zScore: Math.round(((today.volume - avg) / stddev) * 100) / 100,
    todayVolume: today.volume,
    avgVolume: Math.round(avg),
  };
}

const volZVal = computeVolumeZScore(ohlcvAsc, 7);
console.log('VolZ for NABIL: ' + JSON.stringify(volZVal));

db.close();
