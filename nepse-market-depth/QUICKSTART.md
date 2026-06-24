# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Start the System

```bash
cd nepse-market-depth
docker-compose up -d --build
```

Wait for all services to start (about 2-3 minutes).

### Step 2: Check Status

```bash
docker-compose ps
```

You should see:
- ✅ nepse_postgres (healthy)
- ✅ nepse_redis (healthy)
- ✅ nepse_fastapi (running)
- ✅ nepse_collector (running)
- ✅ nepse_nginx (running)

### Step 3: Login to Trading Platform

```bash
# View collector logs
docker-compose logs -f collector
```

When you see "MANUAL LOGIN REQUIRED":
1. The browser will open automatically (if running locally)
2. Go to https://tms.nepalstock.com
3. Login with your credentials
4. Session will be saved automatically

**Note**: If running on a server, you'll need to set `HEADLESS=false` in collector environment.

### Step 4: Access the API

Open your browser: http://localhost/docs

You'll see the FastAPI Swagger documentation with all available endpoints.

### Step 5: Test the System

```bash
# Get available symbols
curl http://localhost/api/symbols

# Get market depth for a symbol
curl http://localhost/api/depth/NABIL
```

## 🎯 What's Next?

### Web Dashboard

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

### Android App

```bash
cd mobile
flutter pub get
flutter run
```

## 📊 Verify Data Collection

Check if data is being collected:

```bash
# View collector logs
docker-compose logs -f collector

# You should see messages like:
# ✅ Saved snapshot for NABIL at 2026-01-01T10:30:00
# ✓ NABIL: 5 bids, 5 asks
```

## 🔍 Common Commands

```bash
# View all logs
docker-compose logs -f

# Stop all services
docker-compose down

# Restart all services
docker-compose restart

# View database
docker exec -it nepse_postgres psql -U nepse nepse_depth

# View Redis
docker exec -it nepse_redis redis-cli
```

## ✅ Success Checklist

- [ ] All containers are running
- [ ] Collector is logged in
- [ ] API returns data
- [ ] Symbols are available
- [ ] Market depth data is collecting

## 🆘 Need Help?

- Check the full [README.md](README.md) for detailed documentation
- View logs: `docker-compose logs -f [service_name]`
- Restart services: `docker-compose restart`

---

**Happy Trading! 📈**
