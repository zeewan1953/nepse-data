const sqlite = require('better-sqlite3');
const db = new sqlite('data/darisir.db');
const d = db.prepare('SELECT DISTINCT tradeDate FROM stock_daily_ohlcv ORDER BY tradeDate DESC').all();
console.log('dates:', d.map(x => x.tradeDate).join(', '));
const j = db.prepare(`SELECT COUNT(*) as cnt FROM stock_daily_ohlcv o JOIN stock_sector_mapping m ON o.symbol = m.symbol WHERE o.tradeDate = ?`).all(d[0].tradeDate);
console.log('joined rows:', j[0].cnt);
const no = db.prepare('SELECT COUNT(*) as cnt FROM stock_daily_ohlcv WHERE tradeDate = ?').all(d[0].tradeDate);
console.log('total ohlcv:', no[0].cnt);
