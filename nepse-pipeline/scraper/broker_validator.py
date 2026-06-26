"""
Broker Data Validator & Quality Checker
=========================================

Validates broker trading data for accuracy and consistency.
Runs as part of the daily collection pipeline.

Usage:
    python -m scraper.broker_validator --date 2026-06-25
    python -m scraper.broker_validator --check-latest
    python -m scraper.broker_validator --backfill --days 30
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("broker_validator")


@dataclass
class ValidationResult:
    """Result of validating a single broker record."""
    trade_date: str
    broker_code: str
    broker_name: Optional[str]
    is_valid: bool
    errors: list[str]
    warnings: list[str]
    metrics: dict

    def to_dict(self) -> dict:
        return {
            "trade_date": self.trade_date,
            "broker_code": self.broker_code,
            "broker_name": self.broker_name,
            "is_valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "metrics": self.metrics,
        }


class BrokerDataValidator:
    """Validates broker daily records."""

    def __init__(self):
        self.min_turnover = 100  # Minimum expected turnover
        self.max_daily_change = 0.5  # 50% change is suspicious
        self.tolerance = 0.01  # 1% tolerance for floating point

    def validate_record(
        self,
        trade_date: str,
        broker_code: str,
        broker_name: Optional[str],
        purchase_amt: Optional[float],
        sell_amt: Optional[float],
        net_amt: Optional[float],
        total_amt: Optional[float],
    ) -> ValidationResult:
        """Validate a single broker record."""
        errors: list[str] = []
        warnings: list[str] = []
        metrics: dict = {}

        # 1. Check required fields
        if not broker_code or not str(broker_code).strip():
            errors.append("broker_code is empty")

        if purchase_amt is None or sell_amt is None or net_amt is None:
            errors.append("Missing amount fields (purchase_amt, sell_amt, net_amt)")
            return ValidationResult(
                trade_date=trade_date,
                broker_code=broker_code or "?",
                broker_name=broker_name,
                is_valid=False,
                errors=errors,
                warnings=warnings,
                metrics=metrics,
            )

        # 2. Arithmetic validation: net_amt = purchase_amt - sell_amt
        expected_net = purchase_amt - sell_amt
        net_diff = abs(net_amt - expected_net)
        metrics["net_amt_discrepancy"] = net_diff

        if net_diff > self.tolerance:
            errors.append(
                f"net_amt mismatch: expected {expected_net:.2f}, "
                f"got {net_amt:.2f} (diff: {net_diff:.2f})"
            )

        # 3. Total amount validation (optional but helpful)
        if total_amt is not None:
            expected_total = purchase_amt + sell_amt
            total_diff = abs(total_amt - expected_total)
            metrics["total_amt_discrepancy"] = total_diff

            if total_diff > self.tolerance:
                warnings.append(
                    f"total_amt mismatch: expected {expected_total:.2f}, "
                    f"got {total_amt:.2f} (diff: {total_diff:.2f})"
                )

        # 4. Reasonableness checks
        if purchase_amt < 0:
            errors.append(f"purchase_amt is negative: {purchase_amt}")

        if sell_amt < 0:
            errors.append(f"sell_amt is negative: {sell_amt}")

        if (purchase_amt + sell_amt) < self.min_turnover:
            warnings.append(
                f"Very low turnover: {purchase_amt + sell_amt:.2f} "
                f"(below minimum {self.min_turnover})"
            )

        # 5. Net amount sanity check
        total_traded = purchase_amt + sell_amt
        if total_traded > 0:
            net_percentage = abs(net_amt) / total_traded
            metrics["net_percentage"] = net_percentage

            if net_percentage > 0.99:
                warnings.append(
                    f"Extreme imbalance: net is {net_percentage*100:.1f}% "
                    f"of total (one-sided trade)"
                )

        # 6. Broker name sanity
        if broker_name and len(str(broker_name).strip()) > 255:
            errors.append("broker_name exceeds maximum length")

        metrics["purchase_amt"] = purchase_amt
        metrics["sell_amt"] = sell_amt
        metrics["net_amt"] = net_amt
        metrics["total_amt"] = total_amt

        is_valid = len(errors) == 0

        return ValidationResult(
            trade_date=trade_date,
            broker_code=str(broker_code),
            broker_name=broker_name,
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            metrics=metrics,
        )

    def validate_batch(
        self,
        records: list[dict],
    ) -> tuple[list[ValidationResult], dict]:
        """Validate a batch of records."""
        results: list[ValidationResult] = []
        summary = {
            "total": len(records),
            "valid": 0,
            "invalid": 0,
            "warnings": 0,
            "error_types": {},
        }

        for record in records:
            result = self.validate_record(
                trade_date=record.get("trade_date", ""),
                broker_code=record.get("broker_code"),
                broker_name=record.get("broker_name"),
                purchase_amt=record.get("purchase_amt"),
                sell_amt=record.get("sell_amt"),
                net_amt=record.get("net_amt"),
                total_amt=record.get("total_amt"),
            )
            results.append(result)

            if result.is_valid:
                summary["valid"] += 1
            else:
                summary["invalid"] += 1
                for error in result.errors:
                    # Extract error type
                    error_type = error.split(":")[0]
                    summary["error_types"][error_type] = (
                        summary["error_types"].get(error_type, 0) + 1
                    )

            if result.warnings:
                summary["warnings"] += len(result.warnings)

        return results, summary


class DataCompletenessChecker:
    """Check if data is complete for expected brokers."""

    EXPECTED_BROKER_COUNT = 91  # Approximate number of active brokers

    def check_day(self, trade_date: str, record_count: int) -> dict:
        """Check completeness for a single day."""
        completeness = (record_count / self.EXPECTED_BROKER_COUNT) * 100
        completeness = min(completeness, 100)

        return {
            "trade_date": trade_date,
            "record_count": record_count,
            "expected_count": self.EXPECTED_BROKER_COUNT,
            "completeness_percent": round(completeness, 2),
            "is_complete": completeness >= 90,
            "missing_brokers": max(0, self.EXPECTED_BROKER_COUNT - record_count),
        }


class StreakValidator:
    """Validate broker streaks."""

    @staticmethod
    def validate_streak(
        records: list[dict],
        broker_code: str,
    ) -> dict:
        """Validate streak detection for a broker."""
        # Sort by date
        sorted_records = sorted(records, key=lambda x: x["trade_date"])

        if len(sorted_records) < 2:
            return {
                "broker_code": broker_code,
                "streak_valid": True,
                "reason": "Insufficient data (< 2 days)",
                "current_streak": None,
            }

        # Detect direction changes
        directions = []
        for record in sorted_records:
            net_amt = record.get("net_amt", 0)
            if net_amt > 0:
                directions.append("buy")
            elif net_amt < 0:
                directions.append("sell")
            else:
                directions.append("neutral")

        # Find current streak (from most recent backwards)
        current_streak = None
        if len(directions) > 0:
            last_direction = directions[-1]
            if last_direction != "neutral":
                length = 0
                for d in reversed(directions):
                    if d == last_direction:
                        length += 1
                    else:
                        break
                if length >= 2:
                    current_streak = {"direction": last_direction, "length": length}

        return {
            "broker_code": broker_code,
            "streak_valid": True,
            "current_streak": current_streak,
            "data_points": len(sorted_records),
            "directions": directions,
        }


def main():
    parser = argparse.ArgumentParser(description="Broker data validator")
    parser.add_argument("--date", type=str, help="YYYY-MM-DD date to validate")
    parser.add_argument(
        "--check-latest",
        action="store_true",
        help="Check the latest available data",
    )
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="Validate all data from the past N days",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Number of days to backfill (default: 30)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Verbose output",
    )
    args = parser.parse_args()

    validator = BrokerDataValidator()
    completeness = DataCompletenessChecker()

    log.info("Broker Data Validator initialized")

    # Example usage (without DB connection)
    sample_record = {
        "trade_date": "2026-06-25",
        "broker_code": "52",
        "broker_name": "Sundhara Securities Limited",
        "purchase_amt": 32958024.0,
        "sell_amt": 22263463.1,
        "net_amt": 10694560.9,
        "total_amt": 55221487.1,
    }

    result = validator.validate_record(**sample_record)
    print(f"\nSample validation result:")
    print(json.dumps(result.to_dict(), indent=2))

    # Check completeness
    completeness_result = completeness.check_day("2026-06-25", 85)
    print(f"\nCompleteness check:")
    print(json.dumps(completeness_result, indent=2))


if __name__ == "__main__":
    main()
