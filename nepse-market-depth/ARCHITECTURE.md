# NEPSE Market Depth - Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NEPSE/TMS Trading Platform                       │
│                        (https://tms.nepalstock.com)                     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 │ HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     ENGINE 1: Live Session Connector                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Playwright Browser Automation                                  │   │
│  │  • Headless Chromium                                            │   │
│  │  • Session persistence (auth.json)                              │   │
│  │  • Manual login workflow                                        │   │
│  │  • Auto-reconnect on expiry                                     │   │
│  │  • Market hours scheduler (11AM-3PM NPT)                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 │ DOM / WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ENGINE 2: Data Parser                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Market Depth Parser                                            │   │
│  │  • Extract bid/ask tables                                       │   │
│  │  • Normalize to JSON                                            │   │
│  │  • WebSocket interception (if available)                        │   │
│  │  • Data validation                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 │ JSON
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ENGINE 3: Snapshot Engine                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Change Detection & Storage                                     │   │
│  │  • Compare with previous snapshot                               │   │
│  │  • Save only changes                                            │   │
│  │  • 1-minute intervals                                           │   │
│  │  • Historical records                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────┬───────────────────────────────────────┬────────────────────┘
             │                                       │
             │                                       │
    ┌────────▼────────┐                     ┌────────▼────────
    │   PostgreSQL    │                     │     Redis       │
    │                 │                     │                 │
    │ • market_depth  │                     │ • Latest cache  │
    │ • change_log    │                     │ • Pub/Sub       │
    │ • symbols       │                     │ • Real-time     │
    │                 │                     │                 │
    │ JSONB storage   │                     │ 5-min TTL       │
    │ Full history    │                     │ 1-hour latest   │
    └────────┬────────┘                     └────────┬────────┘
             │                                       │
             └───────────────┬───────────────────────┘
                             │
                             │ SQL / Redis
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend                                  │
│  ┌─────────────────────────────────────────────────────────────────   │
│  │  REST APIs                                                      │   │
│  │  • GET /api/v1/symbols                                          │   │
│  │  • GET /api/v1/depth/{symbol}                                   │   │
│  │  • GET /api/v1/depth/latest/{symbol}                            │   │
│  │  • GET /api/v1/depth/history/{symbol}                           │   │
│  │  • GET /api/v1/depth/compare/{symbol}                           │   │
│  │                                                                 │   │
│  │  WebSocket                                                      │   │
│  │  • WS /ws/depth/{symbol}                                        │   │
│  │  • Real-time streaming                                          │   │
│  │  • Connection management                                        │   │
│  │                                                                 │   │
│  │  Security                                                       │   │
│  │  • Rate limiting (60/min)                                       │   │
│  │  • CORS configuration                                           │   │
│  │  • Error handling                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────┬───────────────────────────────────────┬────────────────────┘
             │                                       │
             │ HTTP/WS                               │ HTTP/WS
             ▼                                       ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│    Web Dashboard        │               │   Android App           │
│    (Next.js + React)    │               │   (Flutter)             │
│                         │               │                         │
│  • Live market depth    │               │  • Live market depth    │
│  • Symbol search        │               │  • Symbol search        │
│  • Auto-refresh (5s)    │               │  • WebSocket updates    │
│  • Historical view      │               │  • Historical view      │
│  • Responsive design    │               │  • Material Design      │
│                         │               │                         │
│  Port: 3000             │               │  APK: Android 5.0+      │
└─────────────────────────┘               └─────────────────────────┘
             │                                       │
             ───────────────┬───────────────────────┘
                             │
                             │ User Access
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Nginx Reverse Proxy                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  • SSL termination                                              │   │
│  │  • Rate limiting                                                │   │
│  │  • Load balancing                                               │   │
│  │  • Security headers                                             │   │
│  │  • WebSocket proxy                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                         Port: 80/443                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Data Collection Flow
```
User Login → Session Saved → Market Opens → Navigate to Symbol → 
Parse DOM → Create Snapshot → Compare with Previous → 
If Changed → Save to DB + Cache in Redis → Publish to WebSocket
```

### 2. API Request Flow
```
Client Request → Nginx → Rate Limit Check → FastAPI → 
Check Redis Cache → If Miss: Query PostgreSQL → 
Return Response → Update Cache
```

### 3. WebSocket Flow
```
Client Connects → WebSocket Manager → Subscribe to Symbol → 
Redis Pub/Sub → New Data Available → Broadcast to All Subscribers → 
Client Receives Update
```

## Database Schema

### PostgreSQL Tables

```sql
symbols
├── id (SERIAL PRIMARY KEY)
├── symbol (VARCHAR UNIQUE)
── company_name (VARCHAR)
├── sector (VARCHAR)
├── is_active (BOOLEAN)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)

market_depth
├── id (SERIAL PRIMARY KEY)
├── symbol (VARCHAR FK)
├── snapshot_time (TIMESTAMP)
├── bids (JSONB)
├── asks (JSONB)
├── total_bid_qty (INTEGER)
── total_ask_qty (INTEGER)
├── bid_ask_spread (DECIMAL)
└── created_at (TIMESTAMP)

change_log
├── id (SERIAL PRIMARY KEY)
├── symbol (VARCHAR FK)
├── old_data (JSONB)
├── new_data (JSONB)
├── change_type (VARCHAR)
── changed_at (TIMESTAMP)
```

## Technology Stack Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Browser Automation** | Playwright | Session management, data extraction |
| **Backend Framework** | FastAPI | REST APIs, WebSocket server |
| **Primary Database** | PostgreSQL 15 | Historical data storage |
| **Cache Layer** | Redis 7 | Real-time caching, pub/sub |
| **Web Frontend** | Next.js 14 | Dashboard UI |
| **Mobile App** | Flutter | Android application |
| **Reverse Proxy** | Nginx | Load balancing, SSL |
| **Containerization** | Docker | Deployment isolation |
| **Orchestration** | Docker Compose | Multi-container management |

## Security Features

1. **No Password Storage**
   - Session-based authentication only
   - auth.json contains session tokens, not credentials

2. **Rate Limiting**
   - 60 requests per minute per IP
   - Prevents API abuse

3. **Container Isolation**
   - Each service runs in isolated container
   - Non-root users inside containers

4. **Network Security**
   - CORS configuration
   - Security headers (X-Frame-Options, X-XSS-Protection)
   - SSL/TLS encryption

5. **Database Security**
   - Parameterized queries (SQL injection prevention)
   - Encrypted connections
   - Role-based access

## Deployment Architecture

```
Production Environment
├── Docker Host
│   ├── Container: nepse_postgres (PostgreSQL 15)
│   ├── Container: nepse_redis (Redis 7)
│   ├── Container: nepse_fastapi (FastAPI + Uvicorn)
│   ├── Container: nepse_collector (Playwright)
│   └── Container: nepse_nginx (Nginx)
│
├── Volumes
│   ├── postgres_data (Persistent DB storage)
│   ├── redis_data (Cache persistence)
│   ├── collector/auth (Session storage)
│   └── nginx/ssl (SSL certificates)
│
└── Networks
    └── nepse_network (Bridge network)
```

## Performance Metrics

- **Data Collection**: Every 60 seconds during market hours
- **API Response Time**: < 100ms (cached), < 500ms (DB query)
- **WebSocket Latency**: < 50ms
- **Database Storage**: ~1MB per symbol per day
- **Redis Memory**: ~10MB for 100 symbols
- **Concurrent WebSocket Connections**: 1000+ per symbol

## Scalability

### Horizontal Scaling
- Add more FastAPI instances behind Nginx
- Redis Cluster for distributed caching
- PostgreSQL read replicas for query distribution

### Vertical Scaling
- Increase container resources (CPU/RAM)
- SSD storage for faster I/O
- Network optimization

## Monitoring & Logging

- **Application Logs**: Structured logging with structlog
- **Database Logs**: PostgreSQL query logs
- **Redis Metrics**: Memory usage, hit/miss ratio
- **WebSocket Metrics**: Active connections, message rate
- **API Metrics**: Request rate, response time, error rate

---

**Version**: 1.0.0  
**Last Updated**: 2026-06-15  
**Maintained By**: Development Team
