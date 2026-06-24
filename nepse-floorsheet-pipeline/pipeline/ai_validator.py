"""
AI-assisted Validator (optional, opt-in)
==========================================

This is the "AI power" layer you asked for — but used surgically, not on
every row. It only runs on rows the rule-based cleaner already flagged as
suspicious (see pipeline/cleaner.py). For each flagged row it asks Claude:

  1. Is this likely a genuine data/scraping error, or a real (just unusual)
     trade?
  2. If it's an error, what's the most likely correct value?

This keeps API costs proportional to actual anomalies (usually a tiny
fraction of total rows) instead of scaling with total trading volume.

If ANTHROPIC_API_KEY is not set in .env, this module is skipped entirely
and flagged rows are simply held in a "needs_review" DB state for a human
to check — the pipeline still works without it.
"""

from __future__ import annotations

import json
import logging
import os

import httpx

log = logging.getLogger("ai_validator")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are reviewing rows from a NEPSE (Nepal Stock Exchange) \
floorsheet that a rule-based validator has already flagged as statistically \
unusual. For each row, decide if it is:
  - "likely_genuine": an unusual but real trade (e.g. a large block trade)
  - "likely_error": probably a scraping/parsing error
  - "uncertain": not enough context to tell

If "likely_error", suggest the most probable corrected value and explain \
which field is likely wrong and why, in one short sentence.

Respond ONLY with valid JSON, no markdown fences, no preamble. Schema:
{"contract_no": "<echo input>", "verdict": "likely_genuine|likely_error|uncertain", \
"explanation": "<one short sentence>", "suggested_correction": {<field>: <value>} or null}
"""


async def review_flagged_rows(flagged_rows: list[dict]) -> list[dict]:
    """
    Returns the input rows, each annotated with:
      _ai_verdict, _ai_explanation, _ai_suggested_correction
    If no API key is configured, returns rows unchanged with
    _ai_verdict = "skipped_no_api_key".
    """
    if not ANTHROPIC_API_KEY:
        log.info("ANTHROPIC_API_KEY not set — skipping AI review, "
                 "flagged rows will be held for human review instead.")
        for row in flagged_rows:
            row["_ai_verdict"] = "skipped_no_api_key"
        return flagged_rows

    reviewed = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for row in flagged_rows:
            try:
                verdict = await _review_one(client, row)
                row["_ai_verdict"] = verdict.get("verdict", "uncertain")
                row["_ai_explanation"] = verdict.get("explanation", "")
                row["_ai_suggested_correction"] = verdict.get("suggested_correction")
            except Exception as e:
                log.warning(f"AI review failed for row {row.get('contract_no')}: {e}")
                row["_ai_verdict"] = "review_failed"
            reviewed.append(row)
    return reviewed


async def _review_one(client: httpx.AsyncClient, row: dict) -> dict:
    user_content = (
        f"Flag reason from rule-based validator: {row.get('_flag_reason')}\n\n"
        f"Row data: {json.dumps({k: v for k, v in row.items() if not k.startswith('_')})}"
    )

    resp = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODEL,
            "max_tokens": 300,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_content}],
        },
    )
    resp.raise_for_status()
    data = resp.json()
    text = "".join(block.get("text", "") for block in data.get("content", []))
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(text)
