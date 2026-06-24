from typing import Dict, List, Optional
from datetime import datetime
import json

class DataParser:
    """Parse market depth data from page"""
    
    @staticmethod
    async def parse_market_depth(page, symbol: str) -> Optional[Dict]:
        """Extract market depth data from page"""
        try:
            # Wait for market depth element to load
            await page.wait_for_selector(f"text={symbol}", timeout=10000)
            
            # Extract data using JavaScript evaluation
            data = await page.evaluate(f"""() => {{
                // This is a placeholder - actual selectors depend on TMS page structure
                // You'll need to inspect the actual page and update these selectors
                
                // Example: Look for bid/ask tables
                const bids = [];
                const asks = [];
                
                // Try to find bid/ask elements (adjust selectors based on actual page)
                const bidRows = document.querySelectorAll('.bid-row, .buy-order, [data-type="bid"]');
                const askRows = document.querySelectorAll('.ask-row, .sell-order, [data-type="ask"]');
                
                bidRows.forEach(row => {{
                    const price = parseFloat(row.querySelector('.price, [data-price]')?.textContent || '0');
                    const qty = parseInt(row.querySelector('.qty, [data-qty]')?.textContent || '0');
                    if (price > 0 && qty > 0) {{
                        bids.push({{ price, qty }});
                    }}
                }});
                
                askRows.forEach(row => {{
                    const price = parseFloat(row.querySelector('.price, [data-price]')?.textContent || '0');
                    const qty = parseInt(row.querySelector('.qty, [data-qty]')?.textContent || '0');
                    if (price > 0 && qty > 0) {{
                        asks.push({{ price, qty }});
                    }}
                }});
                
                return {{ bids, asks }};
            }}""")
            
            if not data or (not data.get('bids') and not data.get('asks')):
                print(f"⚠️ No market depth data found for {symbol}")
                return None
            
            # Format the response
            result = {
                "symbol": symbol,
                "timestamp": datetime.now().isoformat(),
                "bids": data.get('bids', []),
                "asks": data.get('asks', [])
            }
            
            return result
        
        except Exception as e:
            print(f"❌ Error parsing market depth for {symbol}: {e}")
            return None
    
    @staticmethod
    async def parse_via_websocket(page, symbol: str) -> Optional[Dict]:
        """Try to intercept WebSocket data (if available)"""
        try:
            # Listen for WebSocket messages
            messages = []
            
            def handle_ws(message):
                try:
                    data = json.loads(message)
                    if symbol in str(data):
                        messages.append(data)
                except:
                    pass
            
            page.on("websocket", lambda ws: ws.on("framereceived", handle_ws))
            
            # Wait a bit for data
            await page.wait_for_timeout(2000)
            
            if messages:
                return messages[-1]  # Return latest message
            
            return None
        except Exception as e:
            print(f"WebSocket interception not available: {e}")
            return None
    
    @staticmethod
    def normalize_data(data: Dict) -> Dict:
        """Normalize data structure"""
        # Ensure bids and asks are lists
        bids = data.get("bids", [])
        asks = data.get("asks", [])
        
        # Sort bids by price (descending)
        bids = sorted(bids, key=lambda x: x.get("price", 0), reverse=True)
        
        # Sort asks by price (ascending)
        asks = sorted(asks, key=lambda x: x.get("price", 0))
        
        # Calculate totals
        total_bid_qty = sum(bid.get("qty", 0) for bid in bids)
        total_ask_qty = sum(ask.get("qty", 0) for ask in asks)
        
        return {
            "symbol": data.get("symbol", ""),
            "timestamp": data.get("timestamp", datetime.now().isoformat()),
            "bids": bids,
            "asks": asks,
            "total_bid_qty": total_bid_qty,
            "total_ask_qty": total_ask_qty
        }
"""
Data Parser - Extracts market depth data from trading platform
"""

import logging
import re
from typing import List, Dict, Any, Optional
from playwright.async_api import Page
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class MarketDepthParser:
    """Parses market depth data from trading platform"""
    
    def __init__(self):
        self.selectors = {
            # Common selectors for market depth tables
            'bid_table': 'table.bids, .bid-table, [data-testid="bid-table"]',
            'ask_table': 'table.asks, .ask-table, [data-testid="ask-table"]',
            'bid_row': 'tr.bid-row, .bid-row, tbody tr',
            'ask_row': 'tr.ask-row, .ask-row, tbody tr',
            'price_cell': 'td.price, .price-cell, [data-testid="price"]',
            'qty_cell': 'td.qty, .qty-cell, [data-testid="quantity"]',
            'symbol_header': '.symbol-header, [data-testid="symbol"], h1, h2',
        }
    
    async def parse_market_depth(self, page: Page, symbol: str) -> Optional[Dict[str, Any]]:
        """Parse market depth from current page"""
        try:
            # Wait for market depth data to load
            await page.wait_for_selector(
                f"{self.selectors['bid_table']}, {self.selectors['ask_table']}",
                timeout=10000
            )
            
            # Parse bids
            bids = await self._parse_order_book(page, self.selectors['bid_table'], 'bid')
            
            # Parse asks
            asks = await self._parse_order_book(page, self.selectors['ask_table'], 'ask')
            
            if not bids and not asks:
                logger.warning(f"No market depth data found for {symbol}")
                return None
            
            # Create snapshot
            snapshot = {
                'symbol': symbol,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'bids': bids,
                'asks': asks
            }
            
            logger.debug(f"Parsed market depth for {symbol}: {len(bids)} bids, {len(asks)} asks")
            return snapshot
            
        except Exception as e:
            logger.error(f"Failed to parse market depth for {symbol}: {e}")
            return None
    
    async def _parse_order_book(
        self,
        page: Page,
        table_selector: str,
        side: str
    ) -> List[Dict[str, float]]:
        """Parse order book (bids or asks)"""
        orders = []
        
        try:
            # Get all rows
            rows = await page.query_selector_all(f"{table_selector} {self.selectors['bid_row']}")
            
            for row in rows:
                try:
                    # Extract price and quantity
                    cells = await row.query_selector_all('td')
                    
                    if len(cells) >= 2:
                        price_text = await cells[0].inner_text()
                        qty_text = await cells[1].inner_text()
                        
                        # Clean and parse
                        price = self._parse_number(price_text)
                        qty = self._parse_number(qty_text)
                        
                        if price and qty:
                            orders.append({
                                'price': price,
                                'qty': int(qty)
                            })
                except Exception as e:
                    logger.debug(f"Failed to parse row: {e}")
                    continue
            
            # Sort bids descending, asks ascending
            if side == 'bid':
                orders.sort(key=lambda x: x['price'], reverse=True)
            else:
                orders.sort(key=lambda x: x['price'])
            
            return orders[:10]  # Top 10 levels
            
        except Exception as e:
            logger.error(f"Failed to parse {side} order book: {e}")
            return []
    
    def _parse_number(self, text: str) -> Optional[float]:
        """Parse number from text"""
        try:
            # Remove commas and spaces
            cleaned = text.replace(',', '').replace(' ', '').strip()
            
            # Try to parse
            if cleaned:
                return float(cleaned)
        except:
            pass
        
        return None
    
    async def parse_via_websocket(self, page: Page, symbol: str) -> Optional[Dict[str, Any]]:
        """Try to intercept WebSocket data if available"""
        # This is a placeholder for WebSocket interception
        # Implementation depends on the trading platform's WebSocket protocol
        logger.info("WebSocket interception not yet implemented")
        return None
    
    async def extract_symbol_from_page(self, page: Page) -> Optional[str]:
        """Extract current symbol from page"""
        try:
            selector = self.selectors['symbol_header']
            element = await page.query_selector(selector)
            
            if element:
                text = await element.inner_text()
                # Extract symbol (usually uppercase letters)
                match = re.search(r'([A-Z]{2,10})', text)
                if match:
                    return match.group(1)
        except Exception as e:
            logger.debug(f"Failed to extract symbol: {e}")
        
        return None
