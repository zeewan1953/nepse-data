import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:data/darisir.db' });

// Check which dates are non-trading days (Fri/Sat in Nepal)
const dates = await db.execute("SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate");
console.log('Current floorsheet dates:', dates.rows.map(r => {
  const d = new Date(r.tradeDate + 'T12:00:00+05:45');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${r.tradeDate} (${days[d.getDay()]})`;
}));

// 2026-06-27 is Saturday (non-trading day) - data should be removed
// First check counts
const badCount = await db.execute("SELECT COUNT(*) as cnt FROM floorsheet_trades WHERE tradeDate = '2026-06-27'");
console.log('Rows to remove (2026-06-27 Sat):', badCount.rows[0].cnt);

const badAggCount = await db.execute("SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE tradeDate = '2026-06-27'");
console.log('Agg rows to remove (2026-06-27):', badAggCount.rows[0].cnt);

// Remove 2026-06-27 from floorsheet_trades
await db.execute("DELETE FROM floorsheet_trades WHERE tradeDate = '2026-06-27'");
console.log('Deleted 2026-06-27 from floorsheet_trades');

// Remove 2026-06-27 from broker_daily_agg
await db.execute("DELETE FROM broker_daily_agg WHERE tradeDate = '2026-06-27'");
console.log('Deleted 2026-06-27 from broker_daily_agg');

// Verify remaining dates
const remaining = await db.execute("SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate");
console.log('Remaining floorsheet dates:', remaining.rows.map(r => r.tradeDate));

const aggRemaining = await db.execute("SELECT DISTINCT tradeDate FROM broker_daily_agg ORDER BY tradeDate");
console.log('Remaining agg dates:', aggRemaining.rows.map(r => r.tradeDate));

// Check broker 61 data now
const r61 = await db.execute("SELECT tradeDate, stockSymbol, buyQty, buyAmt, sellQty, sellAmt FROM broker_daily_agg WHERE brokerId = '61' ORDER BY tradeDate");
console.log('Broker 61 after fix:', JSON.stringify(r61.rows, null, 2));
