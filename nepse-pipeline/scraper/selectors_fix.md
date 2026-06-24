"""
NEPSE Floorsheet Scraper — FIXED SELECTORS
============================================

Based on real inspection of https://www.nepalstock.com.np/floor-sheet (Jun 22, 2026):

TABLE STRUCTURE:
- Table selector: `table.table` (class: table table__lg table-striped)
- Rows: `table.table tbody tr`
- Columns: SN | Contract No | Stock Symbol | Buyer | Seller | Quantity | Rate (Rs) | Amount (Rs)

FILTERS:
- Contract Number: input[placeholder="Contract Number"]
- Stock Symbol: input[placeholder="Stock Symbol or Company Name"]
- Buyer: input[placeholder="Buyer"]
- Seller: input[placeholder="Seller"]
- Items Per Page: select with options 10/20/50/200/300/500

PAGINATION:
- ul.ngx-pagination
- Next button: li.pagination-next
- Page links: li a (with "page X" aria-label)

IMPORTANT: NEPSE has NO date picker on floorsheet page — it only shows TODAY's data.
For historical data, you need the API endpoint which requires auth token.

API (requires auth):
- POST /api/nots/nepse-data/floorsheet?page={n}&size={n}&sort=contractId,desc
- Auth token from: GET /api/authenticate/prove

USAGE:
    python -m scraper.nepse_scraper --once --debug
"""

# Key selectors for NepseOfficialAdapter (nepalstock.com.np):
NEPSE_TABLE_SELECTOR = "table.table tbody tr"
NEPSE_NEXT_BTN = "ul.ngx-pagination li.pagination-next"
NEPSE_PAGE_SIZE_SELECT = "select"  # Items per page dropdown

# Column indices (0-based):
# [0]=SN, [1]=Contract No, [2]=Stock Symbol, [3]=Buyer, [4]=Seller, [5]=Quantity, [6]=Rate, [7]=Amount
NEPSE_COLUMN_MAP = {
    "contract_no": 1,
    "symbol": 2,
    "buyer_broker": 3,
    "seller_broker": 4,
    "quantity": 5,
    "rate": 6,
    "amount": 7,
}
