from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from core.database import execute_query, execute_one
from core.redis import get_cached_order_flow
import json

router = APIRouter()

@router.get("/orderflow/{symbol}")
async def get_order_flow(symbol: str):
    """Get latest order flow analytics"""
    try:
        # Try cache first
        cached = await get_cached_order_flow(symbol)
        if cached:
            return cached
        
        # Fetch from database
        row = await execute_one(
            """
            SELECT symbol, buy_pressure, sell_pressure, imbalance, trend, signal,
                   large_orders, liquidity_walls, timestamp
            FROM order_flow WHERE symbol = $1 ORDER BY timestamp DESC LIMIT 1
            """, symbol
        )
        
        if not row:
            raise HTTPException(status_code=404, detail="No order flow data")
        
        data = {
            "symbol": row["symbol"],
            "buy_pressure": float(row["buy_pressure"]),
            "sell_pressure": float(row["sell_pressure"]),
            "imbalance": float(row["imbalance"]),
            "trend": row["trend"],
            "signal": row["signal"],
            "large_orders": row["large_orders"] if isinstance(row["large_orders"], dict) else json.loads(row["large_orders"]) if row["large_orders"] else {},
            "liquidity_walls": row["liquidity_walls"] if isinstance(row["liquidity_walls"], dict) else json.loads(row["liquidity_walls"]) if row["liquidity_walls"] else {},
            "timestamp": row["timestamp"].isoformat()
        }
        
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/orderflow/history/{symbol}")
async def get_orderflow_history(
    symbol: str,
    limit: int = Query(default=100, ge=1, le=1000)
):
    """Get historical order flow data"""
    try:
        rows = await execute_query(
            """
            SELECT symbol, buy_pressure, sell_pressure, imbalance, trend, signal, timestamp
            FROM order_flow WHERE symbol = $1
            ORDER BY timestamp DESC LIMIT $2
            """, symbol, limit
        )
        
        history = []
        for row in rows:
            history.append({
                "symbol": row["symbol"],
                "buy_pressure": float(row["buy_pressure"]),
                "sell_pressure": float(row["sell_pressure"]),
                "imbalance": float(row["imbalance"]),
                "trend": row["trend"],
                "signal": row["signal"],
                "timestamp": row["timestamp"].isoformat()
            })
        
        return {"symbol": symbol, "count": len(history), "data": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/orderflow/signals")
async def get_active_signals():
    """Get current trading signals for all symbols"""
    try:
        rows = await execute_query(
            """
            SELECT DISTINCT ON (symbol) symbol, buy_pressure, sell_pressure, trend, signal, timestamp
            FROM order_flow ORDER BY symbol, timestamp DESC
            """
        )
        
        signals = []
        for row in rows:
            signals.append({
                "symbol": row["symbol"],
                "buy_pressure": float(row["buy_pressure"]),
                "sell_pressure": float(row["sell_pressure"]),
                "trend": row["trend"],
                "signal": row["signal"],
                "timestamp": row["timestamp"].isoformat()
            })
        
        return {"signals": signals, "count": len(signals)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
