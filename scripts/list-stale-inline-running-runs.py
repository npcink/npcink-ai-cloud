#!/usr/bin/env python3
"""Read-only inventory of stale inline runs still stuck in status=running.

Does not mutate the database. To finish an orphan, use the existing operator
repair action ``mark_stale_running_failed`` (requires reason + evidence) via
``POST /internal/service/runs/{run_id}/repair`` — see
``RuntimeService.repair_run``. Do not invent an automatic mark-finished path;
that conflicts with runtime-provider-transaction-boundary-v1.

Usage (from repo root, against a reachable DATABASE_URL):

  DATABASE_URL=postgresql+psycopg://... \\
    .venv/bin/python scripts/list-stale-inline-running-runs.py

Optional: --lease-seconds (default from settings / 180).
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import dispose_engine, get_session
from app.core.models import RunRecord
from app.domain.runtime.models import RUNTIME_INLINE_RUN_LEASE_SECONDS


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--lease-seconds",
        type=int,
        default=0,
        help=f"Override inline lease seconds (0 = {RUNTIME_INLINE_RUN_LEASE_SECONDS}).",
    )
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    settings = get_settings()
    lease = args.lease_seconds or RUNTIME_INLINE_RUN_LEASE_SECONDS
    cutoff = datetime.now(UTC) - timedelta(seconds=lease)
    database_url = settings.database_url

    with get_session(database_url) as session:
        rows = list(
            session.scalars(
                select(RunRecord)
                .where(RunRecord.status == "running")
                .where(RunRecord.execution_pattern == "inline")
                .where(RunRecord.processing_started_at.is_not(None))
                .where(RunRecord.processing_started_at < cutoff)
                .order_by(RunRecord.processing_started_at.asc())
                .limit(args.limit)
            )
        )

    print(f"lease_seconds={lease} cutoff={cutoff.isoformat()} count={len(rows)}")
    for run in rows:
        started = run.processing_started_at
        age = (datetime.now(UTC) - started).total_seconds() if started else None
        print(
            f"{run.run_id}\tsite={run.site_id}\tage_s={int(age) if age is not None else '?'}\t"
            f"started={started}\trepair=mark_stale_running_failed"
        )
    dispose_engine(database_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
