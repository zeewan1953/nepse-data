const sqlite3 = require('better-sqlite3');
const db = new sqlite3('data/darisir.db');

// Find remaining non-standard dates
const bad = db.prepare("SELECT DISTINCT tradeDate FROM stock_daily_ohlcv WHERE tradeDate LIKE '%/%'").all();
if (bad.length === 0) { console.log('No bad dates found'); db.close(); return; }

console.log('Found ' + bad.length + ' bad dates:');
bad.forEach(r => console.log('  "' + r.tradeDate + '"'));

bad.forEach(r => {
  const oldDate = r.tradeDate;
  const parts = oldDate.split(' ')[0].split('/');
  const newDate = parts[0] + '-' + parts[1] + '-' + parts[2];
  const rows = db.prepare('SELECT symbol FROM stock_daily_ohlcv WHERE tradeDate = ?').all(oldDate);
  console.log('  ' + rows.length + ' rows for "' + oldDate + '" -> "' + newDate + '"');
  let merged = 0, deleted = 0;
  rows.forEach(row => {
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM stock_daily_ohlcv WHERE tradeDate = ? AND symbol = ?').get(newDate, row.symbol);
    if (existing.cnt === 0) {
      db.prepare('UPDATE stock_daily_ohlcv SET tradeDate = ? WHERE tradeDate = ? AND symbol = ?').run(newDate, oldDate, row.symbol);
      merged++;
    } else {
      db.prepare('DELETE FROM stock_daily_ohlcv WHERE tradeDate = ? AND symbol = ?').run(oldDate, row.symbol);
      deleted++;
    }
  });
  console.log('    merged=' + merged + ' deleted=' + deleted);
});

const remain = db.prepare("SELECT DISTINCT tradeDate FROM stock_daily_ohlcv WHERE tradeDate LIKE '%/%'").all();
console.log('\nRemaining bad dates: ' + remain.length);

const dates = db.prepare('SELECT tradeDate, COUNT(*) as cnt FROM stock_daily_ohlcv GROUP BY tradeDate ORDER BY tradeDate').all();
console.log('All dates:');
dates.forEach(d => console.log('  ' + d.tradeDate + ': ' + d.cnt + ' stocks'));

console.log('\nTotal OHLCV rows: ' + db.prepare('SELECT COUNT(*) as c FROM stock_daily_ohlcv').get().c);
console.log('Total stocks: ' + db.prepare('SELECT COUNT(DISTINCT symbol) as c FROM stock_daily_ohlcv').get().c);
console.log('Max days per stock: ' + db.prepare('SELECT MAX(c) FROM (SELECT COUNT(*) as c FROM stock_daily_ohlcv GROUP BY symbol)').get()['MAX(c)']);
console.log('Min days per stock: ' + db.prepare('SELECT MIN(c) FROM (SELECT COUNT(*) as c FROM stock_daily_ohlcv GROUP BY symbol)').get()['MIN(c)']);

db.close();
