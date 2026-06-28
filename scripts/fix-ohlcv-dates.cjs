const sqlite3 = require('better-sqlite3');
const db = new sqlite3('data/darisir.db');

console.log('=== Fixing non-standard date formats in stock_daily_ohlcv ===');

// Find non-standard dates
const badDates = db.prepare("SELECT DISTINCT tradeDate FROM stock_daily_ohlcv WHERE tradeDate LIKE '%/%'").all();
console.log('Non-standard dates found:');
badDates.forEach(r => console.log('  "' + r.tradeDate + '"'));

// Update them to YYYY-MM-DD format
badDates.forEach(r => {
  const oldDate = r.tradeDate;
  // "2026/06/25 03:00:00" -> "2026-06-25"
  const parts = oldDate.split(' ')[0].split('/');
  if (parts.length === 3) {
    const newDate = parts[0] + '-' + parts[1] + '-' + parts[2];
    console.log('  Converting "' + oldDate + '" -> "' + newDate + '"');
    
    // Check if target date already exists
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM stock_daily_ohlcv WHERE tradeDate = ? AND symbol = ?').get(newDate, 'NABIL');
    // For safety, merge by keeping the first occurrence
    const dupRows = db.prepare('SELECT * FROM stock_daily_ohlcv WHERE tradeDate = ?').all(oldDate);
    let merged = 0;
    dupRows.forEach(row => {
      const existingRow = db.prepare('SELECT COUNT(*) as cnt FROM stock_daily_ohlcv WHERE tradeDate = ? AND symbol = ?').get(newDate, row.symbol);
      if (existingRow.cnt === 0) {
        db.prepare('UPDATE stock_daily_ohlcv SET tradeDate = ? WHERE tradeDate = ? AND symbol = ?').run(newDate, oldDate, row.symbol);
        merged++;
      } else {
        // Delete duplicate
        db.prepare('DELETE FROM stock_daily_ohlcv WHERE tradeDate = ? AND symbol = ?').run(oldDate, row.symbol);
        merged++;
      }
    });
    console.log('    Merged ' + merged + ' rows');
  }
});

// Verify
const remainingBad = db.prepare("SELECT DISTINCT tradeDate FROM stock_daily_ohlcv WHERE tradeDate LIKE '%/%'").all();
console.log('\nRemaining non-standard dates: ' + remainingBad.length);

const allDates = db.prepare('SELECT DISTINCT tradeDate FROM stock_daily_ohlcv ORDER BY tradeDate').all();
console.log('\nAll dates now:');
allDates.forEach(r => console.log('  ' + r.tradeDate));

// Show row counts
console.log('\n=== stock_daily_ohlcv by date ===');
const counts = db.prepare('SELECT tradeDate, COUNT(*) as cnt FROM stock_daily_ohlcv GROUP BY tradeDate ORDER BY tradeDate').all();
counts.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' stocks'));

db.close();
