const sqlite3 = require('better-sqlite3');
const crypto = require('crypto');
const db = new sqlite3('data/darisir.db');

console.log('=== Checking for identical floorsheet data across dates ===');
const dates = db.prepare('SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate').all().map(r => r.tradeDate);

let prevHash = null;
dates.forEach(d => {
  const rows = db.prepare('SELECT contractQuantity, contractAmount, buyerMemberId, sellerMemberId, stockSymbol FROM floorsheet_trades WHERE tradeDate = ? ORDER BY tradeOrder').all(d);
  const hash = crypto.createHash('md5').update(JSON.stringify(rows)).digest('hex');
  if (prevHash && hash === prevHash) {
    console.log('  DUPLICATE: ' + d + ' has IDENTICAL data to previous date');
  }
  prevHash = hash;
  console.log('  ' + d + ': ' + rows.length + ' rows, hash=' + hash.substring(0, 12));
});

console.log('\n=== stock_daily_ohlcv date formats ===');
const allDates = db.prepare('SELECT DISTINCT tradeDate FROM stock_daily_ohlcv ORDER BY tradeDate').all();
console.log('  All date values:');
allDates.forEach(r => {
  if (r.tradeDate.includes('/')) {
    console.log('  *** NON-STANDARD: "' + r.tradeDate + '"');
  } else {
    console.log('  ' + r.tradeDate);
  }
});

// Check specific dates with the same data
const sameDataDates = db.prepare('SELECT tradeDate, close, volume FROM stock_daily_ohlcv WHERE symbol = ? ORDER BY tradeDate').all('NABIL');
console.log('\n=== NABIL OHLCV across dates ===');
sameDataDates.forEach(r => console.log('  ' + r.tradeDate + ': close=' + r.close + ' volume=' + r.volume));

// Check intraday_candles
console.log('\n=== intraday_candles ===');
const icDates = db.prepare('SELECT DISTINCT tradeDate, COUNT(*) as cnt FROM intraday_candles GROUP BY tradeDate ORDER BY tradeDate').all();
icDates.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' candles'));

// Check live_ohlc
console.log('\n=== live_ohlc ===');
const liveDates = db.prepare('SELECT DISTINCT tradeDate, COUNT(*) as cnt FROM live_ohlc GROUP BY tradeDate ORDER BY tradeDate').all();
liveDates.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' rows'));

// Check broker_flow_cache
console.log('\n=== broker_flow_cache ===');
const bfc = db.prepare('SELECT * FROM broker_flow_cache LIMIT 5').all();
console.log('  Sample rows:');
bfc.forEach(r => console.log('  ' + JSON.stringify(r)));

db.close();
