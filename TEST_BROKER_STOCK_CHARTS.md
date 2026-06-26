# 🧪 Test Broker Stock Activity Charts

**Status**: 🔴 Testing Required  
**Date**: 2026-06-26

---

## 📊 How to Test

### Step 1: Open Broker Analysis
```
1. Go to http://localhost:3000/broker-analysis
2. Click on "Performance" tab
3. Wait for data to load
```

### Step 2: Expand a Broker
```
Click on any broker row (e.g., Broker 58 - Naasa Securities)
↓
Chart should expand showing:
├─ 🟢 TOP STOCKS BOUGHT
├─ 🔴 TOP STOCKS SOLD
└─ 📊 NET POSITION
```

### Step 3: Verify Data Display
```
Expected to see:

🟢 TOP STOCKS BOUGHT:
   NRN          Rs. 100 Cr ████████████████ 45%
                145,000 shares @ ₨689.66/share

   BUNGAL       Rs. 85 Cr  ███████████████░ 38%
                125,000 shares @ ₨680.00/share

   RSML         Rs. 41 Cr  ███████░░░░░░░░░ 18%
                12,800 shares @ ₨3,203/share

🔴 TOP STOCKS SOLD:
   NRN          Rs. 50 Cr  ████████░░░░░░░░ 42%
                72,500 shares @ ₨689.66/share

   HEIP         Rs. 35 Cr  ██████░░░░░░░░░░ 29%
                85,000 shares @ ₨411.76/share

   KHPL         Rs. 27 Cr  ████░░░░░░░░░░░░ 23%
                29,000 shares @ ₨931.03/share

📊 NET POSITION:
   NRN      ██████░░░░ | ███░░░░░░░░  
            Net: +₨50 Cr (LONG)

   BUNGAL   ███████░░░░ | ░░░░░░░░░░░  
            Net: +₨65 Cr (LONG)

   HEIP     ░░░░░░░░░░░ | ███░░░░░░░░  
            Net: -₨35 Cr (SHORT)
```

---

## 🔍 What to Check

### Data Accuracy
- [ ] Stock symbols display (NRN, BUNGAL, RSML, etc.)
- [ ] Buy amounts correct (Rs. 100 Cr for NRN)
- [ ] Sell amounts correct (Rs. 50 Cr for NRN)
- [ ] Net amounts calculated correctly (Buy - Sell)
- [ ] Quantities show in K (145K, 72.5K)
- [ ] Percentages are correct (45%, 38%, 18%)

### Visual Elements
- [ ] Buy stocks bar chart is green
- [ ] Sell stocks bar chart is red
- [ ] Net position bars show proper colors
- [ ] Bar widths proportional to amounts
- [ ] Tab buttons working (Buy | Sell | All)

### Interaction
- [ ] Click "Top Buys" tab → Shows bought stocks
- [ ] Click "Top Sells" tab → Shows sold stocks
- [ ] Click "All Stocks" tab → Shows net positions
- [ ] Collapse/expand works smoothly

---

## 🧨 Common Issues & Fixes

### Issue: No data showing
**Problem**: Chart expands but shows "No stock activity data available"

**Cause**: 
- API endpoint not returning data
- Sample data not loading

**Fix**:
```javascript
// Open browser console (F12)
// Check if sample data is being used:
fetch('/api/broker/58')
  .then(r => r.json())
  .then(d => console.log(d))
```

### Issue: Wrong amounts showing
**Problem**: Amounts don't match expected values

**Possible causes**:
1. API data format different
2. Field names different (buyAmt vs buyAmount)
3. Calculation error (buy - sell)

**Debug**:
```javascript
// In console, check raw data:
fetch('/api/broker/58')
  .then(r => r.json())
  .then(d => {
    console.log('Stocks:', d.stocks)
    console.log('First stock:', d.stocks[0])
  })
```

### Issue: No tabs appearing
**Problem**: Buy/Sell/All buttons not visible

**Fix**:
1. Check if chart rendered (parent div exists)
2. Verify data loaded (check console)
3. Refresh page

---

## 📱 Test Different Brokers

### Broker 58 (Naasa Securities)
```
Expected:
- Top Buy: NRN (Rs. 100 Cr)
- Top Sell: NRN (Rs. 50 Cr)
- Sample data available
```

### Broker 65 (Sharepro Securities)
```
Expected:
- Top Buy: NRN (Rs. 85 Cr)
- Top Sell: RSML (Rs. 45 Cr)
- Sample data available
```

### Other Brokers
```
If no sample data:
- Chart expands
- Shows "No stock activity data"
- API endpoint returns error
```

---

## 🔧 How It Works

### Data Flow
```
User clicks broker row
    ↓
BrokerStockActivityChart mounts
    ↓
useEffect → fetchBrokerStockActivity()
    ↓
Try: fetch('/api/broker/[code]')
    ├─ Success → Transform and display data
    ├─ Error → Use sample data
    └─ No stocks → Use sample data
    ↓
setData() → Component re-renders
    ↓
Displays tabs and charts
```

### Sample Data Fallback
If API fails or returns no data:
```javascript
const sampleStocks = {
  "58": {
    brokerCode: "58",
    brokerName: "Naasa Securities",
    topBuyStocks: [...],
    topSellStocks: [...],
    totalBuyAmount: 22600000000,
    totalSellAmount: 11200000000,
  },
  "65": {
    brokerCode: "65",
    brokerName: "Sharepro Securities",
    // ... similar structure
  }
}
```

---

## 📋 Test Checklist

### Rendering
- [ ] Component loads without errors
- [ ] Header displays broker name
- [ ] Tab buttons appear (Buy | Sell | All)
- [ ] Charts render with proper styling

### Data Display
- [ ] Stock symbols show correctly
- [ ] Amounts formatted with Rs. and Cr/L/K
- [ ] Quantities show with K (thousands)
- [ ] Percentages calculated and displayed
- [ ] Average prices calculated

### Interactivity
- [ ] Tabs switch correctly
- [ ] Active tab highlighted
- [ ] Bars scale properly
- [ ] No console errors

### Fallback
- [ ] If API fails, sample data shows
- [ ] Sample data is accurate
- [ ] Graceful error handling

---

## 🧪 Browser Console Tests

### Test 1: Check API Response
```javascript
fetch('/api/broker/58')
  .then(r => r.json())
  .then(d => {
    console.log('Response:', d)
    console.log('Stocks count:', d.stocks?.length || 0)
    console.log('First stock:', d.stocks?.[0])
  })
```

### Test 2: Verify Sample Data
```javascript
// Check if sample data structure is correct
const sampleStock = {
  symbol: "NRN",
  buyAmt: 10000000000,
  buyQty: 145000,
  sellAmt: 5000000000,
  sellQty: 72500
}

console.log('Avg buy price:', sampleStock.buyAmt / sampleStock.buyQty)
console.log('Avg sell price:', sampleStock.sellAmt / sampleStock.sellQty)
console.log('Net amount:', sampleStock.buyAmt - sampleStock.sellAmt)
```

### Test 3: Check Formatting
```javascript
// Test amount formatting
const amount = 10000000000
const formatted = amount / 10000000  // Convert to Crores
console.log(`Rs. ${formatted.toFixed(2)} Cr`)  // Should show: Rs. 100.00 Cr
```

---

## ✅ Success Criteria

```
✅ Chart expands when broker clicked
✅ Data loads (real or sample)
✅ Stock symbols display
✅ Amounts formatted correctly (Rs. Cr)
✅ Quantities in thousands (145K)
✅ Percentages calculated
✅ Tabs working (Buy | Sell | All)
✅ Bar charts render with colors
✅ No console errors
✅ Graceful fallback to sample data
```

---

## 🐛 If Still Not Working

### Check 1: Is component mounted?
```javascript
// Check if element exists in DOM
document.querySelector('[class*="BrokerStock"]')
```

### Check 2: Are tabs rendering?
```javascript
// Check if tab buttons appear
document.querySelectorAll('button').forEach(btn => {
  if (btn.textContent.includes('Buy') || btn.textContent.includes('Sell')) {
    console.log('Tab found:', btn.textContent)
  }
})
```

### Check 3: Check console for errors
```
F12 → Console tab → Look for red errors
Common issues:
- "Cannot read property 'stocks' of undefined"
- "fetch failed" (API error)
- "setData is not a function" (React issue)
```

### Check 4: Verify API endpoint exists
```bash
curl http://localhost:3000/api/broker/58
# Should return JSON with stocks array
```

---

## 🚀 Next Steps

If all tests pass:
```
✅ Chart is working
✅ Data displays correctly
✅ Ready for production
```

If tests fail:
```
1. Check console errors
2. Verify API endpoint returns data
3. Check sample data loading
4. Review component mounting
5. Run individual tests above
```

---

## 📝 Notes

- Sample data available for brokers 58 and 65
- Other brokers use real API data (if available)
- Graceful fallback if no data
- Charts use CSS bars, not SVG
- Responsive design (mobile-friendly)
- Colors: Green (Buy), Red (Sell), Gray (Net)

---

**Ready to test!** Click on a broker to see the stock activity chart. 🧪
