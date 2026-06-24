import redis.asyncio as redis
from typing import Optional, Dict, Any
from core.config import settings
import json

redis_client: Optional[redis.Redis] = None

async def init_redis():
    global redis_client
    try:
        redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
        await redis_client.ping()
        print("✅ Redis connection established")
        return redis_client
    except Exception as e:
        print(f"❌ Redis error: {e}")
        raise

async def get_redis():
    if redis_client is None:
        raise RuntimeError("Redis not initialized")
    return redis_client

async def cache_order_flow(symbol: str, data: Dict[str, Any]):
    try:
        key = f"order_flow:{symbol}"
        await redis_client.setex(key, settings.REDIS_CACHE_TTL, json.dumps(data))
        latest_key = f"latest_orderflow:{symbol}"
        await redis_client.setex(latest_key, settings.REDIS_CACHE_TTL, json.dumps(data))
    except Exception as e:
        print(f"Error caching order flow: {e}")

async def get_cached_order_flow(symbol: str):
    try:
        key = f"order_flow:{symbol}"
        data = await redis_client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        print(f"Error getting cached order flow: {e}")
        return None

async def publish_orderflow_update(symbol: str, data: Dict[str, Any]):
    try:
        channel = f"orderflow:{symbol}"
        await redis_client.publish(channel, json.dumps(data))
    except Exception as e:
        print(f"Error publishing orderflow update: {e}")
