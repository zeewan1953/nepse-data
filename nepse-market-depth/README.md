# NEPSE Market Depth Data Platform

A complete production-ready system for capturing, storing, and displaying real-time market depth (order book) data from Nepal Stock Exchange (NEPSE).

## 🎯 Overview

This platform provides:
- **Live Market Depth Capture** - Real-time bid/ask data collection
- **Historical Database** - PostgreSQL storage with full history
- **Change Detection** - Smart snapshot system to avoid duplicates
- **REST + WebSocket APIs** - Fast data access with real-time updates
- **Web Dashboard** - Live order book visualization
- **Android App** - Mobile app with real-time WebSocket updates
- **Docker Deployment** - One-command deployment

## 🏗️ Architecture

```
┌─────────────────┐
│   Collector     │ ← Playwright browser automation
│   (Python)      │ ← Manual login, session management
└────────┬────────┘
         │
         ├─→ PostgreSQL (Historical data)
         └─→ Redis (Cache + Pub/Sub)
              ↑
         ┌────┴────┐
         │ FastAPI  │ ← REST APIs + WebSocket
         └────┬────┘
              │
         ┌────┴────┐
         │  Nginx   │ ← Reverse proxy
         └────┬────┘
              │
    ┌─────────┴─────────┐
    │                   │
Web Dashboard      Android App
(Next.js)          (Flutter)
```

## 📁 Project Structure

```
nepse-market-depth/
├── backend/              # FastAPI backend
│   ├── api/             # REST API routers
│   ├── core/            # Config, database, Redis
│   ├── main.py          # FastAPI app
│   └── Dockerfile
├── collector/           # Data collector
│   ├── core/           # Session, parser, snapshot
│   ├── main.py         # Main collector loop
│   └── Dockerfile
├── db/                 # Database schema
│   └── schema.sql
├── nginx/             # Nginx config
│   └── nginx.conf
├── web/              # Web dashboard
│   ├── app/
│   └── package.json
├── mobile/          # Android app
│   ├── lib/
│   └── pubspec.yaml
└── docker-compose.yml
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- 4GB+ RAM
- 10GB+ disk space

### 1. Clone and Setup

```bash
cd nepse-market-depth
```

### 2. Start All Services

```bash
docker-compose up -d --build
```

This will start:
- PostgreSQL on port 5432
- Redis on port 6379
- FastAPI on port 8000
- Nginx on port 80

### 3. First-Time Login

The collector needs manual login to the trading platform:

```bash
# View collector logs
docker-compose logs -f collector

# When prompted, the browser will open
# Login to https://tms.nepalstock.com
# Session will be saved automatically
```

### 4. Access the System

- **API Documentation**: http://localhost/docs
- **Web Dashboard**: Build and run separately (see below)
- **Android App**: Build with Flutter (see below)

## 🔧 Development Setup

### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Collector

```bash
cd collector
pip install -r requirements.txt
playwright install chromium
python main.py
```

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

## 📊 API Endpoints

### REST APIs

- `GET /api/symbols` - Get all available symbols
- `GET /api/depth/{symbol}` - Get latest market depth
- `GET /api/depth/latest/{symbol}` - Alias for latest
- `GET /api/depth/history/{symbol}?limit=100` - Get historical data
- `GET /api/depth/compare/{symbol}?time1=...&time2=...` - Compare two timestamps

### WebSocket

- `WS /ws/depth/{symbol}` - Real-time updates

Example WebSocket message:
```json
{
  "type": "update",
  "data": {
    "symbol": "NABIL",
    "timestamp": "2026-01-01T10:30:00",
    "bids": [{"price": 950, "qty": 1000}],
    "asks": [{"price": 952, "qty": 1200}]
  }
}
```

## 🗄️ Database Schema

### Tables

**symbols**
- symbol (PK)
- company_name
- is_active

**market_depth**
- id (PK)
- symbol (FK)
- snapshot_time
- bids (JSONB)
- asks (JSONB)
- total_bid_qty (auto-calculated)
- total_ask_qty (auto-calculated)

**change_log**
- id (PK)
- symbol (FK)
- old_data (JSONB)
- new_data (JSONB)
- changed_at

### Views

- `latest_market_depth` - Latest snapshot per symbol

## ⚙️ Configuration

### Environment Variables

**Backend & Collector**
```env
DATABASE_URL=postgresql://nepse:nepse123@postgres:5432/nepse_depth
REDIS_URL=redis://redis:6379
COLLECTION_INTERVAL=60  # seconds
```

**Collector Specific**
```env
SESSION_DIR=/app/session
HEADLESS=true
SLOW_MO=0
```

### Market Hours

Default: 11:00 AM - 3:00 PM Nepal Time (UTC+5:45)

Edit in `collector/core/config.py`:
```python
MARKET_HOURS_START: str = "11:00"
MARKET_HOURS_END: str = "15:00"
```

## 🔐 Security

- ✅ No password storage (session-based auth only)
- ✅ Rate limiting (10 req/s per IP)
- ✅ CORS protection
- ✅ Secure headers (X-Frame-Options, XSS-Protection, etc.)
- ✅ Container isolation

## 📱 Web Dashboard Features

- Live market depth display
- Symbol selector
- Auto-refresh (5 seconds)
- WebSocket real-time updates
- Bid/Ask visualization
- Summary stats (spread, best bid/ask)
- Responsive design

## 📱 Android App Features

- Material Design 3
- Real-time WebSocket updates
- Symbol search
- Connection status indicator
- Pull-to-refresh
- Offline support

## 🛠️ Maintenance

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f collector
docker-compose logs -f fastapi
```

### Restart Services

```bash
docker-compose restart
```

### Stop All Services

```bash
docker-compose down
```

### Backup Database

```bash
docker exec nepse_postgres pg_dump -U nepse nepse_depth > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker exec -i nepse_postgres psql -U nepse nepse_depth
```

## 📈 Monitoring

### Health Checks

```bash
# API health
curl http://localhost/health

# PostgreSQL
docker exec nepse_postgres pg_isready -U nepse

# Redis
docker exec nepse_redis redis-cli ping
```

### Database Stats

```sql
-- Total snapshots
SELECT COUNT(*) FROM market_depth;

-- Latest snapshot per symbol
SELECT * FROM latest_market_depth;

-- Data size
SELECT pg_size_pretty(pg_database_size('nepse_depth'));
```

## 🐛 Troubleshooting

### Collector Can't Login

```bash
# Run collector in non-headless mode
docker-compose exec collector bash
export HEADLESS=false
python main.py
```

### WebSocket Not Connecting

Check Nginx config has WebSocket support:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "Upgrade";
```

### Database Connection Issues

```bash
# Check if database is running
docker-compose ps

# Restart database
docker-compose restart postgres
```

## 📊 Performance

- **API Response Time**: < 50ms (cached), < 200ms (database)
- **WebSocket Latency**: < 100ms
- **Data Collection**: 2-5 seconds per symbol
- **Storage**: ~1KB per snapshot per symbol

## 🔄 Updates

### Update Code

```bash
git pull
docker-compose up -d --build
```

### Update Database Schema

```bash
docker exec -i nepse_postgres psql -U nepse nepse_depth < db/schema.sql
```

## 📝 License

MIT License

## 🤝 Contributing

Contributions welcome! Please open an issue first.

## 📞 Support

For issues and questions, please open an issue on GitHub.

## ✅ Checklist

Before going live:

- [ ] Change database passwords
- [ ] Configure SSL in Nginx
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Test collector login
- [ ] Verify WebSocket connections
- [ ] Test web dashboard
- [ ] Test Android app
- [ ] Review rate limits
- [ ] Set up logging

## 🎉 Production Deployment

For production deployment on VPS:

1. **Use strong passwords** in `docker-compose.yml`
2. **Enable SSL** in Nginx
3. **Set up monitoring** (Prometheus, Grafana)
4. **Configure backups** (pg_dump cron job)
5. **Use secrets management** (Docker secrets, Vault)
6. **Set up logging** (ELK stack, Loki)
7. **Configure alerts** (email, Slack)

## 📚 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Playwright Documentation](https://playwright.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/docs/)
- [Flutter Documentation](https://flutter.dev/docs)

---

**Built with ❤️ for NEPSE traders**
# NEPSE Market Depth Data Platform

Complete production-ready system for capturing, storing, and analyzing live Market Depth (Order Book) data from NEPSE/TMS.

## 📋 Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Security](#security)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     NEPSE/TMS Platform                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              ENGINE 1: Live Session Connector               │
│  • Playwright browser automation                            │
│  • Manual login with session persistence                    │
│  • Automatic reconnection                                   │
│  • Market hours scheduling                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 ENGINE 2: Data Parser                       │
│  • DOM extraction from trading platform                     │
│  • WebSocket interception (if available)                    │
│  • Data normalization to JSON                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               ENGINE 3: Snapshot Engine                     │
│  • Change detection                                         │
│  • PostgreSQL storage                                       │
│  • Redis caching                                            │
│  • Historical records                                       │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
─────────────────┐     ┌─────────────────┐
│   PostgreSQL    │     │     Redis       │
│  (Historical)   │     │   (Cache)       │
└────────┬────────     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Backend                            │
│  • REST APIs                                                │
│  • WebSocket streaming                                      │
│  • Rate limiting                                            │
│  • Authentication                                           │
└────────┬───────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                 ┌─────────────────┐
│  Web Dashboard  │                 │  Android App    │
│   (Next.js)     │                 │   (Flutter)     │
└─────────────────┘                 └─────────────────┘
```

## ✨ Features

### Data Collection
- ✅ Automated browser-based data collection using Playwright
- ✅ Session-based authentication (no password storage)
- ✅ Automatic reconnection on session expiry
- ✅ Market hours scheduling (11 AM - 3 PM Nepal Time)
- ✅ 1-minute snapshot intervals
- ✅ Change detection (only saves modified data)

### Data Storage
- ✅ PostgreSQL for historical data
- ✅ Redis for real-time caching
- ✅ JSONB storage for flexible order book data
- ✅ Automatic metrics calculation (spread, totals)
- ✅ Change logging

### APIs
- ✅ REST API with pagination and filtering
- ✅ WebSocket for real-time updates
- ✅ Rate limiting (60 requests/minute)
- ✅ Comprehensive error handling
- ✅ API documentation (Swagger/OpenAPI)

### Web Dashboard
- ✅ Live market depth display
- ✅ Symbol search and selection
- ✅ Auto-refresh (5-second intervals)
- ✅ Historical snapshot viewer
- ✅ Responsive design
- ✅ Clean, professional UI

### Android App (Flutter)
- ✅ Live market depth
- ✅ Real-time WebSocket updates
- ✅ Symbol search
- ✅ Historical view
- ✅ Clean Material Design UI

## 🛠️ Tech Stack

### Backend
- **Python 3.11+**
- **FastAPI** - Modern async web framework
- **PostgreSQL 15** - Primary database
- **Redis 7** - Caching layer
- **Playwright** - Browser automation
- **asyncpg** - Async PostgreSQL driver
- **Uvicorn** - ASGI server

### Frontend
- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization

### Mobile
- **Flutter** - Cross-platform mobile
- **WebSocket** - Real-time updates

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Nginx** - Reverse proxy
- **GitHub Actions** - CI/CD (optional)

## 📦 Installation

### Prerequisites

- Docker and Docker Compose
- Git
- 4GB+ RAM
- 10GB+ disk space

### Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/nepse-market-depth.git
cd nepse-market-depth

# Copy environment file
cp .env.example .env

# Edit environment variables
nano .env

# Build and start services
docker-compose up -d --build

# Check logs
docker-compose logs -f
```

### Manual Installation

#### 1. Database Setup

```bash
# Install PostgreSQL 15
# Create database
createdb nepse_market_depth

# Run schema
psql -d nepse_market_depth -f db/schema.sql
```

#### 2. Redis Setup

```bash
# Install Redis 7
redis-server
```

#### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Run migrations (if using Alembic)
alembic upgrade head

# Start server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### 4. Collector Setup

```bash
cd collector

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium

# Start collector
python main.py
```

#### 5. Web Dashboard Setup

```bash
cd web

# Install dependencies
npm install

# Start development server
npm run dev
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
POSTGRES_PASSWORD=your_secure_password
DATABASE_URL=postgresql://nepse_user:your_secure_password@postgres:5432/nepse_market_depth

# Redis
REDIS_URL=redis://redis:6379/0

# Application
SECRET_KEY=your-secret-key-change-in-production
DEBUG=false

# Market Hours (Nepal Time)
MARKET_HOURS_START=11:00
MARKET_HOURS_END=15:00
TIMEZONE=Asia/Kathmandu

# Collector
SNAPSHOT_INTERVAL=60
SESSION_TIMEOUT=300
RECONNECT_DELAY=30
TRADING_PLATFORM_URL=https://tms.nepalstock.com

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
```

## 🚀 Usage

### First Time Setup

1. **Start all services:**
   ```bash
   docker-compose up -d
   ```

2. **Access the collector login page:**
   - Open browser to `http://localhost:8000`
   - Complete manual login on trading platform
   - Session will be saved automatically

3. **Access the web dashboard:**
   - Open `http://localhost`
   - Select a symbol to view market depth

### API Endpoints

#### REST APIs

```bash
# Get all symbols
GET /api/v1/symbols

# Get market depth for symbol
GET /api/v1/depth/{symbol}

# Get latest market depth
GET /api/v1/depth/latest/{symbol}

# Get historical data
GET /api/v1/depth/history/{symbol}?limit=100&offset=0

# Compare two timestamps
GET /api/v1/depth/compare/{symbol}?time1=2026-01-01T10:00:00&time2=2026-01-01T11:00:00
```

#### WebSocket

```javascript
// Connect to real-time updates
const ws = new WebSocket('ws://localhost/ws/depth/NABIL');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Market depth update:', data);
};

// Keep alive
setInterval(() => ws.send('ping'), 30000);
```

### Web Dashboard Features

- **Symbol Selection**: Choose from dropdown
- **Auto-refresh**: Toggle 5-second auto-refresh
- **Manual refresh**: Click refresh button
- **Live display**: Real-time bid/ask data
- **Summary stats**: Spread, best bid/ask

## 📚 API Documentation

Access interactive API documentation at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Example Responses

#### GET /api/v1/depth/NABIL

```json
{
  "symbol": "NABIL",
  "timestamp": "2026-01-01T10:30:00+00:00",
  "bids": [
    {"price": 950.0, "qty": 1000},
    {"price": 949.0, "qty": 500}
  ],
  "asks": [
    {"price": 952.0, "qty": 1200},
    {"price": 953.0, "qty": 800}
  ],
  "total_bid_qty": 1500,
  "total_ask_qty": 2000,
  "bid_ask_spread": 2.0
}
```

##  Deployment

### Production Deployment with Docker

```bash
# Build for production
docker-compose -f docker-compose.yml build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f fastapi

# Stop services
docker-compose down
```

### With SSL (HTTPS)

1. Place SSL certificates in `nginx/ssl/`:
   - `cert.pem`
   - `key.pem`

2. Update `nginx/nginx.conf` to enable HTTPS

3. Restart Nginx:
   ```bash
   docker-compose restart nginx
   ```

### Kubernetes Deployment (Optional)

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check pods
kubectl get pods

# View logs
kubectl logs -f deployment/nepse-fastapi
```

##  Security

### Best Practices Implemented

- ✅ **No password storage** - Session-based authentication only
- ✅ **Rate limiting** - 60 requests/minute per IP
- ✅ **CORS configuration** - Restrict origins in production
- ✅ **SQL injection prevention** - Parameterized queries
- ✅ **XSS protection** - Security headers
- ✅ **Container isolation** - Docker security
- ✅ **Non-root users** - Containers run as non-root

### Security Checklist

- [ ] Change default passwords in `.env`
- [ ] Enable HTTPS in production
- [ ] Configure CORS for your domain
- [ ] Set up firewall rules
- [ ] Enable database encryption at rest
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity

## 📊 Database Schema

### Tables

#### `symbols`
- `id` - Primary key
- `symbol` - Stock symbol (unique)
- `company_name` - Full company name
- `sector` - Industry sector
- `is_active` - Active status

#### `market_depth`
- `id` - Primary key
- `symbol` - Stock symbol (FK)
- `snapshot_time` - Timestamp
- `bids` - JSONB (bid orders)
- `asks` - JSONB (ask orders)
- `total_bid_qty` - Calculated total
- `total_ask_qty` - Calculated total
- `bid_ask_spread` - Calculated spread

#### `change_log`
- `id` - Primary key
- `symbol` - Stock symbol (FK)
- `old_data` - Previous snapshot
- `new_data` - New snapshot
- `change_type` - Type of change
- `changed_at` - Timestamp

## 🔧 Troubleshooting

### Common Issues

#### Collector not starting
```bash
# Check logs
docker-compose logs collector

# Verify session exists
ls collector/auth/

# Re-login if needed
docker-compose restart collector
```

#### Database connection errors
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Verify credentials
docker-compose exec postgres psql -U nepse_user -d nepse_market_depth
```

#### Redis connection errors
```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli ping
```

## 📝 Development

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Web dashboard tests
cd web
npm test
```

### Code Style

```bash
# Python (Black + Flake8)
black .
flake8 .

# TypeScript (ESLint)
cd web
npm run lint
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

##  Support

For issues and questions:
- GitHub Issues: https://github.com/yourusername/nepse-market-depth/issues
- Email: support@example.com

## 🗺️ Roadmap

- [ ] Mobile app push notifications
- [ ] Advanced analytics dashboard
- [ ] Machine learning predictions
- [ ] Multi-exchange support
- [ ] Historical data export
- [ ] Custom alerts system

---

**Built with ❤️ for Nepal Stock Exchange traders**
