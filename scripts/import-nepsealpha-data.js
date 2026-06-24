// Import floorsheet data from nepsealpha/nepalstock into SQLite
// Run: node scripts/import-nepsealpha-data.js

const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'darisir.db');
const db = createClient({ url: `file:${dbPath}` });

// Sample data structure from nepsealpha/nepalstock
const sampleData = [
  // This will be populated with actual scraped data
];

async function importFloorsheetData(data, tradeDate = '2026-06-22') {
  console.log(`Importing ${data.length} floorsheet rows for ${tradeDate}...`);
  
  let imported = 0;
  let skipped = 0;
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO floorsheet_trades 
              (tradeDate, contractNumber, stockSymbol, buyerMemberId, sellerMemberId, 
               contractQuantity, contractRate, contractAmount, tradeOrder, tradeTime)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          tradeDate,
          row.contractNo || `CONTRACT_${i}`,
          row.symbol,
          String(row.buyerBroker),
          String(row.sellerBroker),
          row.quantity,
          row.rate,
          row.amount,
          i + 1,
          new Date().toTimeString().split(' ')[0],
        ],
      });
      imported++;
    } catch (e) {
      skipped++;
      if (skipped < 5) {
        console.log(`Skipped row ${i}:`, e.message);
      }
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Skipped: ${skipped}`);
  
  // Verify
  const verify = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM floorsheet_trades WHERE tradeDate = ?`,
    args: [tradeDate],
  });
  console.log(`   Total in DB for ${tradeDate}: ${verify.rows[0]?.cnt}`);
  
  return { imported, skipped };
}

// Example usage
async function main() {
  console.log('=== NEPSE Alpha Floorsheet Import ===\n');
  
  // Check current data
  const current = await db.execute({
    sql: `SELECT tradeDate, COUNT(*) as cnt FROM floorsheet_trades GROUP BY tradeDate ORDER BY tradeDate DESC LIMIT 5`,
  });
  
  console.log('Current floorsheet data:');
  current.rows.forEach(r => {
    console.log(`  ${r.tradeDate}: ${r.cnt} rows`);
  });
  console.log('');
  
  // If you have data to import, call importFloorsheetData(data, '2026-06-22')
  if (sampleData.length > 0) {
    await importFloorsheetData(sampleData, '2026-06-22');
  } else {
    console.log('No sample data to import. Modify sampleData array with actual scraped data.');
  }
  
  await db.close();
}

main().catch(console.error);
