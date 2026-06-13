import { createClient } from "@libsql/client";

async function run() {
  const db = createClient({
    url: "file:data/darisir.db",
  });
  
  try {
    const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
    console.log("Tables in database:", result.rows.map(r => r.name));
    
    // Check if tables have columns, count some rows
    for (const table of result.rows.map(r => r.name)) {
      const countResult = await db.execute(`SELECT COUNT(*) as cnt FROM "${table}"`);
      console.log(`Table: ${table}, Row Count: ${countResult.rows[0].cnt}`);
    }
  } catch (err) {
    console.error("Error inspecting database:", err);
  }
}

run();
