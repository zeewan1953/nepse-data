#!/usr/bin/env node
/**
 * Alert Evaluator Job
 * 
 * Runs AFTER signal computation & broker finalization jobs complete.
 * Checks each active alert against today's data and fires if conditions are met.
 * 
 * CRITICAL RULES:
 * 1. NEVER fire alert on null/missing data - skip silently
 * 2. Once-per-trading-day dedup via last_triggered_at
 * 3. Purely additive - reads from existing tables, never writes to them
 * 
 * Dependency chain:
 *   Signal Computation (3:03 PM) → Broker Finalization (3:05 PM) → Alert Evaluator (3:07 PM)
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'darisir.db');
const db = new Database(dbPath);

// Helper: Get today's date in YYYY-MM-DD format (Nepal Time)
function getTodayNPT() {
  const now = new Date();
  // NPT is UTC+5:45
  const nptOffset = 5 * 60 + 45;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const npt = new Date(utc + nptOffset * 60000);
  return npt.toISOString().split('T')[0];
}

// Helper: Check if last_triggered_at is today
function isTriggeredToday(lastTriggeredAt) {
  if (!lastTriggeredAt) return false;
  const triggeredDate = new Date(lastTriggeredAt).toISOString().split('T')[0];
  return triggeredDate === getTodayNPT();
}

// Helper: Send Web Push (stub - implement with web-push library)
async function sendWebPush(userId, message) {
  try {
    const subscriptions = db.prepare(`
      SELECT * FROM push_subscriptions WHERE user_id = ?
    `).all(userId);

    for (const sub of subscriptions) {
      // TODO: Implement actual Web Push sending
      // For now, just log
      console.log(`[PUSH] Would send to user ${userId}: ${message}`);
    }
  } catch (error) {
    // Fail silently - push is convenience layer, not primary record
    console.error(`[PUSH] Failed to send to user ${userId}:`, error.message);
  }
}

// EVALUATE PRICE ALERTS
function evaluatePriceAlerts() {
  console.log('\n📊 Evaluating Price Alerts...');
  
  const alerts = db.prepare(`
    SELECT * FROM user_alerts 
    WHERE alert_type = 'price' AND is_active = 1
  `).all();

  let fired = 0;
  let skipped = 0;

  for (const alert of alerts) {
    // Skip if already triggered today
    if (isTriggeredToday(alert.last_triggered_at)) {
      skipped++;
      continue;
    }

    // Get today's price
    const priceRow = db.prepare(`
      SELECT lastTradedPrice FROM live_market WHERE symbol = ?
    `).get(alert.symbol);

    // CRITICAL: Skip if price is null/missing
    if (!priceRow || priceRow.lastTradedPrice === null || priceRow.lastTradedPrice === undefined) {
      console.log(`  ⏭️  Skipping ${alert.symbol} - no price data`);
      skipped++;
      continue;
    }

    const currentPrice = priceRow.lastTradedPrice;
    let shouldFire = false;

    // Check condition
    switch (alert.condition) {
      case 'above':
        shouldFire = currentPrice > alert.threshold;
        break;
      case 'below':
        shouldFire = currentPrice < alert.threshold;
        break;
      case 'crosses_up':
        // Would need yesterday's close to check cross - simplified for now
        shouldFire = currentPrice >= alert.threshold;
        break;
      case 'crosses_down':
        shouldFire = currentPrice <= alert.threshold;
        break;
    }

    if (shouldFire) {
      const message = `🔔 ${alert.symbol} price is now ${alert.condition} Rs. ${alert.threshold} (Current: Rs. ${currentPrice.toFixed(2)})`;
      
      // Log the trigger
      db.prepare(`
        INSERT INTO alert_trigger_log (alert_id, triggered_at, observed_value, message, is_read)
        VALUES (?, ?, ?, ?, 0)
      `).run(alert.id, Date.now(), currentPrice, message);

      // Update last_triggered_at
      db.prepare(`
        UPDATE user_alerts SET last_triggered_at = ? WHERE id = ?
      `).run(Date.now(), alert.id);

      // Send push notification
      sendWebPush(alert.user_id, message);

      console.log(`  🔥 FIRED: ${message}`);
      fired++;
    }
  }

  console.log(`  ✅ Price Alerts: ${fired} fired, ${skipped} skipped`);
}

// EVALUATE SIGNAL ALERTS
function evaluateSignalAlerts() {
  console.log('\n📈 Evaluating Signal Alerts...');
  
  const alerts = db.prepare(`
    SELECT * FROM user_alerts 
    WHERE alert_type = 'signal' AND is_active = 1
  `).all();

  let fired = 0;
  let skipped = 0;

  for (const alert of alerts) {
    // Skip if already triggered today
    if (isTriggeredToday(alert.last_triggered_at)) {
      skipped++;
      continue;
    }

    // Get today's signal value
    const signalRow = db.prepare(`
      SELECT value FROM indicator_daily_signal 
      WHERE symbol = ? AND signal_name = ? AND date = ?
    `).get(alert.symbol, alert.signal_name, getTodayNPT());

    // CRITICAL: Skip if signal value is null/missing
    if (!signalRow || signalRow.value === null || signalRow.value === undefined) {
      console.log(`  ⏭️  Skipping ${alert.symbol}/${alert.signal_name} - signal value is null`);
      skipped++;
      continue;
    }

    const signalValue = signalRow.value;
    let shouldFire = false;

    // Check condition
    switch (alert.condition) {
      case 'above':
        shouldFire = signalValue > alert.threshold;
        break;
      case 'below':
        shouldFire = signalValue < alert.threshold;
        break;
      case 'crosses_up':
        shouldFire = signalValue >= alert.threshold;
        break;
      case 'crosses_down':
        shouldFire = signalValue <= alert.threshold;
        break;
    }

    if (shouldFire) {
      const message = `🎯 ${alert.symbol} ${alert.signal_name} is ${alert.condition} ${alert.threshold} (Current: ${signalValue.toFixed(2)})`;
      
      // Log the trigger
      db.prepare(`
        INSERT INTO alert_trigger_log (alert_id, triggered_at, observed_value, message, is_read)
        VALUES (?, ?, ?, ?, 0)
      `).run(alert.id, Date.now(), signalValue, message);

      // Update last_triggered_at
      db.prepare(`
        UPDATE user_alerts SET last_triggered_at = ? WHERE id = ?
      `).run(Date.now(), alert.id);

      // Send push notification
      sendWebPush(alert.user_id, message);

      console.log(`  🔥 FIRED: ${message}`);
      fired++;
    }
  }

  console.log(`  ✅ Signal Alerts: ${fired} fired, ${skipped} skipped`);
}

// EVALUATE BROKER FLOW ALERTS
function evaluateBrokerFlowAlerts() {
  console.log('\n💰 Evaluating Broker Flow Alerts...');
  
  const alerts = db.prepare(`
    SELECT * FROM user_alerts 
    WHERE alert_type = 'broker_flow' AND is_active = 1
  `).all();

  let fired = 0;
  let skipped = 0;

  for (const alert of alerts) {
    // Skip if already triggered today
    if (isTriggeredToday(alert.last_triggered_at)) {
      skipped++;
      continue;
    }

    // Get broker's net flow for today
    let netFlow;
    if (alert.symbol) {
      // Broker flow for specific stock
      const flowRow = db.prepare(`
        SELECT net_buy_amount FROM broker_daily_agg 
        WHERE broker_id = ? AND symbol = ? AND trade_date = ?
      `).get(alert.broker_id, alert.symbol, getTodayNPT());
      
      netFlow = flowRow?.net_buy_amount;
    } else {
      // Broker's total net flow across all stocks
      const totalRow = db.prepare(`
        SELECT SUM(net_buy_amount) as total_net FROM broker_daily_agg 
        WHERE broker_id = ? AND trade_date = ?
      `).get(alert.broker_id, getTodayNPT());
      
      netFlow = totalRow?.total_net;
    }

    // CRITICAL: Skip if net flow is null/missing
    if (netFlow === null || netFlow === undefined) {
      console.log(`  ⏭️  Skipping broker ${alert.broker_id} - no flow data`);
      skipped++;
      continue;
    }

    let shouldFire = false;

    // Check condition
    switch (alert.condition) {
      case 'above':
        shouldFire = netFlow > alert.threshold;
        break;
      case 'below':
        shouldFire = netFlow < alert.threshold;
        break;
      case 'crosses_up':
        shouldFire = netFlow >= alert.threshold;
        break;
      case 'crosses_down':
        shouldFire = netFlow <= alert.threshold;
        break;
    }

    if (shouldFire) {
      const target = alert.symbol ? ` (${alert.symbol})` : ' (total)';
      const message = `💵 Broker ${alert.broker_id}${target} net flow is ${alert.condition} Rs. ${alert.threshold.toLocaleString()} (Current: Rs. ${netFlow.toLocaleString()})`;
      
      // Log the trigger
      db.prepare(`
        INSERT INTO alert_trigger_log (alert_id, triggered_at, observed_value, message, is_read)
        VALUES (?, ?, ?, ?, 0)
      `).run(alert.id, Date.now(), netFlow, message);

      // Update last_triggered_at
      db.prepare(`
        UPDATE user_alerts SET last_triggered_at = ? WHERE id = ?
      `).run(Date.now(), alert.id);

      // Send push notification
      sendWebPush(alert.user_id, message);

      console.log(`  🔥 FIRED: ${message}`);
      fired++;
    }
  }

  console.log(`  ✅ Broker Flow Alerts: ${fired} fired, ${skipped} skipped`);
}

// MAIN EXECUTION
function main() {
  console.log('🚀 Alert Evaluator Started');
  console.log(`📅 Date: ${getTodayNPT()}`);
  console.log(`🕐 Time: ${new Date().toISOString()}`);

  try {
    // Evaluate all alert types
    evaluatePriceAlerts();
    evaluateSignalAlerts();
    evaluateBrokerFlowAlerts();

    console.log('\n✅ Alert Evaluator Completed Successfully');
  } catch (error) {
    console.error('\n❌ Alert Evaluator Failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
