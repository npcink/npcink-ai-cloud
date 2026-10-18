from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event, inspect, select
from sqlalchemy.exc import InvalidRequestError

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_engine, get_session, init_schema
from app.core.models import CreditLedgerEntry, Site, UsageMeterEvent
from app.domain.commercial.credits import package_credit_net_delta
from app.domain.commercial.service import CommercialService

NOW = datetime(2026, 10, 18, 12, tzinfo=UTC)
START = NOW - timedelta(days=1)


def _database_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'runtime-light.sqlite3'}"


def _usage(key: str, quantity: float, **overrides: object) -> UsageMeterEvent:
    return UsageMeterEvent(
        **{
            "site_id": "site-light",
            "subscription_id": "subscription-light",
            "event_kind": "run",
            "meter_key": "runs",
            "quantity": quantity,
            "ability_family": "automation",
            "execution_kind": "nightly_site_inspection",
            "dedupe_key": key,
            "payload_json": {"large": "x" * 4096},
            "created_at": NOW,
            **overrides,
        }
    )


def _credit(key: str, delta: float, **overrides: object) -> CreditLedgerEntry:
    return CreditLedgerEntry(
        **{
            "ledger_entry_id": key,
            "account_id": "account-light",
            "subscription_id": "subscription-light",
            "event_type": "consume",
            "source_type": "runs",
            "source_id": key,
            "ai_credit_delta": delta,
            "quantity": abs(delta),
            "rate_version": "test",
            "idempotency_key": key,
            "metadata_json": {"large": "x" * 4096},
            "created_at": NOW,
            **overrides,
        }
    )


def _usage_rows(repository: CommercialRepository) -> list[UsageMeterEvent]:
    return repository.list_runtime_usage_facts(
        "site-light",
        subscription_id="subscription-light",
        period_start_at=START,
        period_end_at=NOW,
    )


def _credit_rows(repository: CommercialRepository) -> list[CreditLedgerEntry]:
    return repository.list_runtime_credit_facts(
        account_id="account-light",
        subscription_id="subscription-light",
        event_types=["consume", "grant", "adjustment"],
        since=START,
        until=NOW,
    )


def _seed(database_url: str) -> None:
    init_schema(database_url)
    with get_session(database_url) as session:
        session.add(Site(site_id="site-light", name="Light", status="active"))
        session.flush()
        session.add_all(
            [
                _usage("fraction-a", 1.9),
                _usage("fraction-b", 1.9),
                _usage("negative", -0.9),
                _usage("not-nightly", 50, meter_key="tokens"),
                _usage("start-inclusive", 2, created_at=START),
                _usage("before", 99, created_at=START - timedelta(microseconds=1)),
                _usage("after", 99, created_at=NOW + timedelta(microseconds=1)),
                _usage("other-sub", 99, subscription_id="other"),
                _credit("z-positive", 1e16),
                _credit("y-small", 1.0),
                _credit("x-negative", -1e16),
                _credit("w-round", -0.1234567),
                _credit("v-purchase", 100, source_type="credit_pack_purchase"),
                _credit("u-refund", -100, source_type="credit_pack_refund"),
                _credit("start-inclusive", 0.0000004, created_at=START),
                _credit("before", -99, created_at=START - timedelta(microseconds=1)),
                _credit("after", -99, created_at=NOW + timedelta(microseconds=1)),
                _credit("other-sub", -99, subscription_id="other"),
                _credit("other-account", -99, account_id="other"),
                _credit("other-type", -99, event_type="refund"),
            ]
        )
        session.commit()


def test_light_reads_preserve_filters_order_rounding_and_skip_large_columns(tmp_path: Path) -> None:
    url = _database_url(tmp_path)
    _seed(url)
    with get_session(url) as session:
        repository = CommercialRepository(session)
        usages, credits = _usage_rows(repository), _credit_rows(repository)
        usage_ids = [row.id for row in usages]
        credit_ids = [row.ledger_entry_id for row in credits]
        assert len(usages) == 5
        assert len(credits) == 7
        assert all("payload_json" in inspect(row).unloaded for row in usages)
        assert all("metadata_json" in inspect(row).unloaded for row in credits)
        with pytest.raises(InvalidRequestError):
            _ = usages[0].payload_json
        with pytest.raises(InvalidRequestError):
            _ = credits[0].metadata_json
        state = CommercialService(url)._build_pro_cloud_runtime_state(
            usages,
            batch_limits={"nightly_inspection_runs_per_period": 9},
        )
        assert state["used_nightly_inspection_runs"] == 4
        net = package_credit_net_delta(credits)
        # Keep left-to-right float addition and final round(, 6); SQL SUM or
        # reversing the tied-row order changes this cancellation example.
        assert net == -0.123456
        full_usages = repository.list_usage_meter_events(
            "site-light",
            subscription_id="subscription-light",
            period_start_at=START,
            period_end_at=NOW,
        )
        full_credits = repository.list_credit_ledger_entries(
            account_ids=["account-light"],
            subscription_id="subscription-light",
            event_types=["consume", "grant", "adjustment"],
            since=START,
            until=NOW,
        )
        assert usage_ids == [row.id for row in full_usages]
        assert credit_ids == [row.ledger_entry_id for row in full_credits]
        assert net == package_credit_net_delta(full_credits)
        assert state == CommercialService(url)._build_pro_cloud_runtime_state(
            full_usages,
            batch_limits={"nightly_inspection_runs_per_period": 9},
        )
        assert full_usages[0].payload_json == {"large": "x" * 4096}
        assert full_credits[0].metadata_json == {"large": "x" * 4096}
    dispose_engine(url)


def test_light_reads_keep_dirty_identity_map_values_without_autoflush(tmp_path: Path) -> None:
    url = _database_url(tmp_path)
    _seed(url)
    statements: list[str] = []
    engine = get_engine(url)

    def capture(_conn: object, _cursor: object, statement: str, *_args: object) -> None:
        statements.append(statement)

    with get_session(url) as session:
        repository = CommercialRepository(session)
        usage = session.scalar(
            select(UsageMeterEvent).where(UsageMeterEvent.dedupe_key == "not-nightly")
        )
        credit = session.get(CreditLedgerEntry, "v-purchase")
        assert usage is not None and credit is not None
        usage.meter_key, usage.quantity = "runs", 7.9
        credit.source_type, credit.ai_credit_delta = "runs", -5.25
        credit.metadata_json = {"dirty": True}
        session.add_all([_usage("pending", 100), _credit("pending", -100)])
        event.listen(engine, "before_cursor_execute", capture)
        try:
            usages, credits = _usage_rows(repository), _credit_rows(repository)
            assert usage in usages and credit in credits
            assert sum(int(row.quantity) for row in usages if row.meter_key == "runs") == 11
            assert credit.source_type == "runs" and credit.ai_credit_delta == -5.25
            assert credit.metadata_json == {"dirty": True}
            assert len(usages) == 5 and len(credits) == 7
            assert len(statements) == 2
            assert all(statement.lstrip().startswith("SELECT") for statement in statements)
            assert "payload_json" not in statements[0]
            assert "metadata_json" not in statements[1]
        finally:
            event.remove(engine, "before_cursor_execute", capture)
        session.rollback()
    with get_session(url) as session:
        assert session.get(CreditLedgerEntry, "pending") is None
        assert session.get(CreditLedgerEntry, "v-purchase").ai_credit_delta == 100
    dispose_engine(url)


def test_light_reads_see_flushed_writes_and_rollback_removes_all_evidence(tmp_path: Path) -> None:
    url = _database_url(tmp_path)
    _seed(url)
    with get_session(url) as session:
        repository = CommercialRepository(session)
        session.add_all([_usage("flushed", 3), _credit("flushed", -3)])
        session.flush()
        assert len(_usage_rows(repository)) == 6
        assert len(_credit_rows(repository)) == 8
        session.rollback()
        assert len(_usage_rows(repository)) == 5
        assert len(_credit_rows(repository)) == 7
        assert session.get(CreditLedgerEntry, "flushed") is None
        assert (
            repository.list_runtime_credit_facts(
                account_id="account-light",
                subscription_id="subscription-light",
                event_types=[],
                since=START,
                until=NOW,
            )
            == []
        )
    dispose_engine(url)
