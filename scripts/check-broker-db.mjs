import { open } from "sqlite";
import sqlite3 from "sqlite3";

async function checkDB() {
  const db = await open({
    filename: "./data/darisir.db",
    driver: sqlite3.Database,
  });

  console.log("=== Database Tables ===");
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
  tables.forEach(t => console.log(`- ${t.name}`));

  console.log("\n=== Broker Data ===");
  try {
    const brokerCount = await db.get("SELECT COUNT(*) as count FROM broker_daily_agg");
    console.log(`broker_daily_agg rows: ${brokerCount.count}`);
    
    const sampleData = await db.all("SELECT * FROM broker_daily_agg LIMIT 5");
    console.log("Sample data:", sampleData);
  } catch (err) {
    console.log("Error:", err.message);
  }

  console.log("\n=== Stock OHLCV Data ===");
  try {
    const ohlcvCount = await db.get("SELECT COUNT(*) as count FROM stock_daily_ohlcv");
    console.log(`stock_daily_ohlcv rows: ${ohlcvCount.count}`);
    
    const sampleOhlcv = await db.all("SELECT * FROM stock_daily_ohlcv LIMIT 3");
    console.log("Sample OHLCV:", sampleOhlcv);
  } catch (err) {
    console.log("Error:", err.message);
  }

  await db.close();
}

checkDB();
