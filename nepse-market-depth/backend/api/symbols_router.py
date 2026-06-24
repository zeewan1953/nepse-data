from fastapi import APIRouter, HTTPException
from core.database import execute_query
from core.redis import get_cached_symbols, cache_symbols

router = APIRouter()

@router.get("/symbols")
async def get_symbols():
    """Get all active symbols"""
    try:
        # Try cache first
        cached = await get_cached_symbols()
        if cached:
            return {"symbols": cached, "source": "cache"}
        
        # Fetch from database
        rows = await execute_query(
            "SELECT symbol, company_name FROM symbols WHERE is_active = TRUE ORDER BY symbol"
        )
        
        symbols = [{"symbol": row["symbol"], "company_name": row["company_name"]} for row in rows]
        
        # Cache the result
        await cache_symbols(symbols)
        
        return {"symbols": symbols, "source": "database"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching symbols: {str(e)}")
"""
Symbols API Router
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List
from pydantic import BaseModel
import asyncpg
import logging
from core.database import get_db_pool
from core.redis import cache_symbols, get_cached_symbols

logger = logging.getLogger(__name__)

router = APIRouter()


class SymbolResponse(BaseModel):
    symbol: str
    company_name: str
    sector: str
    is_active: bool


@router.get("/symbols", response_model=List[SymbolResponse])
async def get_symbols():
    """Get all active symbols"""
    
    # Try cache first
    cached = await get_cached_symbols()
    if cached:
        return [SymbolResponse(**s) for s in cached]
    
    # Fetch from database
    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT symbol, company_name, sector, is_active
                FROM symbols
                WHERE is_active = TRUE
                ORDER BY symbol
                """
            )
            
            symbols = [
                {
                    "symbol": row["symbol"],
                    "company_name": row["company_name"],
                    "sector": row["sector"],
                    "is_active": row["is_active"]
                }
                for row in rows
            ]
            
            # Cache the result
            await cache_symbols(symbols)
            
            return [SymbolResponse(**s) for s in symbols]
    
    except Exception as e:
        logger.error(f"Failed to fetch symbols: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch symbols")


@router.get("/symbols/{symbol}", response_model=SymbolResponse)
async def get_symbol(symbol: str):
    """Get specific symbol"""
    
    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT symbol, company_name, sector, is_active
                FROM symbols
                WHERE symbol = $1
                """,
                symbol
            )
            
            if not row:
                raise HTTPException(status_code=404, detail="Symbol not found")
            
            return SymbolResponse(
                symbol=row["symbol"],
                company_name=row["company_name"],
                sector=row["sector"],
                is_active=row["is_active"]
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch symbol: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch symbol")
