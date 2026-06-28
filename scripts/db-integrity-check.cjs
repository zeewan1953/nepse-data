const sqlite3 = require('better-sqlite3');
const db = new sqlite3('data/darisir.db');

console.log('===== DATABASE INTEGRITY CHECK =====\n');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables (' + tables.length + '):');
tables.forEach(t => console.log('  - ' + t.name));

console.log('\n=== Row counts ===');
tables.forEach(t => {
  const cnt = db.prepare('SELECT COUNT(*) as c FROM [' + t.name + ']').get();
  console.log('  ' + t.name + ': ' + cnt.c + ' rows');
});

console.log('\n=== floorsheet_trades ===');
const fsDates = db.prepare('SELECT tradeDate, COUNT(*) as cnt, SUM(contractQuantity) as qty, ROUND(SUM(contractAmount),2) as amt FROM floorsheet_trades GROUP BY tradeDate ORDER BY tradeDate').all();
fsDates.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' trades, ' + r.qty + ' qty, Rs ' + r.amt));

console.log('\n=== broker_daily_agg ===');
const baDates = db.prepare('SELECT tradeDate, COUNT(DISTINCT stockSymbol) as stocks, COUNT(DISTINCT brokerId) as brokers, SUM(buyQty) as bq, SUM(sellQty) as sq, ROUND(SUM(buyAmt),2) as ba, ROUND(SUM(sellAmt),2) as sa FROM broker_daily_agg GROUP BY tradeDate ORDER BY tradeDate').all();
baDates.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.stocks + ' stocks, ' + r.brokers + ' brokers, buy=' + r.bq + ' sell=' + r.sq + ', buyAmt=Rs' + r.ba + ' sellAmt=Rs' + r.sa + ', net=' + (r.ba - r.sa)));

console.log('\n=== merolagani_broker_daily ===');
const mbDates = db.prepare('SELECT tradeDate, COUNT(*) as cnt, ROUND(SUM(purchaseAmt),2) as pa, ROUND(SUM(sellAmt),2) as sa, ROUND(SUM(netAmt),2) as na FROM merolagani_broker_daily GROUP BY tradeDate ORDER BY tradeDate').all();
mbDates.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' brokers, purchase=Rs' + r.pa + ', sell=Rs' + r.sa + ', net=Rs' + r.na));

console.log('\n=== stock_daily_ohlcv ===');
const ohlcv = db.prepare('SELECT tradeDate, COUNT(*) as cnt FROM stock_daily_ohlcv GROUP BY tradeDate ORDER BY tradeDate').all();
ohlcv.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' stocks'));

console.log('\n=== sync_logs ===');
const logs = db.prepare('SELECT * FROM sync_logs ORDER BY ts DESC LIMIT 10').all();
logs.forEach(r => console.log('  ' + new Date(r.ts).toISOString() + ' | attempt=' + r.attempt + ' | phase=' + r.phase + ' | status=' + r.status + ' | detail=' + r.detail));

console.log('\n=== pipeline_run_log ===');
const prl = db.prepare('SELECT * FROM pipeline_run_log ORDER BY started_at DESC LIMIT 5').all();
prl.forEach(r => console.log('  ' + r.run_date + ' | pipeline=' + r.pipeline + ' | status=' + r.status + ' | rows=' + r.rows_written));

console.log('\n=== Floorsheet (buyQty+sellQty) vs broker_daily_agg cross-check ===');
const cross = db.prepare(`
  SELECT f.tradeDate, 
    ROUND(SUM(f.contractQuantity), 2) as fs_qty, 
    ROUND(SUM(f.contractAmount), 2) as fs_amt,
    ROUND(SUM(b.buyQty + b.sellQty), 2) as agg_qty,
    ROUND(SUM(b.buyAmt + b.sellAmt), 2) as agg_amt
  FROM floorsheet_trades f
  JOIN broker_daily_agg b ON f.tradeDate = b.tradeDate
  GROUP BY f.tradeDate
  ORDER BY f.tradeDate
`).all();
cross.forEach(r => console.log('  ' + r.tradeDate + ': fs_qty=' + r.fs_qty + ' agg_qty=' + r.agg_qty + ' fs_amt=' + r.fs_amt + ' agg_amt=' + r.agg_amt));

console.log('\n=== Broker daily agg vs merolagani netAmt sanity check ===');
const sanity = db.prepare(`
  SELECT b.tradeDate, 
    ROUND(SUM(b.buyAmt - b.sellAmt), 2) as agg_net,
    ROUND(SUM(m.netAmt), 2) as mero_net
  FROM broker_daily_agg b
  JOIN merolagani_broker_daily m ON b.tradeDate = m.tradeDate
  GROUP BY b.tradeDate
  ORDER BY b.tradeDate
`).all();
sanity.forEach(r => console.log('  ' + r.tradeDate + ': agg_net=' + r.agg_net + ' mero_net=' + r.mero_net));

console.log('\n=== Broker daily summary rows ===');
const bds = db.prepare('SELECT tradeDate, COUNT(*) as cnt FROM broker_daily_summary GROUP BY tradeDate ORDER BY tradeDate').all();
bds.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' rows'));

console.log('\n===== INTEGRITY CHECK COMPLETE =====');

// Quick validation
let errors = 0;
// Check buy=sell in broker_daily_agg
baDates.forEach(r => {
  if (r.bq !== r.sq) {
    console.log('  WARNING: ' + r.tradeDate + ' buyQty(' + r.bq + ') != sellQty(' + r.sq + ')');
    errors++;
  }
});
if (errors === 0) console.log('All trades balanced (buyQty == sellQty for all dates).');

db.close();
