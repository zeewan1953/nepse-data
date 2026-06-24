from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncpg
import redis.asyncio as redis
import os
from typing import Dict, List, Set
import json

from api.symbols_router import router as symbols_router
from api.depth_router import router as depth_router
from core.config import settings
from core.database import init_db, get_db_pool
from core.redis import init_redis, get_redis

# Global connection pools
db_pool = None
redis_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    global db_pool, redis_client
    
    # Startup
    print("🚀 Starting NEPSE Market Depth API...")
    db_pool = await init_db()
    redis_client = await init_redis()
    print("✅ Database and Redis connections established")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down NEPSE Market Depth API...")
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.close()
    print("✅ Connections closed")

# Create FastAPI app
app = FastAPI(
    title="NEPSE Market Depth API",
    description="Real-time market depth data for Nepal Stock Exchange",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, symbol: str):
        await websocket.accept()
        if symbol not in self.active_connections:
            self.active_connections[symbol] = set()
        self.active_connections[symbol].add(websocket)
        print(f"✅ WebSocket connected: {symbol} ({len(self.active_connections[symbol])} clients)")
    
    def disconnect(self, websocket: WebSocket, symbol: str):
        if symbol in self.active_connections:
            self.active_connections[symbol].discard(websocket)
            if not self.active_connections[symbol]:
                del self.active_connections[symbol]
        print(f"❌ WebSocket disconnected: {symbol}")
    
    async def broadcast(self, symbol: str, message: dict):
        if symbol in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[symbol]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"Error sending to WebSocket: {e}")
                    disconnected.add(connection)
            
            # Remove disconnected clients
            for conn in disconnected:
                self.active_connections[symbol].discard(conn)

manager = ConnectionManager()

# Include routers
app.include_router(symbols_router, prefix="/api", tags=["symbols"])
app.include_router(depth_router, prefix="/api", tags=["market-depth"])

# WebSocket endpoint
@app.websocket("/ws/depth/{symbol}")
async def websocket_endpoint(websocket: WebSocket, symbol: str):
    await manager.connect(websocket, symbol)
    
    try:
        # Subscribe to Redis pub/sub
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"depth:{symbol}")
        
        # Send latest data immediately
        try:
            latest = await redis_client.get(f"latest_depth:{symbol}")
            if latest:
                await websocket.send_json({
                    "type": "initial",
                    "data": json.loads(latest)
                })
        except Exception as e:
            print(f"Error fetching initial data: {e}")
        
        # Listen for updates
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await websocket.send_json({
                        "type": "update",
                        "data": data
                    })
                except Exception as e:
                    print(f"Error processing message: {e}")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, symbol)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket, symbol)
    finally:
        try:
            await pubsub.unsubscribe(f"depth:{symbol}")
            await pubsub.close()
        except:
            pass

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "nepse-market-depth-api"}

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "NEPSE Market Depth API",
        "version": "1.0.0",
        "docs": "/docs",
        "websocket": "/ws/depth/{symbol}"
    }

# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    print(f"Global error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
"""
NEPSE Market Depth - FastAPI Backend
Main Application Entry Point
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Optional
import asyncpg
import redis.asyncio as aioredis
import json
import logging
from datetime import datetime, timezone
from pydantic import BaseModel

# Import routers
from api import symbols_router, depth_router
from websocket import manager as ws_manager
from core.config import settings
from core.database import init_db, close_db, get_db_pool
from core.redis import init_redis, close_redis, get_redis

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Application lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources"""
    # Startup
    logger.info("Starting NEPSE Market Depth API...")
    await init_db()
    await init_redis()
    logger.info("Database and Redis initialized")
    
    yield
    
    # Shutdown
    logger.info("Shutting down NEPSE Market Depth API...")
    await close_db()
    await close_redis()
    logger.info("Resources cleaned up")


# Create FastAPI app
app = FastAPI(
    title="NEPSE Market Depth API",
    description="Real-time market depth data for Nepal Stock Exchange",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0"
    }


# Include routers
app.include_router(symbols_router.router, prefix="/api/v1", tags=["Symbols"])
app.include_router(depth_router.router, prefix="/api/v1", tags=["Market Depth"])


# WebSocket endpoint
@app.websocket("/ws/depth/{symbol}")
async def websocket_depth(websocket: WebSocket, symbol: str):
    """WebSocket endpoint for real-time market depth updates"""
    await ws_manager.connect(websocket, symbol)
    try:
        while True:
            # Keep connection alive and listen for client messages
            data = await websocket.receive_text()
            # Handle client messages if needed
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, symbol)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket, symbol)


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "NEPSE Market Depth API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
