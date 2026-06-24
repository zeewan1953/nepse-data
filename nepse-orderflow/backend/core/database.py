import asyncpg
from typing import Optional

pool: Optional[asyncpg.Pool] = None

async def init_db():
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
        print(f"❌ Database error: {e}")
        raise

async def get_db_pool():
    if pool is None:
        raise RuntimeError("Database not initialized")
    return pool

async def execute_query(query: str, *args):
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute_one(query: str, *args):
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)
