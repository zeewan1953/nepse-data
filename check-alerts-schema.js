const db = require('better-sqlite3')('data/darisir.db');

const tables = ['user_alerts', 'alert_trigger_log', 'push_subscriptions'];

tables.forEach(tableName => {
  console.log(`\n=== ${tableName} ===`);
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  cols.forEach(col => {
    console.log(`  ${col.name} | ${col.type} | ${col.notnull ? 'NOT NULL' : 'NULL'} | ${col.pk ? 'PRIMARY KEY' : ''}`);
  });
});
