import { createClient } from '@libsql/client';
import { copyFileSync } from 'fs';

const src = 'file:data/darisir.db';
const seed = 'seed/darisir.db';

// Copy data DB to seed
copyFileSync('data/darisir.db', 'seed/darisir.db');
console.log('Copied data/darisir.db → seed/darisir.db');

// Verify seed
const seedDb = createClient({ url: 'file:seed/darisir.db' });
const floorsheetDates = await seedDb.execute("SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate");
console.log('Seed floorsheet dates:', floorsheetDates.rows.map(r => r.tradeDate));
const aggDates = await seedDb.execute("SELECT DISTINCT tradeDate FROM broker_daily_agg ORDER BY tradeDate");
console.log('Seed agg dates:', aggDates.rows.map(r => r.tradeDate));
