const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'darisir.db');
const db = createClient({ url: `file:${dbPath}` });

async function checkData() {
  const r = await db.execute('SELECT tradeDate, COUNT(*) as cnt FROM floorsheet_trades GROUP BY tradeDate ORDER BY tradeDate DESC');
  console.log('Floorsheet data by date:');
  r.rows.forEach(row => console.log(`  ${row.tradeDate}: ${row.cnt} trades`));
  
  const sample = await db.execute({
    sql: 'SELECT * FROM floorsheet_trades WHERE tradeDate = ? LIMIT 5',
    args: ['2026-06-23'],
  });
  console.log('\nSample trades:');
  console.log(JSON.stringify(sample.rows, null, 2));
  
  await db.close();
}

checkData().catch(console.error);
