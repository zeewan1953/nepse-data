const db = require('better-sqlite3')('data/darisir.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Check if users table exists
const usersTable = tables.find(t => t.name === 'users');
if (usersTable) {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  console.log('\nUsers columns:', cols.map(c => c.name).join(', '));
}
