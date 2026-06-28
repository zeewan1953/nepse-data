import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:data/darisir.db' });

const r = await db.execute("SELECT tradeDate, stockSymbol, buyQty, buyAmt, sellQty, sellAmt FROM broker_daily_agg WHERE brokerId = '93' ORDER BY tradeDate");
console.log('Broker 93 in broker_daily_agg:', JSON.stringify(r.rows, null, 2));

const r2 = await db.execute("SELECT tradeDate, stockSymbol, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE buyerMemberId = '93' OR sellerMemberId = '93' LIMIT 20");
console.log('Broker 93 in floorsheet_trades:', JSON.stringify(r2.rows, null, 2));
