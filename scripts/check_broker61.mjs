import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:data/darisir.db' });

const r = await db.execute("SELECT tradeDate, stockSymbol, buyQty, buyAmt, sellQty, sellAmt FROM broker_daily_agg WHERE brokerId = '61' ORDER BY tradeDate");
console.log('Broker 61 in broker_daily_agg:', JSON.stringify(r.rows, null, 2));

const total = await db.execute("SELECT SUM(buyQty) as totalBuy, SUM(sellQty) as totalSell FROM broker_daily_agg WHERE brokerId = '61' AND tradeDate = '2026-06-28'");
console.log('Broker 61 totals on 2026-06-28:', JSON.stringify(total.rows, null, 2));

// Check if the fs-stock API would return this
const r2 = await db.execute("SELECT stockSymbol, SUM(buyQty) as buyQty, SUM(sellQty) as sellQty FROM broker_daily_agg WHERE brokerId = '61' AND tradeDate = '2026-06-28' GROUP BY stockSymbol ORDER BY buyQty DESC");
console.log('Broker 61 stocks on 2026-06-28:', JSON.stringify(r2.rows, null, 2));
