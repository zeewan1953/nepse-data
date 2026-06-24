import asyncio
import pytz
from datetime import datetime
from core.config import config
from core.session import SessionManager
from core.parser import DataParser
from core.snapshot import SnapshotEngine

class MarketDepthCollector:
    """Main collector orchestrator"""
    
    def __init__(self):
        self.session = SessionManager()
        self.parser = DataParser()
        self.snapshot = SnapshotEngine()
        self.running = True
    
    async def start(self):
        """Start the collector"""
        print("\n" + "="*60)
        print("🚀 NEPSE Market Depth Collector")
        print("="*60)
        
        # Initialize snapshot engine
        await self.snapshot.init()
        
        # Start browser session
        page = await self.session.start()
        
        # Check if session is valid
        if not await self.session.validate_session():
            print("\n🔐 Session invalid or expired")
            success = await self.session.login_manual()
            if not success:
                print("❌ Login failed. Exiting...")
                return
        
        print("\n✅ Collector started successfully!")
        print(f"📊 Tracking {len(config.DEFAULT_SYMBOLS)} symbols")
        print(f"⏱️ Collection interval: {config.COLLECTION_INTERVAL} seconds")
        print(f"🕐 Market hours: {config.MARKET_HOURS_START} - {config.MARKET_HOURS_END} NPT")
        print("\nPress Ctrl+C to stop\n")
        
        # Start collection loop
        await self.collect_loop()
    
    async def collect_loop(self):
        """Main collection loop"""
        while self.running:
            try:
                # Check if within market hours
                if not self._is_market_hours():
                    print(f"⏸️ Outside market hours. Waiting...")
                    await asyncio.sleep(60)  # Check every minute
                    continue
                
                print(f"\n📊 Collecting data at {datetime.now(pytz.timezone(config.TIMEZONE)).strftime('%H:%M:%S')} NPT")
                
                # Collect data for each symbol
                for symbol in config.DEFAULT_SYMBOLS:
                    try:
                        await self._collect_symbol(symbol)
                    except Exception as e:
                        print(f"❌ Error collecting {symbol}: {e}")
                
                # Wait for next interval
                print(f"✅ Collection complete. Waiting {config.COLLECTION_INTERVAL} seconds...")
                await asyncio.sleep(config.COLLECTION_INTERVAL)
            
            except KeyboardInterrupt:
                print("\n\n🛑 Received stop signal...")
                self.running = False
            except Exception as e:
                print(f"❌ Collection loop error: {e}")
                await asyncio.sleep(10)
        
        # Cleanup
        await self.stop()
    
    async def _collect_symbol(self, symbol: str):
        """Collect data for a single symbol"""
        try:
            # Navigate to symbol's market depth page
            page = self.session.page
            
            # Note: You'll need to adjust this URL based on actual TMS structure
            await page.goto(f"https://tms.nepalstock.com/market/depth/{symbol}")
            await page.wait_for_load_state("networkidle")
            
            # Try WebSocket interception first
            data = await self.parser.parse_via_websocket(page, symbol)
            
            # Fallback to DOM parsing
            if not data:
                data = await self.parser.parse_market_depth(page, symbol)
            
            if data:
                # Normalize data
                normalized = self.parser.normalize_data(data)
                
                # Save snapshot
                saved = await self.snapshot.save_snapshot(normalized)
                if saved:
                    print(f"  ✓ {symbol}: {len(normalized['bids'])} bids, {len(normalized['asks'])} asks")
            else:
                print(f"  ⚠️ {symbol}: No data")
        
        except Exception as e:
            print(f"  ❌ {symbol}: {e}")
    
    def _is_market_hours(self) -> bool:
        """Check if current time is within market hours"""
        try:
            now = datetime.now(pytz.timezone(config.TIMEZONE))
            current_time = now.strftime("%H:%M")
            
            # Simple time comparison
            return config.MARKET_HOURS_START <= current_time <= config.MARKET_HOURS_END
        except Exception as e:
            print(f"Error checking market hours: {e}")
            return False
    
    async def stop(self):
        """Stop the collector"""
        print("\n🛑 Stopping collector...")
        self.running = False
        await self.session.stop()
        await self.snapshot.close()
        print("✅ Collector stopped")

async def main():
    """Main entry point"""
    collector = MarketDepthCollector()
    await collector.start()

if __name__ == "__main__":
    print("\nStarting NEPSE Market Depth Collector...")
    print("Press Ctrl+C to stop\n")
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n✅ Collector stopped by user")
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
"""
Main Collector - Orchestrates market depth data collection
"""

import asyncio
import logging
from datetime import datetime, timezone
import pytz
from core.config import settings
from core.session import SessionManager
from core.parser import MarketDepthParser
from core.snapshot import SnapshotEngine

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MarketDepthCollector:
    """Main collector that orchestrates data collection"""
    
    def __init__(self):
        self.session = SessionManager()
        self.parser = MarketDepthParser()
        self.snapshot_engine = SnapshotEngine()
        self.is_running = False
        self.symbols = [
            'NABIL', 'NICA', 'EBL', 'SBI', 'GBIME',
            'KBL', 'NMB', 'PRVU', 'SANIMA', 'SCB',
            'RIDI', 'CHCL', 'BPCL', 'AKPL', 'SHPC', 'UPPER',
            'NTC', 'NRIC', 'NLIC', 'SICL'
        ]
    
    async def start(self):
        """Start the collector"""
        logger.info("Starting Market Depth Collector...")
        
        # Initialize components
        await self.snapshot_engine.initialize()
        await self.session.start()
        
        # Check if login is required
        if await self.session.login_required():
            logger.info("Login required. Please complete manual login.")
            await self.session.navigate_to_login()
            success = await self.session.wait_for_manual_login()
            
            if not success:
                logger.error("Login failed. Exiting.")
                return
        
        self.is_running = True
        
        # Start collection loop
        logger.info("Starting data collection loop...")
        await self.collection_loop()
    
    async def stop(self):
        """Stop the collector"""
        logger.info("Stopping collector...")
        self.is_running = False
        
        await self.session.stop()
        await self.snapshot_engine.shutdown()
        
        logger.info("Collector stopped")
    
    async def collection_loop(self):
        """Main collection loop"""
        while self.is_running:
            try:
                # Check if within market hours
                if not self.is_market_hours():
                    logger.info("Outside market hours. Waiting...")
                    await asyncio.sleep(60)
                    continue
                
                # Check session validity
                if not await self.session.is_session_valid():
                    logger.warning("Session expired. Attempting reconnect...")
                    if not await self.session.reconnect():
                        logger.error("Reconnect failed. Waiting...")
                        await asyncio.sleep(settings.RECONNECT_DELAY)
                        continue
                
                # Collect data for each symbol
                for symbol in self.symbols:
                    if not self.is_running:
                        break
                    
                    await self.collect_symbol_data(symbol)
                
                # Wait for next snapshot interval
                logger.info(f"Waiting {settings.SNAPSHOT_INTERVAL} seconds for next snapshot...")
                await asyncio.sleep(settings.SNAPSHOT_INTERVAL)
                
            except Exception as e:
                logger.error(f"Error in collection loop: {e}")
                await asyncio.sleep(settings.RECONNECT_DELAY)
    
    async def collect_symbol_data(self, symbol: str):
        """Collect market depth data for a symbol"""
        try:
            # Navigate to market depth page
            await self.session.navigate_to_market_depth(symbol)
            
            # Parse data
            snapshot = await self.parser.parse_market_depth(
                self.session.get_page(),
                symbol
            )
            
            if snapshot:
                # Process snapshot
                await self.snapshot_engine.process_snapshot(snapshot)
            else:
                logger.warning(f"No data parsed for {symbol}")
        
        except Exception as e:
            logger.error(f"Failed to collect data for {symbol}: {e}")
    
    def is_market_hours(self) -> bool:
        """Check if current time is within market hours"""
        nepal_tz = pytz.timezone(settings.TIMEZONE)
        now = datetime.now(nepal_tz)
        
        # Parse market hours
        start_hour, start_min = map(int, settings.MARKET_HOURS_START.split(':'))
        end_hour, end_min = map(int, settings.MARKET_HOURS_END.split(':'))
        
        start = now.replace(hour=start_hour, minute=start_min, second=0)
        end = now.replace(hour=end_hour, minute=end_min, second=0)
        
        return start <= now <= end


async def main():
    """Main entry point"""
    collector = MarketDepthCollector()
    
    try:
        await collector.start()
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        await collector.stop()


if __name__ == "__main__":
    asyncio.run(main())
