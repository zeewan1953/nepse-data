# NEPSE Floorsheet Pipeline Setup Guide

## ✅ What's Done

The Python floorsheet scraper pipeline has been copied to:
```
c:\nepali bajar 2\nepse-pipeline\
```

The broker-analysis API has been updated to use this pipeline as a fallback source (after DB, before NEPSE direct).

---

## 🚀 Setup Instructions

### Step 1: Install Python Dependencies

```powershell
cd "c:\nepali bajar 2\nepse-pipeline"

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Install Playwright browser (needed for scraping)
playwright install chromium
```

### Step 2: Configure Environment

```powershell
# Copy example env file
copy .env.example .env

# Edit .env and add your database credentials
# Database: PostgreSQL connection string
# Optional: ANTHROPIC_API_KEY for AI validation
```

**Example `.env`:**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/nepse_floorsheet
ANTHROPIC_API_KEY=your-key-here  # Optional - for AI validation
```

### Step 3: Setup PostgreSQL Database

You need PostgreSQL installed. Create the database and tables:

```powershell
# Create database (in psql or pgAdmin)
CREATE DATABASE nepse_floorsheet;

# Run schema
psql -U your_user -d nepse_floorsheet -f db\schema.sql
```

Or use SQLAlchemy models:
```powershell
python -m db.models
```

### Step 4: Test Scraper (Fix Selectors)

⚠️ **IMPORTANT**: The scraper's CSS selectors need to be tested on the real NepseAlpha website:

```powershell
# Activate venv first
.\venv\Scripts\Activate.ps1

# Run manual scrape to test
python -m scraper.nepse_scraper --once
```

**Open `scraper/nepse_scraper.py` and fix the `TODO` comments** - these are placeholder CSS selectors that need to match the actual NepseAlpha website HTML.

### Step 5: Start Python FastAPI Backend

```powershell
# Activate venv
.\venv\Scripts\Activate.ps1

# Start API server (also starts background scheduler)
uvicorn api.main:app --reload --port 8000
```

The API will now run at: `http://localhost:8000`

### Step 6: Test the API

```powershell
# Health check
Invoke-RestMethod -Uri "http://localhost:8000/health"

# Get today's floorsheet
Invoke-RestMethod -Uri "http://localhost:8000/floorsheet/2026-06-15"
```

### Step 7: Connect to Next.js App

Your Next.js app is already configured to use `http://localhost:8000` as fallback. 

To use a different URL, add to `.env.local`:
```env
NEPSE_PIPELINE_URL=http://localhost:8000
```

---

## 📊 How It Works

**Data Flow:**
1. Your broker-analysis API calls Python FastAPI backend
2. FastAPI serves from PostgreSQL cache (fast)
3. If not cached, FastAPI triggers on-demand scrape from NepseAlpha
4. Scraper uses Playwright to fetch + parse HTML
5. Validator checks data quality (rule-based + optional AI)
6. Change detector prevents duplicate DB writes
7. Scheduler auto-refreshes every 15 min during market hours

**Scheduler:**
- Runs automatically during market hours (11:00-15:00 NPT)
- Every 15 minutes
- Skips if data hasn't changed (hash-based diff)

---

## 🔧 Troubleshooting

### "No module named 'xxx'"
```powershell
# Make sure venv is activated
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### "Playwright browser not found"
```powershell
playwright install chromium
```

### "Connection refused" on port 8000
```powershell
# Make sure FastAPI is running
uvicorn api.main:app --reload --port 8000
```

### Scraper returns empty data
**Fix the CSS selectors** in `scraper/nepse_scraper.py`:
1. Open NepseAlpha in browser
2. Open DevTools (F12)
3. Inspect the floorsheet table HTML
4. Update the selector strings marked with `TODO`

---

## 📝 What to Fix in Scraper

Open `nepse-pipeline/scraper/nepse_scraper.py` and update these selectors:

```python
# TODO: Fix these CSS selectors based on actual NepseAlpha HTML
SYMBOL_SELECTOR = "td.symbol"  # Change to actual selector
BROKER_SELECTOR = "td.broker"  # Change to actual selector
QUANTITY_SELECTOR = "td.quantity"  # Change to actual selector
RATE_SELECTOR = "td.rate"  # Change to actual selector
AMOUNT_SELECTOR = "td.amount"  # Change to actual selector
```

**How to find selectors:**
1. Visit https://nepsealpha.com/floorsheet
2. Right-click → Inspect
3. Find the table element
4. Copy the class/id from the HTML
5. Update the Python file

---

## ✅ Verification

Once setup is complete, test your broker-analysis page:

1. Start Python backend: `uvicorn api.main:app --port 8000`
2. Start Next.js: `npm run dev`
3. Visit: `http://localhost:3000/broker-analysis`
4. Check console logs - should see: `[broker-analysis] Python pipeline floorsheet: XXX items`

---

## 🎯 Benefits

✅ **Real floorsheet data** from NepseAlpha (when NEPSE API is down)  
✅ **Auto-refresh** every 15 min during market hours  
✅ **Cached** in PostgreSQL (fast)  
✅ **Validated** (rule-based + AI anomaly detection)  
✅ **Change detection** (prevents duplicate writes)  
✅ **On-demand scraping** for missing dates  

---

## 📚 Documentation

- Pipeline README: `nepse-pipeline/README.md`
- Frontend integration: `nepse-pipeline/docs/frontend_integration.md`
- Selector research notes: `nepse-pipeline/docs/selector_research_notes.md`
