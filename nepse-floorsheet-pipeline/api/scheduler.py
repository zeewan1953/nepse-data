"""
Background Scheduler
=======================

Runs the scrape→validate→store pipeline automatically every
SCRAPE_INTERVAL_MINUTES, but only inside Nepal market hours
(MARKET_OPEN_HOUR–MARKET_CLOSE_HOUR), so you're not hammering the source
site at 2am for no reason. This is what makes "site ma change vako data
automatic app ma show garos" actually happen without anyone touching the
app — it just runs continuously in the background.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("scheduler")

_scheduler: BackgroundScheduler | None = None


def _market_hours_job():
    open_hour = int(os.getenv("MARKET_OPEN_HOUR", 11))
    close_hour = int(os.getenv("MARKET_CLOSE_HOUR", 15))
    now = datetime.now()
    if not (open_hour <= now.hour < close_hour):
        log.debug("Outside market hours — skipping scheduled scrape.")
        return

    # Import here (not top-level) to avoid a circular import with api.main
    from api.main import _scrape_validate_store

    today = date.today()
    log.info(f"Scheduled scrape starting for {today}")
    try:
        asyncio.run(_scrape_validate_store(today))
        log.info(f"Scheduled scrape complete for {today}")
    except Exception as e:
        log.error(f"Scheduled scrape failed for {today}: {e}")


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    interval = int(os.getenv("SCRAPE_INTERVAL_MINUTES", 15))
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _market_hours_job,
        trigger=CronTrigger(minute=f"*/{interval}"),
        id="nepse_floorsheet_scrape",
        replace_existing=True,
    )
    _scheduler.start()
    log.info(f"Scheduler started — checking every {interval} min during market hours.")
    return _scheduler
