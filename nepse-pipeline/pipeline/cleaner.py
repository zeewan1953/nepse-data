"""
Rule-based Data Cleaner & Validator
====================================

Fast, deterministic, free. Runs on every scraped row before it ever
touches the database. Anything this can't confidently approve gets
tagged `flagged` and handed to the optional AI validator (ai_validator.py)
for a second opinion — it does NOT get silently dropped or silently kept.

Returns three buckets:
  - clean:    rows that passed every check, safe to upsert directly
  - flagged:  rows with a specific suspicion, candidates for AI review
  - rejected: rows that are structurally broken (not worth AI review at all)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

log = logging.getLogger("cleaner")

# Known NEPSE broker codes are 2-digit numeric strings ("01" .. "50"+).
# Replace this with the real, current list — NEPSE publishes a broker
# directory; hardcoding a stale list is itself a source of false positives,
# so treat this as a "looks plausible" check, not a hard whitelist.
VALID_BROKER_CODE_PATTERN = r"^\d{1,3}$"

MIN_PLAUSIBLE_RATE = 1.0       # NPR — a share trading below Re 1 is almost
                                 # certainly a parsing error, not a real trade
MAX_PLAUSIBLE_RATE = 200_000.0  # generous ceiling; tune per-symbol later
MAX_PLAUSIBLE_QTY = 5_000_000


@dataclass
class ValidationResult:
    clean: list[dict] = field(default_factory=list)
    flagged: list[dict] = field(default_factory=list)   # each has "_flag_reason"
    rejected: list[dict] = field(default_factory=list)  # each has "_reject_reason"

    def summary(self) -> str:
        return (f"clean={len(self.clean)} flagged={len(self.flagged)} "
                f"rejected={len(self.rejected)}")


def _is_valid_date(s: str) -> bool:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def validate_batch(rows: list[dict], day_avg_rate_by_symbol: dict[str, float] | None = None) -> ValidationResult:
    """
    rows: list of dicts shaped like FloorsheetRow.to_dict()
    day_avg_rate_by_symbol: optional running average per symbol for THIS
        batch/day, used to flag outlier prices relative to that day's trading,
        not just a fixed global ceiling. Compute it once before calling this
        (or pass None to skip relative-outlier checks on first run).
    """
    result = ValidationResult()
    seen_contract_nos: set[str] = set()

    for row in rows:
        reject_reason = _structural_check(row)
        if reject_reason:
            row["_reject_reason"] = reject_reason
            result.rejected.append(row)
            continue

        # duplicate detection (same contract number seen twice in this batch)
        cno = row.get("contract_no")
        if cno:
            if cno in seen_contract_nos:
                row["_reject_reason"] = "duplicate_contract_no"
                result.rejected.append(row)
                continue
            seen_contract_nos.add(cno)

        flag_reason = _plausibility_check(row, day_avg_rate_by_symbol)
        if flag_reason:
            row["_flag_reason"] = flag_reason
            result.flagged.append(row)
            continue

        result.clean.append(row)

    log.info(result.summary())
    return result


def _structural_check(row: dict) -> str | None:
    """Hard rejects — things that are not 'maybe wrong', they're broken."""
    if not row.get("symbol") or not isinstance(row["symbol"], str):
        return "missing_or_invalid_symbol"
    if not _is_valid_date(row.get("trade_date", "")):
        return "missing_or_invalid_trade_date"
    try:
        qty = int(row["quantity"])
        rate = float(row["rate"])
        amount = float(row["amount"])
    except (KeyError, TypeError, ValueError):
        return "non_numeric_quantity_rate_or_amount"
    if qty <= 0:
        return "non_positive_quantity"
    if rate <= 0:
        return "non_positive_rate"
    # amount should equal qty * rate within rounding tolerance (NPR 1)
    if abs(amount - (qty * rate)) > max(1.0, amount * 0.01):
        return "amount_does_not_match_quantity_times_rate"
    import re
    buyer, seller = str(row.get("buyer_broker", "")), str(row.get("seller_broker", ""))
    if not (re.match(VALID_BROKER_CODE_PATTERN, buyer) and re.match(VALID_BROKER_CODE_PATTERN, seller)):
        return "broker_code_format_unexpected"
    return None


def _plausibility_check(row: dict, day_avg_rate_by_symbol: dict[str, float] | None) -> str | None:
    """Soft flags — structurally fine, but worth a second look."""
    rate = float(row["rate"])
    qty = int(row["quantity"])

    if rate < MIN_PLAUSIBLE_RATE or rate > MAX_PLAUSIBLE_RATE:
        return f"rate_outside_global_bounds({rate})"
    if qty > MAX_PLAUSIBLE_QTY:
        return f"quantity_outside_global_bounds({qty})"
    if row.get("buyer_broker") == row.get("seller_broker"):
        return "buyer_and_seller_broker_identical"  # possible but unusual — worth a glance

    if day_avg_rate_by_symbol:
        avg = day_avg_rate_by_symbol.get(row["symbol"])
        if avg and avg > 0:
            deviation = abs(rate - avg) / avg
            if deviation > 0.25:  # >25% off the day's average for that symbol
                return f"rate_deviates_{deviation:.0%}_from_day_average({avg:.2f})"

    return None


def compute_day_average_rates(rows: list[dict]) -> dict[str, float]:
    """Helper: call this once on a full day's rows before validate_batch
    if you want relative-outlier detection."""
    sums: dict[str, float] = {}
    counts: dict[str, int] = {}
    for r in rows:
        try:
            sym, rate = r["symbol"], float(r["rate"])
        except (KeyError, ValueError, TypeError):
            continue
        sums[sym] = sums.get(sym, 0.0) + rate
        counts[sym] = counts.get(sym, 0) + 1
    return {sym: sums[sym] / counts[sym] for sym in sums}
