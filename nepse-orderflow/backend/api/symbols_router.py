from fastapi import APIRouter, HTTPException
from core.database import execute_query

router = APIRouter()

@router.get("/symbols")
async def get_symbols():
    try:
        rows = await execute_query(
            "SELECT symbol, company_name FROM symbols WHERE is_active = TRUE ORDER BY symbol"
        )
        return {"symbols": [{"symbol": r["symbol"], "company_name": r["company_name"]} for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
