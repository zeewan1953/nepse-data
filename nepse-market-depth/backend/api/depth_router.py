from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from datetime import datetime
from core.database import execute_query, execute_one
from core.redis import get_cached_market_depth, cache_market_depth
import json

router = APIRouter()

@router.get("/depth/{symbol}")
async def get_market_depth(symbol: str):
    """Get latest market depth for a symbol"""
    try:
        # Try cache first
        cached = await get_cached_market_depth(symbol)
        if cached:
            return cached
        
        # Fetch from database
        row = await execute_one(
            """
            SELECT symbol, snapshot_time, bids, asks, total_bid_qty, total_ask_qty
            FROM market_depth
            WHERE symbol = $1
            ORDER BY snapshot_time DESC
            LIMIT 1
            """,
            symbol
        )
        
        if not row:
            raise HTTPException(status_code=404, detail=f"No market depth data for {symbol}")
        
        # Convert to dict and parse JSONB
        data = {
            "symbol": row["symbol"],
            "timestamp": row["snapshot_time"].isoformat(),
            "bids": row["bids"] if isinstance(row["bids"], list) else json.loads(row["bids"]),
            "asks": row["asks"] if isinstance(row["asks"], list) else json.loads(row["asks"]),
            "total_bid_qty": row["total_bid_qty"],
            "total_ask_qty": row["total_ask_qty"]
        }
        
        # Cache the result
        await cache_market_depth(symbol, data)
        
        return data
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching market depth: {str(e)}")

@router.get("/depth/latest/{symbol}")
async def get_latest_depth(symbol: str):
    """Get latest market depth (alias for /depth/{symbol})"""
    return await get_market_depth(symbol)

@router.get("/depth/history/{symbol}")
async def get_depth_history(
    symbol: str,
    limit: int = Query(default=100, ge=1, le=1000),
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
):
    """Get historical market depth data"""
    try:
        query = """
            SELECT symbol, snapshot_time, bids, asks, total_bid_qty, total_ask_qty
            FROM market_depth
            WHERE symbol = $1
        """
        params = [symbol]
        param_idx = 2
        
        if start_time:
            query += f" AND snapshot_time >= ${param_idx}"
            params.append(start_time)
            param_idx += 1
        
        if end_time:
            query += f" AND snapshot_time <= ${param_idx}"
            params.append(end_time)
            param_idx += 1
        
        query += f" ORDER BY snapshot_time DESC LIMIT ${param_idx}"
        params.append(limit)
        
        rows = await execute_query(query, *params)
        
        history = []
        for row in rows:
            history.append({
                "symbol": row["symbol"],
                "timestamp": row["snapshot_time"].isoformat(),
                "bids": row["bids"] if isinstance(row["bids"], list) else json.loads(row["bids"]),
                "asks": row["asks"] if isinstance(row["asks"], list) else json.loads(row["asks"]),
                "total_bid_qty": row["total_bid_qty"],
                "total_ask_qty": row["total_ask_qty"]
            })
        
        return {
            "symbol": symbol,
            "count": len(history),
            "data": history
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching history: {str(e)}")

@router.get("/depth/compare/{symbol}")
async def compare_depth(
    symbol: str,
    time1: str,
    time2: str
):
    """Compare market depth at two different times"""
    try:
        rows = await execute_query(
            """
            SELECT snapshot_time, bids, asks, total_bid_qty, total_ask_qty
            FROM market_depth
            WHERE symbol = $1 AND snapshot_time IN ($2, $3)
            ORDER BY snapshot_time
            """,
            symbol, time1, time2
        )
        
        if len(rows) < 2:
            raise HTTPException(status_code=404, detail="Could not find data for both timestamps")
        
        data1 = rows[0]
        data2 = rows[1]
        
        return {
            "symbol": symbol,
            "time1": {
                "timestamp": data1["snapshot_time"].isoformat(),
                "bids": data1["bids"] if isinstance(data1["bids"], list) else json.loads(data1["bids"]),
                "asks": data1["asks"] if isinstance(data1["asks"], list) else json.loads(data1["asks"]),
                "total_bid_qty": data1["total_bid_qty"],
                "total_ask_qty": data1["total_ask_qty"]
            },
            "time2": {
                "timestamp": data2["snapshot_time"].isoformat(),
                "bids": data2["bids"] if isinstance(data2["bids"], list) else json.loads(data2["bids"]),
                "asks": data2["asks"] if isinstance(data2["asks"], list) else json.loads(data2["asks"]),
                "total_bid_qty": data2["total_bid_qty"],
                "total_ask_qty": data2["total_ask_qty"]
            },
            "changes": {
                "bid_qty_change": data2["total_bid_qty"] - data1["total_bid_qty"],
                "ask_qty_change": data2["total_ask_qty"] - data1["total_ask_qty"]
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error comparing data: {str(e)}")
"""
Market Depth API Router
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
import asyncpg
import logging
from core.database import get_db_pool
from core.redis import get_cached_market_depth, get_latest_depth

logger = logging.getLogger(__name__)

router = APIRouter()


class DepthLevel(BaseModel):
    price: float
    qty: int


class MarketDepthResponse(BaseModel):
    symbol: str
    timestamp: str
    bids: List[DepthLevel]
    asks: List[DepthLevel]
    total_bid_qty: int
    total_ask_qty: int
    bid_ask_spread: float


class MarketDepthHistoryResponse(BaseModel):
    symbol: str
    snapshot_time: str
    bids: List[DepthLevel]
    asks: List[DepthLevel]
    total_bid_qty: int
    total_ask_qty: int
    bid_ask_spread: float


@router.get("/depth/{symbol}", response_model=MarketDepthResponse)
async def get_market_depth(symbol: str):
    """Get latest market depth for a symbol"""
    
    # Try cache first
    cached = await get_latest_depth(symbol)
    if cached:
        return MarketDepthResponse(**cached)
    
    # Fetch from database
    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT symbol, snapshot_time, bids, asks, total_bid_qty, total_ask_qty, bid_ask_spread
                FROM market_depth
                WHERE symbol = $1
                ORDER BY snapshot_time DESC
                LIMIT 1
                """,
                symbol
            )
            
            if not row:
                raise HTTPException(status_code=404, detail="No market depth data found for symbol")
            
            response = MarketDepthResponse(
                symbol=row["symbol"],
                timestamp=row["snapshot_time"].isoformat(),
                bids=row["bids"],
                asks=row["asks"],
                total_bid_qty=row["total_bid_qty"],
                total_ask_qty=row["total_ask_qty"],
                bid_ask_spread=float(row["bid_ask_spread"])
            )
            
            return response
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch market depth: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch market depth")


@router.get("/depth/latest/{symbol}", response_model=MarketDepthResponse)
async def get_latest_market_depth(symbol: str):
    """Get latest market depth (alias)"""
    return await get_market_depth(symbol)


@router.get("/depth/history/{symbol}", response_model=List[MarketDepthHistoryResponse])
async def get_depth_history(
    symbol: str,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
):
    """Get historical market depth for a symbol"""
    
    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            query = """
                SELECT symbol, snapshot_time, bids, asks, total_bid_qty, total_ask_qty, bid_ask_spread
                FROM market_depth
                WHERE symbol = $1
            """
            params = [symbol]
            param_count = 1
            
            if start_time:
                param_count += 1
                query += f" AND snapshot_time >= ${param_count}"
                params.append(datetime.fromisoformat(start_time))
            
            if end_time:
                param_count += 1
                query += f" AND snapshot_time <= ${param_count}"
                params.append(datetime.fromisoformat(end_time))
            
            query += f" ORDER BY snapshot_time DESC LIMIT ${param_count + 1} OFFSET ${param_count + 2}"
            params.extend([limit, offset])
            
            rows = await conn.fetch(query, *params)
            
            return [
                MarketDepthHistoryResponse(
                    symbol=row["symbol"],
                    snapshot_time=row["snapshot_time"].isoformat(),
                    bids=row["bids"],
                    asks=row["asks"],
                    total_bid_qty=row["total_bid_qty"],
                    total_ask_qty=row["total_ask_qty"],
                    bid_ask_spread=float(row["bid_ask_spread"])
                )
                for row in rows
            ]
    
    except Exception as e:
        logger.error(f"Failed to fetch depth history: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch depth history")


@router.get("/depth/compare/{symbol}")
async def compare_depth(
    symbol: str,
    time1: str,
    time2: str
):
    """Compare market depth at two different times"""
    
    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT snapshot_time, bids, asks, total_bid_qty, total_ask_qty, bid_ask_spread
                FROM market_depth
                WHERE symbol = $1 AND snapshot_time IN ($2, $3)
                ORDER BY snapshot_time
                """,
                symbol,
                datetime.fromisoformat(time1),
                datetime.fromisoformat(time2)
            )
            
            if len(rows) < 2:
                raise HTTPException(status_code=404, detail="Could not find data for both timestamps")
            
            return {
                "symbol": symbol,
                "time1": {
                    "timestamp": rows[0]["snapshot_time"].isoformat(),
                    "bids": rows[0]["bids"],
                    "asks": rows[0]["asks"],
                    "total_bid_qty": rows[0]["total_bid_qty"],
                    "total_ask_qty": rows[0]["total_ask_qty"],
                    "bid_ask_spread": float(rows[0]["bid_ask_spread"])
                },
                "time2": {
                    "timestamp": rows[1]["snapshot_time"].isoformat(),
                    "bids": rows[1]["bids"],
                    "asks": rows[1]["asks"],
                    "total_bid_qty": rows[1]["total_bid_qty"],
                    "total_ask_qty": rows[1]["total_ask_qty"],
                    "bid_ask_spread": float(rows[1]["bid_ask_spread"])
                },
                "changes": {
                    "bid_qty_change": rows[1]["total_bid_qty"] - rows[0]["total_bid_qty"],
                    "ask_qty_change": rows[1]["total_ask_qty"] - rows[0]["total_ask_qty"],
                    "spread_change": float(rows[1]["bid_ask_spread"] - rows[0]["bid_ask_spread"])
                }
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compare depth: {e}")
        raise HTTPException(status_code=500, detail="Failed to compare depth")
