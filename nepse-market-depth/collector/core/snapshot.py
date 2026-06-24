import asyncpg
import redis.asyncio as redis
import json
from typing import Dict, Optional
from datetime import datetime
from core.config import config

class SnapshotEngine:
    """Manage market depth snapshots"""
    
    def __init__(self):
        self.db_pool: asyncpg.Pool = None
        self.redis: redis.Redis = None
    
    async def init(self):
        """Initialize database and Redis connections"""
        self.db_pool = await asyncpg.create_pool(
            config.DATABASE_URL,
            min_size=2,
            max_size=10
        )
        self.redis = redis.from_url(
            config.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
        print("✅ Snapshot engine initialized")
    
    async def save_snapshot(self, data: Dict) -> bool:
        """Save market depth snapshot if changed"""
        try:
            symbol = data["symbol"]
            timestamp = data["timestamp"]
            bids = json.dumps(data["bids"])
            asks = json.dumps(data["asks"])
            
            # Check if data has changed
            last_snapshot = await self.get_latest_snapshot(symbol)
            if last_snapshot and not self._has_changed(last_snapshot, data):
                print(f"⏭️ No change detected for {symbol}, skipping save")
                return False
            
            # Insert new snapshot
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO market_depth (symbol, snapshot_time, bids, asks)
                    VALUES ($1, $2, $3::jsonb, $4::jsonb)
                    """,
                    symbol, timestamp, bids, asks
                )
            
            # Update Redis cache
            await self.redis.setex(
                f"latest_depth:{symbol}",
                300,  # 5 minutes
                json.dumps(data)
            )
            
            # Publish update
            await self.redis.publish(
                f"depth:{symbol}",
                json.dumps(data)
            )
            
            print(f"✅ Saved snapshot for {symbol} at {timestamp}")
            return True
        
        except Exception as e:
            print(f"❌ Error saving snapshot for {data.get('symbol')}: {e}")
            return False
    
    async def get_latest_snapshot(self, symbol: str) -> Optional[Dict]:
        """Get latest snapshot from database"""
        try:
            async with self.db_pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT symbol, snapshot_time, bids, asks
                    FROM market_depth
                    WHERE symbol = $1
                    ORDER BY snapshot_time DESC
                    LIMIT 1
                    """,
                    symbol
                )
                
                if row:
                    return {
                        "symbol": row["symbol"],
                        "timestamp": row["snapshot_time"].isoformat(),
                        "bids": row["bids"] if isinstance(row["bids"], list) else json.loads(row["bids"]),
                        "asks": row["asks"] if isinstance(row["asks"], list) else json.loads(row["asks"])
                    }
                return None
        except Exception as e:
            print(f"Error getting latest snapshot: {e}")
            return None
    
    def _has_changed(self, old_data: Dict, new_data: Dict) -> bool:
        """Check if data has changed"""
        # Compare bids and asks
        old_bids = json.dumps(old_data.get("bids", []), sort_keys=True)
        new_bids = json.dumps(new_data.get("bids", []), sort_keys=True)
        
        old_asks = json.dumps(old_data.get("asks", []), sort_keys=True)
        new_asks = json.dumps(new_data.get("asks", []), sort_keys=True)
        
        return old_bids != new_bids or old_asks != new_asks
    
    async def close(self):
        """Close connections"""
        if self.db_pool:
            await self.db_pool.close()
        if self.redis:
            await self.redis.close()
        print("✅ Snapshot engine connections closed")
"""
Snapshot Engine - Manages market depth snapshots
"""

import asyncpg
import redis.asyncio as aioredis
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from core.config import settings

logger = logging.getLogger(__name__)


class SnapshotEngine:
    """Manages market depth snapshots"""
    
    def __init__(self):
        self.db_pool: Optional[asyncpg.Pool] = None
        self.redis: Optional[aioredis.Redis] = None
        self.previous_snapshots: Dict[str, Dict[str, Any]] = {}
    
    async def initialize(self):
        """Initialize database and Redis connections"""
        # Database
        self.db_pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=2,
            max_size=10
        )
        
        # Redis
        self.redis = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
        
        logger.info("Snapshot engine initialized")
    
    async def shutdown(self):
        """Shutdown connections"""
        if self.db_pool:
            await self.db_pool.close()
        if self.redis:
            await self.redis.close()
        logger.info("Snapshot engine shutdown")
    
    async def process_snapshot(self, snapshot: Dict[str, Any]):
        """Process new market depth snapshot"""
        symbol = snapshot['symbol']
        
        try:
            # Check if data has changed
            previous = self.previous_snapshots.get(symbol)
            
            if previous and self._is_same_data(previous, snapshot):
                logger.debug(f"No changes for {symbol}, skipping")
                return
            
            # Save to database
            await self._save_to_database(snapshot)
            
            # Save to Redis
            await self._save_to_redis(snapshot)
            
            # Update previous snapshot
            self.previous_snapshots[symbol] = snapshot
            
            # Log change
            if previous:
                await self._log_change(symbol, previous, snapshot)
            
            logger.info(f"Saved snapshot for {symbol}")
            
        except Exception as e:
            logger.error(f"Failed to process snapshot for {symbol}: {e}")
    
    def _is_same_data(self, old: Dict[str, Any], new: Dict[str, Any]) -> bool:
        """Check if two snapshots have the same data"""
        try:
            # Compare bids and asks
            old_bids = json.dumps(old.get('bids', []), sort_keys=True)
            new_bids = json.dumps(new.get('bids', []), sort_keys=True)
            
            old_asks = json.dumps(old.get('asks', []), sort_keys=True)
            new_asks = json.dumps(new.get('asks', []), sort_keys=True)
            
            return old_bids == new_bids and old_asks == new_asks
        except:
            return False
    
    async def _save_to_database(self, snapshot: Dict[str, Any]):
        """Save snapshot to PostgreSQL"""
        async with self.db_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO market_depth (symbol, snapshot_time, bids, asks)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (symbol, snapshot_time) DO NOTHING
                """,
                snapshot['symbol'],
                snapshot['timestamp'],
                json.dumps(snapshot['bids']),
                json.dumps(snapshot['asks'])
            )
    
    async def _save_to_redis(self, snapshot: Dict[str, Any]):
        """Save snapshot to Redis"""
        key = f"latest_depth:{snapshot['symbol']}"
        await self.redis.setex(
            key,
            3600,  # 1 hour
            json.dumps(snapshot)
        )
    
    async def _log_change(self, symbol: str, old: Dict[str, Any], new: Dict[str, Any]):
        """Log changes between snapshots"""
        changes = self._detect_changes(old, new)
        
        if changes:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO change_log (symbol, old_data, new_data, change_type, changed_at)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    symbol,
                    json.dumps(old),
                    json.dumps(new),
                    changes[0]['type'],
                    datetime.now(timezone.utc)
                )
    
    def _detect_changes(self, old: Dict[str, Any], new: Dict[str, Any]) -> List[Dict[str, str]]:
        """Detect changes between snapshots"""
        changes = []
        
        # Compare bid prices
        old_bid_prices = {b['price'] for b in old.get('bids', [])}
        new_bid_prices = {b['price'] for b in new.get('bids', [])}
        
        if old_bid_prices != new_bid_prices:
            changes.append({'type': 'price_change', 'side': 'bid'})
        
        # Compare ask prices
        old_ask_prices = {a['price'] for a in old.get('asks', [])}
        new_ask_prices = {a['price'] for a in new.get('asks', [])}
        
        if old_ask_prices != new_ask_prices:
            changes.append({'type': 'price_change', 'side': 'ask'})
        
        # Compare quantities
        old_bid_qty = sum(b['qty'] for b in old.get('bids', []))
        new_bid_qty = sum(b['qty'] for b in new.get('bids', []))
        
        if old_bid_qty != new_bid_qty:
            changes.append({'type': 'qty_change', 'side': 'bid'})
        
        old_ask_qty = sum(a['qty'] for a in old.get('asks', []))
        new_ask_qty = sum(a['qty'] for a in new.get('asks', []))
        
        if old_ask_qty != new_ask_qty:
            changes.append({'type': 'qty_change', 'side': 'ask'})
        
        return changes
    
    async def get_latest_snapshot(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get latest snapshot from Redis"""
        key = f"latest_depth:{symbol}"
        data = await self.redis.get(key)
        
        if data:
            return json.loads(data)
        return None
    
    async def get_history(
        self,
        symbol: str,
        limit: int = 100,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get snapshot history from database"""
        async with self.db_pool.acquire() as conn:
            query = """
                SELECT symbol, snapshot_time, bids, asks
                FROM market_depth
                WHERE symbol = $1
            """
            params = [symbol]
            param_count = 1
            
            if start_time:
                param_count += 1
                query += f" AND snapshot_time >= ${param_count}"
                params.append(start_time)
            
            if end_time:
                param_count += 1
                query += f" AND snapshot_time <= ${param_count}"
                params.append(end_time)
            
            query += f" ORDER BY snapshot_time DESC LIMIT ${param_count + 1}"
            params.append(limit)
            
            rows = await conn.fetch(query, *params)
            
            return [
                {
                    'symbol': row['symbol'],
                    'timestamp': row['snapshot_time'].isoformat(),
                    'bids': row['bids'],
                    'asks': row['asks']
                }
                for row in rows
            ]
