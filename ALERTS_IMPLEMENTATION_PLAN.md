# In-App Alerts & Notifications — Implementation Status

## ✅ Already Implemented
1. **Database Schema** - All 3 tables exist:
   - `user_alerts` ✓
   - `alert_trigger_log` ✓
   - `push_subscriptions` ✓

2. **Basic API Routes**:
   - `GET /api/alerts` ✓
   - `POST /api/alerts` ✓
   - `GET /api/notifications` ✓ (just updated)

## 🚧 Need to Implement

### Phase 1: Complete API Routes (30 min)
1. `PATCH /api/alerts/[id]` - Update/activate/deactivate alert
2. `DELETE /api/alerts/[id]` - Delete alert
3. `PATCH /api/notifications/[id]/read` - Mark notification as read
4. `POST /api/push/subscribe` - Register Web Push subscription
5. `POST /api/push/unsubscribe` - Remove subscription

### Phase 2: Alert Evaluator Job (1-2 hours)
Create `scripts/alert-evaluator.js`:
- Runs AFTER signal computation & broker finalization
- Checks each active alert against today's data
- **CRITICAL**: Skip if signal value is `null`
- Fires alert once per trading day max
- Inserts into `alert_trigger_log`
- Sends Web Push if subscribed

### Phase 3: Frontend UI (2-3 hours)
1. **Notification Bell** in AppHeader
   - Unread count badge
   - Dropdown panel
   - Mark-as-read on open

2. **Alert Config Modal**
   - Price alert form
   - Signal alert form (reuses existing stock search)
   - Broker flow alert form
   - List of user's active alerts

3. **Web Push Client-Side**
   - Service worker registration
   - Push subscription flow
   - Handle push notifications

### Phase 4: Testing & Validation (1 hour)
- Test null-signal skip logic
- Test once-per-day dedup
- Verify no changes to existing signal/cron jobs
- Test push notification delivery

## 📋 Conventions Checklist
- [x] Never fire alert on `null`/missing data (evaluator must check)
- [ ] Once-per-trading-day dedup (`last_triggered_at` check)
- [x] No SMS/Telegram/email in v1
- [ ] Existing jobs remain read-only
- [ ] Push failures degrade gracefully

## 🎯 Next Steps
1. Complete remaining API routes
2. Build alert evaluator script
3. Add bell icon to AppHeader
4. Create alert config UI
5. Implement Web Push service worker
6. Test thoroughly
