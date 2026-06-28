import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:data/darisir.db' });

// Check MeroLagani data for broker 61
const r = await db.execute("SELECT tradeDate, purchaseAmt, sellAmt, netAmt, totalAmt FROM merolagani_broker_daily WHERE brokerCode = '61' ORDER BY tradeDate");
console.log('Broker 61 MeroLagani:', JSON.stringify(r.rows, null, 2));

// Check floorsheet total for broker 61 on 06-28
const r2 = await db.execute("SELECT SUM(contractQuantity) as qty, SUM(contractAmount) as amt FROM floorsheet_trades WHERE (buyerMemberId = '61' OR sellerMemberId = '61') AND tradeDate = '2026-06-28'");
console.log('Broker 61 floorsheet 06-28 total:', JSON.stringify(r2.rows, null, 2));

// Check floorsheet buy/sell breakdown for broker 61 on 06-28
const r3 = await db.execute("SELECT 'buy' as side, SUM(contractQuantity) as qty, SUM(contractAmount) as amt FROM floorsheet_trades WHERE buyerMemberId = '61' AND tradeDate = '2026-06-28' UNION ALL SELECT 'sell', SUM(contractQuantity), SUM(contractAmount) FROM floorsheet_trades WHERE sellerMemberId = '61' AND tradeDate = '2026-06-28'");
console.log('Broker 61 floorsheet 06-28 buy vs sell:', JSON.stringify(r3.rows, null, 2));

// Count distinct trade dates in floorsheet_trades
const r4 = await db.execute("SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate");
console.log('Floorsheet dates:', r4.rows.map(r => r.tradeDate));
