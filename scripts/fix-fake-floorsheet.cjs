const sqlite3 = require('better-sqlite3');
const db = new sqlite3('data/darisir.db');

// Check which dates have unique vs duplicated data
const dates = db.prepare('SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate').all().map(r => r.tradeDate);

console.log('=== Checking data uniqueness ===');
const crypto = require('crypto');
const dateHashes = [];
dates.forEach(d => {
  const rows = db.prepare('SELECT contractQuantity, contractAmount, buyerMemberId, sellerMemberId, stockSymbol, tradeOrder FROM floorsheet_trades WHERE tradeDate = ? ORDER BY tradeOrder').all(d);
  const hash = crypto.createHash('md5').update(JSON.stringify(rows)).digest('hex');
  dateHashes.push({ date: d, hash, count: rows.length });
  console.log('  ' + d + ': ' + rows.length + ' rows, hash=' + hash.substring(0, 12));
});

// Find unique hashes
const uniqueHashes = [...new Set(dateHashes.map(d => d.hash))];
console.log('\n  Unique data sets: ' + uniqueHashes.length);
uniqueHashes.forEach(h => {
  const matching = dateHashes.filter(d => d.hash === h).map(d => d.date);
  console.log('  hash=' + h.substring(0, 12) + ': dates=' + matching.join(', '));
});

// Keep only the LATEST date for each duplicate hash group
// For each hash, keep the last/most recent date and delete the rest
let totalDeleted = 0;
uniqueHashes.forEach(h => {
  const matching = dateHashes.filter(d => d.hash === h).sort((a, b) => a.date.localeCompare(b.date));
  if (matching.length > 1) {
    const keep = matching[matching.length - 1]; // keep latest
    const deleteList = matching.slice(0, -1);
    console.log('\n  For hash=' + h.substring(0, 12) + ': keeping ' + keep.date + ', deleting ' + deleteList.map(d => d.date).join(', '));
    
    deleteList.forEach(d => {
      // Delete from floorsheet_trades
      const delFs = db.prepare('DELETE FROM floorsheet_trades WHERE tradeDate = ?').run(d.date);
      console.log('    Deleted ' + delFs.changes + ' floorsheet_trades rows for ' + d.date);
      totalDeleted += delFs.changes;
      
      // Delete from broker_daily_agg
      const delAgg = db.prepare('DELETE FROM broker_daily_agg WHERE tradeDate = ?').run(d.date);
      console.log('    Deleted ' + delAgg.changes + ' broker_daily_agg rows for ' + d.date);
    });
  }
});

console.log('\n=== After cleanup ===');
const remaining = db.prepare('SELECT tradeDate, COUNT(*) as cnt FROM floorsheet_trades GROUP BY tradeDate ORDER BY tradeDate').all();
console.log('Remaining floorsheet_trades data:');
remaining.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' rows'));
const aggRemaining = db.prepare('SELECT tradeDate, COUNT(*) as cnt FROM broker_daily_agg GROUP BY tradeDate ORDER BY tradeDate').all();
console.log('Remaining broker_daily_agg data:');
aggRemaining.forEach(r => console.log('  ' + r.tradeDate + ': ' + r.cnt + ' rows'));

console.log('\nTotal rows deleted: ' + totalDeleted);
db.close();
