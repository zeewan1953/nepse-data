"""
Change Detector
================

NEPSE/NepseAlpha sometimes revise a day's floorsheet after initial
publication (corrections, late settlements). We don't want to re-validate
and re-write the whole DB every 15 minutes if nothing changed — but we DO
want to catch it immediately when something *does* change.

Strategy: hash each day's full row-set. Store the hash in `scrape_log`
(see db/models.py). Compare on every scheduled run:
  - hash unchanged → skip DB write entirely, just update `checked_at`
  - hash changed   → re-validate, upsert, bump `data_version`, and this is
    the signal the FastAPI layer uses to tell the frontend "this day's
    data was revised, refetch it" (via the `/floorsheet/{date}` `data_version`
    field — see api/main.py).
"""

from __future__ import annotations

import hashlib
import json


def hash_day_rows(rows: list[dict]) -> str:
    """
    Order-independent, field-stable hash of a day's floorsheet.
    Sorted so that pagination order differences between scrapes don't
    register as false "changes".
    """
    normalized = sorted(
        (
            json.dumps(
                {k: v for k, v in row.items() if not k.startswith("_")},
                sort_keys=True,
            )
        )
        for row in rows
    )
    blob = "|".join(normalized).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def has_changed(new_rows: list[dict], previous_hash: str | None) -> tuple[bool, str]:
    new_hash = hash_day_rows(new_rows)
    return (new_hash != previous_hash, new_hash)
