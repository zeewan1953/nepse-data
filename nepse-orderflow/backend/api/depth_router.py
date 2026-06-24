from fastapi import APIRouter, HTTPException
from core.database import execute_one
import json

router = APIRouter()

@router.get("/depth/{symbol}")
async def get_market_depth(symbol: str):
    try:
        row = await execute_one(
            """
            SELECT symbol, snapshot_time, bids, asks, total_bid_qty, total_ask_qty
            FROM market_depth WHERE symbol = $1 ORDER BY snapshot_time DESC LIMIT 1
            """, symbol
        )
        if not row:
            raise HTTPException(status_code=404, detail="No data")
        
        return {
            "symbol": row["symbol"],
            "timestamp": row["snapshot_time"].isoformat(),
            "bids": row["bids"] if isinstance(row["bids"], list) else json.loads(row["bids"]),
            "asks": row["asks"] if isinstance(row["asks"], list) else json.loads(row["asks"]),
            "total_bid_qty": row["total_bid_qty"],
            "total_ask_qty": row["total_ask_qty"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
