import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:data/darisir.db' });

const schema = await db.execute("SELECT sql FROM sqlite_master WHERE name='broker_daily_agg'");
console.log('Schema:', schema.rows[0]?.sql);

const sample = await db.execute('SELECT * FROM broker_daily_agg LIMIT 5');
console.log('Sample rows:', JSON.stringify(sample.rows, null, 2));

const check = await db.execute("SELECT COUNT(*) as total, SUM(CASE WHEN ABS(buyAmt - sellAmt) < 1 THEN 1 ELSE 0 END) as equal FROM broker_daily_agg");
console.log('Buy==Sell check:', JSON.stringify(check.rows, null, 2));

const dates = await db.execute('SELECT DISTINCT tradeDate FROM broker_daily_agg ORDER BY tradeDate');
console.log('Dates:', dates.rows.map(r => r.tradeDate));
