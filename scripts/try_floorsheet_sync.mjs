const BASE = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

// Try syncing floorsheet for 2026-06-28
const res = await fetch(`${BASE}/api/floorsheet/sync?date=2026-06-28`, { cache: 'no-store' });
const data = await res.json();
console.log('Sync response:', JSON.stringify(data, null, 2));
