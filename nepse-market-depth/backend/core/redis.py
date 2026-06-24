import redis.asyncio as redis
from typing import Optional, Dict, Any
from core.config import settings
import json

redis_client: Optional[redis.Redis] = None

async def init_redis():
    """Initialize Redis connection"""
    global redis_client
    try:
        redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
        # Test connection
        await redis_client.ping()
        print("✅ Redis connection established")
        return redis_client
    except Exception as e:
        print(f"❌ Redis connection error: {e}")
        raise

async def get_redis():
    """Get Redis client"""
    if redis_client is None:
        raise RuntimeError("Redis client not initialized")
    return redis_client

async def cache_market_depth(symbol: str, data: Dict[str, Any]):
    """Cache market depth data"""
    try:
        key = f"market_depth:{symbol}"
        await redis_client.setex(
            key,
            settings.REDIS_CACHE_TTL,
            json.dumps(data)
        )
        
        # Also cache as latest
        latest_key = f"latest_depth:{symbol}"
        await redis_client.setex(
            latest_key,
            settings.REDIS_CACHE_TTL,
            json.dumps(data)
        )
    except Exception as e:
        print(f"Error caching market depth: {e}")

async def get_cached_market_depth(symbol: str):
    """Get cached market depth data"""
    try:
        key = f"market_depth:{symbol}"
        data = await redis_client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        print(f"Error getting cached market depth: {e}")
        return None

async def publish_depth_update(symbol: str, data: Dict[str, Any]):
    """Publish depth update to Redis pub/sub"""
    try:
        channel = f"depth:{symbol}"
        await redis_client.publish(channel, json.dumps(data))
    except Exception as e:
        print(f"Error publishing depth update: {e}")

async def cache_symbols(symbols: list):
    """Cache symbols list"""
    try:
        await redis_client.setex(
            "symbols",
            3600,  # 1 hour
            json.dumps(symbols)
        )
    except Exception as e:
        print(f"Error caching symbols: {e}")

async def get_cached_symbols():
    """Get cached symbols"""
    try:
        data = await redis_client.get("symbols")
        return json.loads(data) if data else None
    except Exception as e:
        print(f"Error getting cached symbols: {e}")
        return None
"""
Redis Connection and Cache Management
"""

import redis.asyncio as aioredis
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from core.config import settings

logger = logging.getLogger(__name__)

# Global Redis client
_redis: Optional[aioredis.Redis] = None


async def init_redis():
    """Initialize Redis connection"""
    global _redis
    
    try:
        _redis = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
        logger.info("Redis initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Redis: {e}")
        raise


async def close_redis():
    """Close Redis connection"""
    global _redis
    
    if _redis:
        await _redis.close()
        logger.info("Redis connection closed")


def get_redis() -> aioredis.Redis:
    """Get Redis client"""
    if not _redis:
        raise RuntimeError("Redis not initialized")
    return _redis


# Cache keys
MARKET_DEPTH_KEY = "market_depth:{symbol}"
LATEST_DEPTH_KEY = "latest_depth:{symbol}"
SYMBOLS_KEY = "symbols"


async def cache_market_depth(symbol: str, data: Dict[str, Any]):
    """Cache market depth data"""
    try:
        redis = get_redis()
        key = MARKET_DEPTH_KEY.format(symbol=symbol)
        
        # Store with timestamp
        data['cached_at'] = datetime.now(timezone.utc).isoformat()
        
        # Cache for 5 minutes
        await redis.setex(key, 300, json.dumps(data))
        
        # Also store in latest key
        latest_key = LATEST_DEPTH_KEY.format(symbol=symbol)
        await redis.setex(latest_key, 3600, json.dumps(data))  # 1 hour
        
        logger.debug(f"Cached market depth for {symbol}")
    except Exception as e:
        logger.error(f"Failed to cache market depth: {e}")


async def get_cached_market_depth(symbol: str) -> Optional[Dict[str, Any]]:
    """Get cached market depth data"""
    try:
        redis = get_redis()
        key = MARKET_DEPTH_KEY.format(symbol=symbol)
        
        data = await redis.get(key)
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        logger.error(f"Failed to get cached market depth: {e}")
        return None


async def get_latest_depth(symbol: str) -> Optional[Dict[str, Any]]:
    """Get latest market depth from cache"""
    try:
        redis = get_redis()
        key = LATEST_DEPTH_KEY.format(symbol=symbol)
        
        data = await redis.get(key)
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        logger.error(f"Failed to get latest depth: {e}")
        return None


async def cache_symbols(symbols: list):
    """Cache symbols list"""
    try:
        redis = get_redis()
        await redis.setex(SYMBOLS_KEY, 3600, json.dumps(symbols))  # 1 hour
        logger.debug("Cached symbols list")
    except Exception as e:
        logger.error(f"Failed to cache symbols: {e}")


async def get_cached_symbols() -> Optional[list]:
    """Get cached symbols list"""
    try:
        redis = get_redis()
        data = await redis.get(SYMBOLS_KEY)
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        logger.error(f"Failed to get cached symbols: {e}")
        return None


async def publish_depth_update(symbol: str, data: Dict[str, Any]):
    """Publish market depth update to WebSocket subscribers"""
    try:
        redis = get_redis()
        channel = f"depth_updates:{symbol}"
        
        message = {
            'symbol': symbol,
            'data': data,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        await redis.publish(channel, json.dumps(message))
        logger.debug(f"Published depth update for {symbol}")
    except Exception as e:
        logger.error(f"Failed to publish depth update: {e}")
