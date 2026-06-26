#!/usr/bin/env python3
"""
Daily Data Collector for Broker Analysis
- Collects broker data every day at 3 PM
- Stores historical data (1 year backfill once)
- Updates database with fresh data
"""

import os
import sys
import json
import logging
import requests
from datetime import datetime, timedelta
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('data_collector.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Database connection
try:
    from core.database import Database
    db = Database()
except ImportError:
    logger.warning("Database import failed, using fallback")
    db = None


class BrokerDataCollector:
    """Collects broker data from multiple sources"""

    def __init__(self):
        self.sources = {
            'merolagani': 'https://www.merolagani.com/api',
            'nepalstock': 'https://www.nepalstock.com.np/api',
            'nepsealpha': 'https://nepsealpha.com/api',
            'sharehubnepal': 'https://www.sharehubnepal.com/api'
        }
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Broker-Analysis-Collector/1.0'
        })

    def fetch_merolagani_broker_daily(self, date_str=None):
        """Fetch broker daily data from MeroLagani"""
        try:
            if not date_str:
                date_str = datetime.now().strftime('%Y-%m-%d')

            # Try multiple endpoints
            endpoints = [
                f"{self.sources['merolagani']}/broker/daily?date={date_str}",
                f"{self.sources['merolagani']}/broker?date={date_str}",
            ]

            for endpoint in endpoints:
                try:
                    response = self.session.get(endpoint, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        logger.info(f"✓ Fetched MeroLagani data for {date_str}")
                        return data
                except Exception as e:
                    logger.warning(f"Endpoint {endpoint} failed: {e}")
                    continue

            logger.error(f"All MeroLagani endpoints failed for {date_str}")
            return None

        except Exception as e:
            logger.error(f"Error fetching MeroLagani data: {e}")
            return None

    def fetch_nepalstock_broker_data(self, date_str=None):
        """Fetch broker data from NepalStock"""
        try:
            if not date_str:
                date_str = datetime.now().strftime('%Y-%m-%d')

            endpoint = f"{self.sources['nepalstock']}/nifty/broker?date={date_str}"
            response = self.session.get(endpoint, timeout=10)

            if response.status_code == 200:
                logger.info(f"✓ Fetched NepalStock data for {date_str}")
                return response.json()

            logger.warning(f"NepalStock returned {response.status_code}")
            return None

        except Exception as e:
            logger.error(f"Error fetching NepalStock data: {e}")
            return None

    def fetch_nepsealpha_data(self, date_str=None):
        """Fetch broker data from NEPSE Alpha"""
        try:
            if not date_str:
                date_str = datetime.now().strftime('%Y-%m-%d')

            endpoint = f"{self.sources['nepsealpha']}/broker?date={date_str}"
            response = self.session.get(endpoint, timeout=10)

            if response.status_code == 200:
                logger.info(f"✓ Fetched NEPSE Alpha data for {date_str}")
                return response.json()

            logger.warning(f"NEPSE Alpha returned {response.status_code}")
            return None

        except Exception as e:
            logger.error(f"Error fetching NEPSE Alpha data: {e}")
            return None

    def fetch_sharehubnepal_data(self, date_str=None):
        """Fetch broker data from ShareHubNepal"""
        try:
            if not date_str:
                date_str = datetime.now().strftime('%Y-%m-%d')

            endpoint = f"{self.sources['sharehubnepal']}/broker/daily?date={date_str}"
            response = self.session.get(endpoint, timeout=10)

            if response.status_code == 200:
                logger.info(f"✓ Fetched ShareHubNepal data for {date_str}")
                return response.json()

            logger.warning(f"ShareHubNepal returned {response.status_code}")
            return None

        except Exception as e:
            logger.error(f"Error fetching ShareHubNepal data: {e}")
            return None

    def store_broker_data(self, data, source, date_str):
        """Store broker data to database"""
        if not data or not db:
            return False

        try:
            brokers = data.get('brokers') or data.get('broker') or []
            if not brokers:
                logger.warning(f"No broker data in {source} response")
                return False

            # Prepare insert statement
            stored_count = 0
            for broker in brokers:
                try:
                    broker_id = broker.get('id') or broker.get('brokerId') or broker.get('broker')
                    broker_name = broker.get('name') or broker.get('brokerName')
                    buy_amt = float(broker.get('purchase') or broker.get('buyAmount') or 0)
                    sell_amt = float(broker.get('sell') or broker.get('sellAmount') or 0)

                    if not broker_id:
                        continue

                    # Insert into database
                    db.execute({
                        'sql': '''
                            INSERT INTO merolagani_broker_daily
                            (date, brokerId, brokerName, purchase, sell, source)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(date, brokerId, source) DO UPDATE SET
                            purchase=?, sell=?, brokerName=?
                        ''',
                        'args': [date_str, broker_id, broker_name, buy_amt, sell_amt, source,
                                buy_amt, sell_amt, broker_name]
                    })
                    stored_count += 1
                except Exception as e:
                    logger.warning(f"Error storing broker {broker.get('id')}: {e}")
                    continue

            logger.info(f"✓ Stored {stored_count} brokers from {source} for {date_str}")
            return stored_count > 0

        except Exception as e:
            logger.error(f"Error storing broker data: {e}")
            return False

    def collect_daily_data(self, date_str=None):
        """Collect data from all sources for a specific date"""
        if not date_str:
            date_str = datetime.now().strftime('%Y-%m-%d')

        logger.info(f"=== Starting daily data collection for {date_str} ===")

        collected = 0

        # Fetch from all sources
        sources_data = {
            'merolagani': self.fetch_merolagani_broker_daily(date_str),
            'nepalstock': self.fetch_nepalstock_broker_data(date_str),
            'nepsealpha': self.fetch_nepsealpha_data(date_str),
            'sharehubnepal': self.fetch_sharehubnepal_data(date_str),
        }

        # Store all data
        for source, data in sources_data.items():
            if data:
                if self.store_broker_data(data, source, date_str):
                    collected += 1

        if collected > 0:
            logger.info(f"✓ Successfully collected from {collected} sources for {date_str}")
        else:
            logger.warning(f"✗ Failed to collect data for {date_str}")

        return collected > 0

    def backfill_historical_data(self, days=365):
        """Backfill historical data for the past N days"""
        logger.info(f"=== Starting {days}-day historical backfill ===")

        success_count = 0
        today = datetime.now()

        for i in range(days, 0, -1):
            date = today - timedelta(days=i)
            date_str = date.strftime('%Y-%m-%d')

            # Skip weekends
            if date.weekday() >= 5:
                logger.debug(f"Skipping weekend: {date_str}")
                continue

            try:
                if self.collect_daily_data(date_str):
                    success_count += 1
                    logger.info(f"Progress: {success_count} days completed")
            except Exception as e:
                logger.error(f"Error collecting data for {date_str}: {e}")
                continue

        logger.info(f"✓ Backfill complete: {success_count} days stored")
        return success_count


class DataCollectorScheduler:
    """Schedules daily data collection at 3 PM"""

    def __init__(self):
        self.collector = BrokerDataCollector()
        self.last_run = None

    def should_run(self):
        """Check if it's time to run (after 3 PM Nepal time)"""
        import pytz
        kathmandu_tz = pytz.timezone('Asia/Kathmandu')
        now = datetime.now(kathmandu_tz)

        # Run after 3 PM (15:00)
        if now.hour >= 15:
            # Check if we haven't run today
            today = now.date()
            if self.last_run != today:
                return True

        return False

    def run_daily_collection(self):
        """Run the daily collection"""
        if not self.should_run():
            return False

        success = self.collector.collect_daily_data()
        if success:
            self.last_run = datetime.now().date()
            logger.info("✓ Daily data collection completed successfully")
        else:
            logger.warning("✗ Daily data collection encountered issues")

        return success

    def start_background_scheduler(self):
        """Start background scheduler (requires schedule library)"""
        try:
            import schedule

            logger.info("Starting background scheduler...")

            # Schedule daily collection at 3 PM
            schedule.every().day.at("15:00").do(self.run_daily_collection)

            # Keep scheduler running
            while True:
                schedule.run_pending()
                import time
                time.sleep(60)  # Check every minute

        except ImportError:
            logger.error("schedule library not installed. Install with: pip install schedule")
            return False


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Broker Data Collector')
    parser.add_argument('--backfill', type=int, default=None,
                       help='Backfill N days of historical data')
    parser.add_argument('--date', type=str, default=None,
                       help='Collect data for specific date (YYYY-MM-DD)')
    parser.add_argument('--schedule', action='store_true',
                       help='Start background scheduler')

    args = parser.parse_args()

    collector = BrokerDataCollector()

    if args.backfill:
        logger.info(f"Backfilling {args.backfill} days of data...")
        collector.backfill_historical_data(args.backfill)

    elif args.date:
        logger.info(f"Collecting data for {args.date}...")
        collector.collect_daily_data(args.date)

    elif args.schedule:
        scheduler = DataCollectorScheduler()
        scheduler.start_background_scheduler()

    else:
        # Default: collect today's data
        logger.info("Collecting today's data...")
        collector.collect_daily_data()


if __name__ == '__main__':
    main()
