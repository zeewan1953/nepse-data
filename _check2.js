const sqlite = require('better-sqlite3');
const db = new sqlite('data/darisir.db');
const cols = db.prepare('PRAGMA table_info(stock_daily_ohlcv)').all();
console.log('OHLCV columns:', cols.map(c => c.name).join(', '));
const s = db.prepare('SELECT * FROM stock_daily_ohlcv LIMIT 3').all();
console.log('sample:', JSON.stringify(s, null, 2));
const sectors = db.prepare(`SELECT m.sector, COUNT(*) AS cnt FROM stock_daily_ohlcv o JOIN stock_sector_mapping m ON o.symbol = m.symbol WHERE o.tradeDate = '2026/06/26 03:00:00' AND o.open > 0 GROUP BY m.sector`).all();
console.log('sectors found:', sectors.length, sectors.map(s => s.sector).join(', '));
