# Broker Holdings Data Fix - Implementation Checklist

## Pre-Implementation

### Planning & Review
- [ ] Read START_HERE.md
- [ ] Read ANALYSIS_REPORT.txt
- [ ] Review BROKER_HOLDINGS_QUICK_FIX.txt
- [ ] Schedule 1-hour implementation window
- [ ] Identify team members involved
- [ ] Have rollback plan ready

### Preparation
- [ ] Backup database (`data/darisir.db`)
  ```bash
  cp data/darisir.db data/darisir.db.backup
  ```
- [ ] Backup current API route
  ```bash
  cp src/app/api/broker-stocks/route.ts src/app/api/broker-stocks/route.backup.ts
  ```
- [ ] Ensure database is accessible
- [ ] Verify TypeScript environment ready
- [ ] Confirm SQLite3 available
- [ ] Have git ready for version control

---

## Phase 1: Validation (5 minutes)

### Run Validator Script
- [ ] Execute validator
  ```bash
  npx ts-node scripts/broker-holdings-validator.ts
  ```
- [ ] Review output for errors
  - [ ] "Missing sell data" section
  - [ ] "Missing transaction counts" section
  - [ ] "Inconsistencies" section
  - [ ] "Floorsheet matching" section
- [ ] Confirm issues match expectations
- [ ] Note affected brokers and dates
- [ ] **Expected result**: Validator confirms all 5 issues exist

### Success Criteria
- [ ] No TypeScript errors
- [ ] Output shows affected brokers
- [ ] Output shows affected dates
- [ ] Sample records printed correctly

**If failed**: Check TypeScript version, ensure db.ts available

---

## Phase 2: Database Fixes (5 minutes)

### Run Fixer Script
- [ ] Execute fixer
  ```bash
  npx ts-node scripts/broker-holdings-fixer.ts
  ```
- [ ] Monitor progress logs
  - [ ] "Step 1: Adding missing columns" - should see checkmarks
  - [ ] "Step 2: Scanning for records" - shows count of records to fix
  - [ ] "Step 3: Backfilling sell data" - shows progress
  - [ ] "Step 4: Backfilling buy contracts" - shows count
  - [ ] "Step 5: Calculating matching volume" - should complete
  - [ ] "Step 6: Verifying fixes" - should show 0 still missing
- [ ] Check summary statistics at end
  - [ ] totalRecords count matches expectation
  - [ ] recordsWithSells > 0
  - [ ] recordsWithMatching > 0
- [ ] **Expected result**: "All fixes applied successfully!" message

### Success Criteria
- [ ] No SQL errors
- [ ] Columns added without errors
- [ ] Data backfilled (shows in summary)
- [ ] Verification shows 0 missing sells remaining

**If failed**: 
- Check database permissions
- Ensure database isn't locked
- Verify floorsheet_trades table has data

---

## Phase 3: Data Verification (5 minutes)

### Run Verification Queries
- [ ] Open SQLite CLI
  ```bash
  sqlite3 data/darisir.db
  ```
- [ ] Run each verification group
  - [ ] Group 1: Check for missing sell data
    ```sql
    SELECT COUNT(*) FROM broker_daily_agg
    WHERE sellQty = 0 AND buyQty > 0;
    ```
    **Expected**: 0 (was hundreds before fix)
  
  - [ ] Group 2: Check for transaction counts
    ```sql
    SELECT COUNT(CASE WHEN buyContracts > 0 THEN 1 END) FROM broker_daily_agg LIMIT 10;
    ```
    **Expected**: > 0
  
  - [ ] Group 3: Check VWAP calculation
    ```sql
    SELECT SUM(buyAmt) / SUM(buyQty) as vwap
    FROM broker_daily_agg WHERE tradeDate = '2026-06-26' GROUP BY brokerId;
    ```
    **Expected**: All non-null values
  
  - [ ] Group 4: Matching volume check
    ```sql
    SELECT COUNT(CASE WHEN matchingVolume > 0 THEN 1 END) FROM broker_daily_agg;
    ```
    **Expected**: > 0

- [ ] Spot-check specific stock (ACLBSL)
  ```sql
  SELECT brokerId, buyQty, sellQty, netQty, buyContracts, sellContracts, matchingVolume
  FROM broker_daily_agg
  WHERE stockSymbol = 'ACLBSL' AND tradeDate = '2026-06-26'
  ORDER BY ABS(netQty) DESC
  LIMIT 10;
  ```
  **Expected**: sellQty > 0 for all rows, contracts > 0

### Success Criteria
- [ ] Missing sell data count = 0
- [ ] Transaction counts > 0
- [ ] VWAP values not NULL
- [ ] Matching volume > 0 for records with both buy and sell

**If failed**: Run fixer again, check for errors

---

## Phase 4: API Deployment (5 minutes)

### Deploy Fixed Route
- [ ] Stop development server (if running)
  ```bash
  # Ctrl+C or equivalent
  ```
- [ ] Copy fixed API route
  ```bash
  cp src/app/api/broker-stocks/route-fixed.ts src/app/api/broker-stocks/route.ts
  ```
- [ ] Verify file copied correctly
  ```bash
  ls -la src/app/api/broker-stocks/route.ts
  ```
- [ ] Restart development server
  ```bash
  npm run dev
  ```
- [ ] Wait for server to be ready (check console)
- [ ] **Expected**: Server starts without errors

### Verify API Deployment
- [ ] Check server logs for errors
- [ ] Test API endpoint manually:
  ```bash
  curl "http://localhost:3000/api/broker-stocks?stock=ACLBSL"
  ```
- [ ] Response should be valid JSON
- [ ] Response should include:
  - [ ] `buyQty` > 0
  - [ ] `sellQty` > 0 (NOT 0)
  - [ ] `buyContracts` field exists
  - [ ] `matchingVolume` field exists
  - [ ] `netQty` = buyQty - sellQty

### Success Criteria
- [ ] Server starts without errors
- [ ] API responds to requests
- [ ] Response includes new fields
- [ ] Response shows sell data (not zeros)

**If failed**:
- Check TypeScript compilation
- Verify imports in route file
- Check database connection
- Rollback to backup if critical

---

## Phase 5: UI Testing (5 minutes)

### Manual Testing
- [ ] Open browser to `/app/holding`
- [ ] Wait for page to load
- [ ] Check for any console errors (F12 → Console)
- [ ] Select date: today or latest available date
- [ ] Look for stock ACLBSL
- [ ] Click on holding page to filter if needed

### Verify UI Display
- [ ] Page loads without errors
- [ ] Broker table visible
- [ ] Columns show:
  - [ ] Buy Qty (> 0)
  - [ ] Buy Amt (> 0)
  - [ ] Sell Qty (> 0, NOT 0) ← Key fix
  - [ ] Sell Amt (> 0, NOT 0) ← Key fix
  - [ ] Net Qty
  - [ ] Net Amt
  - [ ] Cumulative Net Qty (not NULL)
  - [ ] Cumulative Net Amt (not NULL)

### Spot-Check Data
- [ ] Select broker #1 (or any broker)
- [ ] Find ACLBSL stock
- [ ] Verify:
  - [ ] Sell Qty > 0 (was 0 before)
  - [ ] Sell Amt > 0 (was 0 before)
  - [ ] Sum of all brokers = total market volume

### Success Criteria
- [ ] Page loads without errors
- [ ] Data shows realistic values
- [ ] No more zero-sell anomalies
- [ ] Cumulative values present
- [ ] Data matches database

**If failed**:
- Check browser console for errors
- Verify API route deployed correctly
- Check database connection
- Look for TypeScript errors in build

---

## Phase 6: Extended Testing (Optional, 15 minutes)

### Test Time Range Aggregation
- [ ] In holding page, test 1D/3D/1W/1M/3M range queries
- [ ] Verify prices make sense:
  - [ ] 3D average = SUM(amt) / SUM(qty), not daily averages
  - [ ] Prices consistent across ranges
  - [ ] No huge jumps between periods

### Test Multiple Stocks
- [ ] Try 5-10 different stocks
- [ ] Verify all show realistic data
- [ ] No more zero-sell anomalies
- [ ] Transaction counts present

### Performance Check
- [ ] Measure API response time
  ```bash
  time curl "http://localhost:3000/api/broker-stocks"
  ```
- [ ] Should be < 500ms
- [ ] Monitor server CPU/memory
  - [ ] Should be normal usage
  - [ ] No memory leaks

### Success Criteria
- [ ] Time-range aggregation correct
- [ ] All stocks show proper data
- [ ] Performance maintained
- [ ] No performance degradation

---

## Post-Implementation

### Documentation
- [ ] Update team documentation if needed
- [ ] Add note about changes to README
- [ ] Create ticket in issue tracking (if used)
- [ ] Note fix date and version

### Monitoring (24 hours after)
- [ ] Check for any errors in production logs
- [ ] Monitor API response times
- [ ] Verify data consistency
- [ ] Check user reports
- [ ] No unusual activity

### Team Communication
- [ ] Notify team of changes
- [ ] Explain what was fixed
- [ ] Point to documentation
- [ ] Ask for feedback

### Cleanup
- [ ] Delete backup files (or archive them)
  - [ ] Optional: keep .backup file indefinitely
- [ ] Remove any test data created
- [ ] Commit changes to git (if not done)
  ```bash
  git add src/app/api/broker-stocks/route.ts
  git commit -m "Fix broker holdings data aggregation and missing sells"
  ```

---

## Rollback Procedure

If critical issues occur, follow this to rollback:

### Immediate Rollback (< 5 minutes)
```bash
# Step 1: Restore API route
cp src/app/api/broker-stocks/route.backup.ts src/app/api/broker-stocks/route.ts

# Step 2: Restart server
npm run dev

# Step 3: Test API
curl "http://localhost:3000/api/broker-stocks?stock=ACLBSL"

# Expected: Old behavior (zero sells) but stable
```

### Complete Rollback (if database issues)
```bash
# Step 1: Restore database backup
rm data/darisir.db
cp data/darisir.db.backup data/darisir.db

# Step 2: Restore API route
cp src/app/api/broker-stocks/route.backup.ts src/app/api/broker-stocks/route.ts

# Step 3: Restart server
npm run dev

# Step 4: Verify everything works
# Run validator to confirm original state
npx ts-node scripts/broker-holdings-validator.ts
```

---

## Troubleshooting

### Issue: Validator shows TypeScript error
**Solution**: 
- Ensure Node.js version >= 16
- Check `src/lib/db.ts` exists
- Verify TypeScript installed: `npm ls typescript`

### Issue: Fixer script hangs
**Solution**:
- Press Ctrl+C to stop
- Check database isn't locked: `lsof data/darisir.db`
- Run with smaller batch: Edit BATCH_SIZE in script

### Issue: Some brokers still show zero sells
**Solution**:
- Run validator to confirm remaining issues
- Check floorsheet_trades for that broker
- May be legitimate one-sided trades

### Issue: API returns error after deployment
**Solution**:
- Check console for TypeScript errors
- Verify file was copied correctly
- Check database connection
- Try rollback if critical

### Issue: UI shows old data
**Solution**:
- Hard refresh browser: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- Clear browser cache
- Restart dev server
- Check API directly with curl

---

## Sign-Off

### Pre-Implementation Sign-Off
- [ ] All stakeholders approve plan
- [ ] Implementation window scheduled
- [ ] Team members assigned
- [ ] Rollback plan documented

### Post-Implementation Sign-Off
- [ ] All phases completed successfully
- [ ] Issues fixed verified
- [ ] Performance acceptable
- [ ] Team trained on changes
- [ ] Documentation updated

---

## Timeline

```
Pre-Implementation:     30 min
  - Review documents
  - Prepare backups
  - Schedule window

Implementation:        1 hour
  - Validate issues      (5 min)
  - Apply fixes          (5 min)
  - Verify data          (5 min)
  - Deploy API           (5 min)
  - Test UI              (5 min)
  - Extended testing     (15 min) [optional]
  - Documentation        (15 min)

Post-Implementation:   24+ hours
  - Monitor
  - Gather feedback
  - Address issues

Total first day:       2.5 hours
Ongoing:              Regular monitoring
```

---

## Success Metrics

After implementation, you should observe:

**Data Quality**:
- [ ] Zero sells count drops from hundreds to 0
- [ ] All brokers show realistic buy AND sell volumes
- [ ] Transaction counts > 0 for active brokers
- [ ] Matching volume calculated (50-100% of volume for most)

**Functionality**:
- [ ] Time-range VWAP correct (manual spot-checks)
- [ ] Cumulative net non-null for all active brokers
- [ ] API response < 500ms
- [ ] No console errors

**Stability**:
- [ ] No unexpected errors
- [ ] Database performs normally
- [ ] API availability maintained
- [ ] User feedback positive

---

**Ready to implement?** Start with Phase 1!

Questions? Check:
- ANALYSIS_REPORT.txt (what/why)
- BROKER_HOLDINGS_QUICK_FIX.txt (how)
- BROKER_HOLDINGS_IMPLEMENTATION.md (details)
