import Database from "better-sqlite3";
const db = new Database("data/darisir.db");
db.pragma("journal_mode = WAL");

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log("Tables:", tables.map(t => t.name));

const brokerCount = db.prepare("SELECT COUNT(*) as c FROM merolagani_broker_daily").get();
console.log("Broker records:", brokerCount.c);

const dates = db.prepare("SELECT DISTINCT tradeDate FROM merolagani_broker_daily ORDER BY tradeDate").all();
console.log("Dates:", dates.map(d => d.tradeDate));

const sample = db.prepare("SELECT * FROM merolagani_broker_daily LIMIT 3").all();
console.log("Sample:", JSON.stringify(sample, null, 2));

// Check floorsheet_trades
const ftCount = db.prepare("SELECT COUNT(*) as c FROM floorsheet_trades").get();
console.log("Floorsheet trades:", ftCount.c);

// Check broker_daily_agg
const baCount = db.prepare("SELECT COUNT(*) as c FROM broker_daily_agg").get();
console.log("Broker daily agg:", baCount.c);

// Check live_ohlc
const loCount = db.prepare("SELECT COUNT(*) as c FROM live_ohlc").get();
console.log("Live OHLC:", loCount.c);

db.close();
