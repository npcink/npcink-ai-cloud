from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.dialects import postgresql

from app.domain.runtime.service import RuntimeService
from app.domain.service_settings import (
    media_recognition_next_window_start,
    media_recognition_window_is_open,
)


class _QuotaSession:
    def __init__(self) -> None:
        self.executed: list[object] = []

    def execute(self, statement: object) -> None:
        self.executed.append(statement)

    @staticmethod
    def scalars(_statement: object) -> list[object]:
        return []


def test_cross_midnight_window_and_next_start_use_configured_timezone() -> None:
    policy = {
        "timezone": "Asia/Shanghai",
        "window_start": "23:00",
        "window_end": "02:00",
    }

    assert media_recognition_window_is_open(
        policy,
        now=datetime(2026, 8, 27, 16, 30, tzinfo=UTC),
    )
    assert media_recognition_window_is_open(
        policy,
        now=datetime(2026, 8, 27, 17, 30, tzinfo=UTC),
    )
    assert not media_recognition_window_is_open(
        policy,
        now=datetime(2026, 8, 27, 7, 0, tzinfo=UTC),
    )
    assert media_recognition_next_window_start(
        policy,
        now=datetime(2026, 8, 27, 7, 0, tzinfo=UTC),
    ) == datetime(2026, 8, 27, 15, 0, tzinfo=UTC)


def test_daytime_window_rolls_next_start_to_following_local_day() -> None:
    policy = {
        "timezone": "Asia/Shanghai",
        "window_start": "01:00",
        "window_end": "06:00",
    }

    assert media_recognition_next_window_start(
        policy,
        now=datetime(2026, 8, 27, 2, 0, tzinfo=UTC),
    ) == datetime(2026, 8, 27, 17, 0, tzinfo=UTC)


def test_intake_quota_reservation_locks_the_shared_policy_row() -> None:
    session = _QuotaSession()
    policy = {
        "enabled": True,
        "timezone": "UTC",
        "window_start": "01:00",
        "window_end": "06:00",
        "daily_limit": 10,
    }

    eligible_at = RuntimeService._media_recognition_worker_eligible_at(
        session,
        policy=policy,
        requested_items=1,
        now=datetime(2026, 8, 27, 2, 0, tzinfo=UTC),
        lock_quota_reservations=True,
    )

    assert eligible_at == datetime(2026, 8, 27, 2, 0, tzinfo=UTC)
    assert len(session.executed) == 1
    sql = str(
        session.executed[0].compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    assert "media_recognition_policy" in sql
    assert "FOR UPDATE" in sql
