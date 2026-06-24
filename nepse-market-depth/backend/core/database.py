import asyncpg
from typing import Optional
from core.config import settings
import json

pool: Optional[asyncpg.Pool] = None

async def init_db():
    """Initialize database connection pool"""
    global pool
    try:
        pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=30
        )
        print("✅ Database pool created")
        return pool
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        raise

async def get_db_pool():
    """Get database pool"""
    if pool is None:
        raise RuntimeError("Database pool not initialized")
    return pool

async def execute_query(query: str, *args):
    """Execute a database query"""
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute_one(query: str, *args):
    """Execute query and return single row"""
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def execute_insert(query: str, *args):
    """Execute insert query and return result"""
    async with pool.acquire() as conn:
        return await conn.fetchval(query, *args)
"""
Database Connection Pool
"""

import asyncpg
import json
import logging
from typing import Optional
from core.config import settings

logger = logging.getLogger(__name__)

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def init_db():
    """Initialize database connection pool"""
    global _pool
    
    try:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=5,
            max_size=20,
            command_timeout=60,
            setup=_on_connect
        )
        logger.info("Database pool initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise


async def close_db():
    """Close database connection pool"""
    global _pool
    
    if _pool:
        await _pool.close()
        logger.info("Database pool closed")


async def _on_connect(conn: asyncpg.Connection):
    """Setup connection"""
    await conn.set_type_codec(
        'jsonb',
        schema='pg_catalog',
        encoder=json.dumps,
        decoder=json.loads,
        format='text'
    )


def get_db_pool() -> asyncpg.Pool:
    """Get database connection pool"""
    if not _pool:
        raise RuntimeError("Database pool not initialized")
    return _pool
"""
Database Connection Pool
"""

import asyncpg
import logging
from typing import Optional
from core.config import settings

logger = logging.getLogger(__name__)

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def init_db():
    """Initialize database connection pool"""
    global _pool
    
    try:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=5,
            max_size=20,
            command_timeout=60,
            setup=_on_connect
        )
        logger.info("Database pool initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise


async def close_db():
    """Close database connection pool"""
    global _pool
    
    if _pool:
        await _pool.close()
        logger.info("Database pool closed")


async def _on_connect(conn: asyncpg.Connection):
    """Setup connection"""
    await conn.set_type_codec(
        'jsonb',
        schema='pg_catalog',
        encoder=json.dumps,
        decoder=json.loads,
        format='text'
    )


def get_db_pool() -> asyncpg.Pool:
    """Get database connection pool"""
    if not _pool:
        raise RuntimeError("Database pool not initialized")
    return _pool


import json
