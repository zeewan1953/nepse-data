from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncpg
import redis.asyncio as redis
import json
from typing import Dict, Set

from core.config import settings
from core.database import init_db, get_db_pool
from core.redis import init_redis, get_redis
from api.symbols_router import router as symbols_router
from api.depth_router import router as depth_router
from api.orderflow_router import router as orderflow_router

db_pool = None
redis_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, redis_client
    print("🚀 Starting NEPSE Order Flow API...")
    db_pool = await init_db()
    redis_client = await init_redis()
    print("✅ Services initialized")
    yield
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.close()
    print("✅ Shutdown complete")

app = FastAPI(
    title="NEPSE Order Flow API",
    description="Real-time order flow analytics for Nepal Stock Exchange",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, symbol: str):
        await websocket.accept()
        if symbol not in self.active_connections:
            self.active_connections[symbol] = set()
        self.active_connections[symbol].add(websocket)
    
    def disconnect(self, websocket: WebSocket, symbol: str):
        if symbol in self.active_connections:
            self.active_connections[symbol].discard(websocket)
    
    async def broadcast(self, symbol: str, message: dict):
        if symbol in self.active_connections:
            for connection in self.active_connections[symbol]:
                try:
                    await connection.send_json(message)
                except:
                    pass

manager = ConnectionManager()

app.include_router(symbols_router, prefix="/api", tags=["symbols"])
app.include_router(depth_router, prefix="/api", tags=["market-depth"])
app.include_router(orderflow_router, prefix="/api", tags=["order-flow"])

@app.websocket("/ws/orderflow/{symbol}")
async def websocket_endpoint(websocket: WebSocket, symbol: str):
    await manager.connect(websocket, symbol)
    
    try:
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"orderflow:{symbol}")
        
        # Send latest data
        latest = await redis_client.get(f"latest_orderflow:{symbol}")
        if latest:
            await websocket.send_json({
                "type": "initial",
                "data": json.loads(latest)
            })
        
        # Listen for updates
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                await websocket.send_json({
                    "type": "update",
                    "data": data
                })
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, symbol)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket, symbol)

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "orderflow-api"}

@app.get("/")
async def root():
    return {
        "message": "NEPSE Order Flow API",
        "version": "1.0.0",
        "docs": "/docs",
        "websocket": "/ws/orderflow/{symbol}"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
