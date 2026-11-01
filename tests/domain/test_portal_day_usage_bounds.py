from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.db import dispose_engine, get_session, init_schema
from app.domain.commercial.errors import CommercialValidationError
from tests.domain.test_commercial_credit_ledger_queries import _entry
from tests.domain.test_payment_service import _seed_account_and_plan, _service, _sqlite_url


def test_day_aggregation_and_pagination_include_more_than_2000_events(tmp_path: Path) -> None:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    service = _service(database_url)
    service.now_factory = lambda: datetime(2026, 11, 3, tzinfo=UTC)
    _seed_account_and_plan(service)
    start = datetime(2026, 11, 1, 4, tzinfo=UTC)
    end = datetime(2026, 11, 2, 5, tzinfo=UTC)  # New York fall-back day, 25h.
    with get_session(database_url) as session:
        session.add_all(
            [
                _entry(
                    f"day-{i:04}",
                    account_id="acct_pay",
                    delta=-1,
                    created_at=end - timedelta(minutes=30),
                )
                for i in range(2001)
            ]
        )
        session.add(_entry("outside", account_id="acct_pay", delta=-99, created_at=end))
        session.commit()
    result = service.get_portal_account_credit_event_buckets(
        "acct_pay",
        bucket="60m",
        window="7d",
        range_start_at=start,
        range_end_at=end,
        limit=50,
    )
    assert result["summary"]["consumed_ai_credits"] == 2001
    assert sum(item["event_count"] for item in result["items"]) == 2001
    assert result["pagination"]["has_more"] is False
    naive_result = service.get_portal_account_credit_event_buckets(
        "acct_pay",
        bucket="60m",
        window="7d",
        range_start_at=start.replace(tzinfo=None),
        range_end_at=end.replace(tzinfo=None),
        limit=50,
    )
    assert naive_result["summary"] == result["summary"]
    tail = service.get_portal_account_credit_events(
        "acct_pay",
        window="7d",
        range_start_at=start,
        range_end_at=end,
        offset=2000,
        limit=20,
    )
    assert tail["pagination"]["total"] == 2001
    assert len(tail["items"]) == 1
    for bad_start, bad_end in [(start, None), (None, end), (end, start), (start, start)]:
        with pytest.raises(CommercialValidationError) as error:
            service.get_portal_account_credit_event_buckets(
                "acct_pay",
                window="7d",
                range_start_at=bad_start,
                range_end_at=bad_end,
            )
        assert error.value.error_code == "service.portal_credit_event_range_invalid"
    dispose_engine(database_url)
