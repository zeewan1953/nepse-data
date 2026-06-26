# 🧪 Time Range Data Verification Test

**Date**: 2026-06-26  
**Data Source**: Nepal Stock Exchange (NEPSE)  
**Status**: Testing Real Data

---

## 📋 Test Plan

### Time Ranges to Test
1. ✅ **1D (1 Day)** - Current day
2. ✅ **3D (3 Days)** - Last 3 days including today
3. ✅ **1W (1 Week)** - Last 7 days
4. ✅ **1M (1 Month)** - Last 30 days
5. ✅ **3M (3 Months)** - Last 90 days

### Data Verification Checks
- [ ] Data loads for each time range
- [ ] Broker counts are correct
- [ ] Amounts are correctly aggregated
- [ ] No duplicate trades
- [ ] Date ranges are accurate
- [ ] Buy/Sell/Net calculations correct

---

## 🔧 Implementation

### Data Source
**API**: Nepal Stock Exchange (NEPSE)  
**Source File**: `src/lib/broker-data-aggregator.ts`  
**Fetches**: Floorsheet trades with broker information

### Data Flow
```
NEPSE API (Floorsheet Trades)
    ↓
aggregateBrokerDataForRange(range)
    ↓
Filter by date range
    ↓
Group by broker and date
    ↓
Sum buy/sell amounts and volumes
    ↓
Calculate totals for range
    ↓
Return aggregated data
```

### Aggregation Logic
```typescript
// For each time range:
- Fetch all floorsheet trades for date range
- For each trade:
  - Add to buyer broker's buy amount/volume
  - Add to seller broker's sell amount/volume
- Calculate:
  - netAmount = buyAmount - sellAmount
  - turnover = buyAmount + sellAmount
  - averageDailyTurnover = turnover / daysInRange
```

---

## 📊 Expected Data Structure

### Per Broker
```typescript
{
  brokerCode: "58",
  brokerName: "Naasa Securities",
  date: "2026-06-26",
  range: "1D",
  
  // Amounts (in Rupees)
  buyAmount: 1724000000,      // Total bought
  sellAmount: 2409000000,     // Total sold
  netAmount: -685000000,      // Net position (buy - sell)
  turnover: 4133000000,       // Total activity
  
  // Volumes (shares)
  buyVolume: 363198,
  sellVolume: 518806,
  netVolume: -155608,
  
  // Metrics
  transactionCount: 11502,
  daysInRange: 1,
  averageDailyTurnover: 4133000000,
}
```

---

## 🧪 Test Cases

### Test 1: 1D (Today Only)
```
URL: /api/broker-performance?range=1D
Expected:
- Date range: 2026-06-26 to 2026-06-26 (same day)
- daysInRange: 1
- Data: Today's trades only
- Brokers: All active brokers today

Example Response:
{
  "range": "1D",
  "fromDate": "2026-06-26",
  "toDate": "2026-06-26",
  "brokers": [
    {
      "brokerCode": "58",
      "brokerName": "Naasa Securities",
      "buyAmount": 1724000000,
      "sellAmount": 2409000000,
      "netAmount": -685000000,
      "turnover": 4133000000,
      ...
    },
    ...
  ],
  "brokerCount": 45,
  "source": "nepse_live"
}
```

### Test 2: 3D (Last 3 Days)
```
URL: /api/broker-performance?range=3D
Expected:
- Date range: 2026-06-24 to 2026-06-26 (3 days)
- daysInRange: 2-3 (depends on weekends/holidays)
- Data: Aggregated from all 3 days
- averageDailyTurnover: turnover / daysInRange

Example:
{
  "range": "3D",
  "fromDate": "2026-06-24",
  "toDate": "2026-06-26",
  "brokers": [
    {
      "brokerCode": "58",
      "turnover": 12399000000,    // 3 days of trades
      "daysInRange": 3,
      "averageDailyTurnover": 4133000000,  // Per day average
      ...
    },
    ...
  ],
  "brokerCount": 47
}
```

### Test 3: 1W (Last 7 Days)
```
URL: /api/broker-performance?range=1W
Expected:
- Date range: 2026-06-19 to 2026-06-26 (7 days)
- daysInRange: 5-6 (accounting for weekends)
- Data: Aggregated from full week
- More complete data than 1D

Example:
{
  "range": "1W",
  "fromDate": "2026-06-19",
  "toDate": "2026-06-26",
  "brokers": [
    {
      "brokerCode": "58",
      "turnover": 38847000000,    // 5-6 trading days
      "daysInRange": 5,
      "averageDailyTurnover": 7769400000,  // Average
      ...
    },
    ...
  ],
  "brokerCount": 52
}
```

### Test 4: 1M (Last 30 Days)
```
URL: /api/broker-performance?range=1M
Expected:
- Date range: 2026-05-27 to 2026-06-26 (30 days)
- daysInRange: 21-23 (accounting for weekends/holidays)
- Data: Aggregated from full month
- Smooth trend data

Example:
{
  "range": "1M",
  "fromDate": "2026-05-27",
  "toDate": "2026-06-26",
  "brokers": [
    {
      "brokerCode": "58",
      "turnover": 86947000000,    // Full month
      "daysInRange": 21,
      "averageDailyTurnover": 4140333333,  // Monthly average
      ...
    },
    ...
  ],
  "brokerCount": 65
}
```

### Test 5: 3M (Last 90 Days)
```
URL: /api/broker-performance?range=3M
Expected:
- Date range: 2026-03-28 to 2026-06-26 (90 days)
- daysInRange: 63-65 (accounting for weekends/holidays)
- Data: Aggregated from full quarter
- Long-term trend data

Example:
{
  "range": "3M",
  "fromDate": "2026-03-28",
  "toDate": "2026-06-26",
  "brokers": [
    {
      "brokerCode": "58",
      "turnover": 260841000000,   // 3 months
      "daysInRange": 63,
      "averageDailyTurnover": 4139380952,  // Daily average over 3 months
      ...
    },
    ...
  ],
  "brokerCount": 89
}
```

---

## ✅ Verification Checklist

### Data Correctness
- [ ] Turnover = buyAmount + sellAmount
- [ ] netAmount = buyAmount - sellAmount
- [ ] transactionCount > 0 for all brokers
- [ ] No negative amounts (except netAmount)
- [ ] No duplicate trades in aggregation

### Time Range Accuracy
- [ ] 1D: Only today's trades
- [ ] 3D: Exactly 3 days of trades
- [ ] 1W: 7 calendar days (5-6 trading days)
- [ ] 1M: 30 calendar days (21-23 trading days)
- [ ] 3M: 90 calendar days (63-65 trading days)

### Data Consistency
- [ ] Same broker appears in all ranges
- [ ] Larger range = larger turnover (mostly)
- [ ] Average daily = turnover / daysInRange
- [ ] Top brokers consistent across ranges

### Performance
- [ ] 1D loads in < 1 second
- [ ] 3D loads in < 2 seconds
- [ ] 1W loads in < 3 seconds
- [ ] 1M loads in < 5 seconds
- [ ] 3M loads in < 8 seconds

---

## 🚀 Testing Instructions

### Test All Ranges
```bash
# Open browser developer console and run:

// Test 1D
fetch('/api/broker-performance?range=1D').then(r => r.json()).then(d => console.log('1D:', d.brokers.length, 'brokers', d.brokers[0]))

// Test 3D
fetch('/api/broker-performance?range=3D').then(r => r.json()).then(d => console.log('3D:', d.brokers.length, 'brokers', d.brokers[0]))

// Test 1W
fetch('/api/broker-performance?range=1W').then(r => r.json()).then(d => console.log('1W:', d.brokers.length, 'brokers', d.brokers[0]))

// Test 1M
fetch('/api/broker-performance?range=1M').then(r => r.json()).then(d => console.log('1M:', d.brokers.length, 'brokers', d.brokers[0]))

// Test 3M
fetch('/api/broker-performance?range=3M').then(r => r.json()).then(d => console.log('3M:', d.brokers.length, 'brokers', d.brokers[0]))
```

### Verify Data Consistency
```javascript
// Check if turnover = buy + sell
const broker = response.brokers[0];
const isConsistent = broker.turnover === (broker.buyAmount + broker.sellAmount);
console.log('Turnover consistent:', isConsistent);

// Check if range increases
const turnover = {
  '1D': response1D.brokers[0].turnover,
  '3D': response3D.brokers[0].turnover,
  '1W': response1W.brokers[0].turnover,
  '1M': response1M.brokers[0].turnover,
  '3M': response3M.brokers[0].turnover,
};
console.log('Turnover by range:', turnover);
```

---

## 📈 Expected Results

### Broker 58 (Naasa Securities) Example
| Range | Days | Turnover | Buy Amt | Sell Amt | Avg Daily |
|-------|------|----------|---------|----------|-----------|
| 1D | 1 | 4.13 Cr | 1.72 Cr | 2.41 Cr | 4.13 Cr |
| 3D | 3 | 12.39 Cr | 5.17 Cr | 7.22 Cr | 4.13 Cr |
| 1W | 5 | 20.67 Cr | 8.62 Cr | 12.05 Cr | 4.13 Cr |
| 1M | 21 | 86.73 Cr | 36.19 Cr | 50.54 Cr | 4.13 Cr |
| 3M | 63 | 260.19 Cr | 108.36 Cr | 151.83 Cr | 4.13 Cr |

**Key Observation**: Average Daily should be consistent (~4.13 Cr)

---

## 🎯 Status

```
Implementation: ✅ COMPLETE
- Data aggregator created
- API updated to fetch from NEPSE
- All 5 time ranges supported
- Fallback to sample data if API fails

Testing: 🔄 IN PROGRESS
- Verify data loads for all ranges
- Check aggregation is correct
- Validate time ranges
- Test performance

Ready to Deploy: ⏳ PENDING TEST RESULTS
```

---

## 📝 Notes

- All times in Nepal timezone (NPT / UTC+5:45)
- NEPSE market: Sunday-Thursday 11:00 AM - 3:00 PM NPT
- Weekends: Friday-Saturday (no trading)
- Data aggregates all broker-to-broker trades (floorsheet)
- Net amount shows broker's net buying (+) or selling (-) position

---

**Test Status**: Ready for verification  
**Next Step**: Run tests and verify all 5 time ranges return correct data
