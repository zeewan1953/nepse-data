const db = require('better-sqlite3')('data/darisir.db');

console.log('🧪 Creating Test Notifications...\n');

// Create a test user
const testUserId = 'test-user-001';
db.prepare(`
  INSERT OR IGNORE INTO users (id, email, name, passwordHash, verified, createdAt)
  VALUES (?, ?, ?, ?, 1, ?)
`).run(testUserId, 'test@example.com', 'Test User', 'test', Date.now());

console.log('✅ Test user created:', testUserId);

// Create test alerts
const testAlerts = [
  {
    user_id: testUserId,
    alert_type: 'price',
    symbol: 'NABIL',
    condition: 'above',
    threshold: 1000,
    is_active: 1,
    created_at: Date.now(),
  },
  {
    user_id: testUserId,
    alert_type: 'signal',
    symbol: 'HDL',
    signal_name: 'momentum_score',
    condition: 'above',
    threshold: 70,
    is_active: 1,
    created_at: Date.now(),
  },
  {
    user_id: testUserId,
    alert_type: 'broker_flow',
    broker_id: '58',
    condition: 'above',
    threshold: 5000000,
    is_active: 1,
    created_at: Date.now(),
  },
];

testAlerts.forEach((alert, i) => {
  const result = db.prepare(`
    INSERT INTO user_alerts (user_id, alert_type, symbol, signal_name, broker_id, condition, threshold, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    alert.user_id,
    alert.alert_type,
    alert.symbol || null,
    alert.signal_name || null,
    alert.broker_id || null,
    alert.condition,
    alert.threshold,
    alert.is_active,
    alert.created_at
  );

  console.log(`✅ Alert ${i + 1} created:`, alert.alert_type, '-', alert.symbol || alert.broker_id || 'Global');

  // Create a test trigger for this alert
  const messages = [
    `🔔 NABIL price is now above Rs. 1000 (Current: Rs. 1050.50)`,
    `🎯 HDL momentum_score is above 70 (Current: 75.30)`,
    `💵 Broker 58 net flow is above Rs. 5,000,000 (Current: Rs. 6,250,000)`,
  ];

  db.prepare(`
    INSERT INTO alert_trigger_log (alert_id, triggered_at, observed_value, message, is_read)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    result.lastInsertRowid,
    Date.now() - (i * 3600000), // Stagger times: now, 1hr ago, 2hrs ago
    alert.threshold + (i * 50),
    messages[i],
    i === 0 ? 0 : 1 // First one unread, others read
  );

  console.log(`   📬 Test notification created`);
});

// Show results
console.log('\n📊 Test Results:');
const alerts = db.prepare('SELECT * FROM user_alerts WHERE user_id = ?').all(testUserId);
const triggers = db.prepare(`
  SELECT atl.*, ua.alert_type, ua.symbol, ua.signal_name 
  FROM alert_trigger_log atl 
  JOIN user_alerts ua ON atl.alert_id = ua.id 
  WHERE ua.user_id = ? 
  ORDER BY atl.triggered_at DESC
`).all(testUserId);

console.log(`   Total Alerts: ${alerts.length}`);
console.log(`   Total Notifications: ${triggers.length}`);
console.log(`   Unread: ${triggers.filter(t => t.is_read === 0).length}`);

console.log('\n🔔 Notifications:');
triggers.forEach((t, i) => {
  const icon = t.alert_type === 'price' ? '💰' : t.alert_type === 'signal' ? '🎯' : '💵';
  const status = t.is_read === 0 ? '🔴 UNREAD' : '⚪ READ';
  console.log(`   ${i + 1}. ${icon} ${status}`);
  console.log(`      ${t.message}`);
  console.log(`      ${new Date(t.triggered_at).toLocaleString()}`);
  console.log('');
});

console.log('✅ Test data created successfully!');
console.log('\n🌐 Visit http://localhost:3001 to see the notifications in action');
console.log('   (You\'ll need to set x-user-id header to: test-user-001)');
