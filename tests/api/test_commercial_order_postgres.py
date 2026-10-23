"""Opt-in concurrency proof in an isolated schema on disposable M4 PostgreSQL."""

from __future__ import annotations

import os
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from sqlalchemy import select, text
from sqlalchemy.engine import make_url

from app.api.auth import PortalBearerTokenError, enforce_portal_subscription_order_rate_limit
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ReplayReceipt


@pytest.fixture
def disposable_postgres_url() -> Iterator[str]:
    raw_url = os.environ.get("NPCINK_TEST_DISPOSABLE_POSTGRES_URL", "")
    if not raw_url:
        pytest.skip("explicit disposable PostgreSQL URL is not configured")
    url = make_url(raw_url)
    if url.get_backend_name() != "postgresql" or url.host != "postgres":
        pytest.fail("this test only accepts the disposable Docker PostgreSQL hostname")
    schema = f"commerce_limit_{uuid4().hex}"
    isolated_url = url.update_query_dict(
        {"options": f"-csearch_path={schema}"}
    ).render_as_string(hide_password=False)
    with get_session(raw_url) as session:
        session.execute(text(f'CREATE SCHEMA "{schema}"'))
        session.commit()
    try:
        yield isolated_url
    finally:
        dispose_engine(isolated_url)
        with get_session(raw_url) as session:
            session.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            session.commit()
        dispose_engine(raw_url)


def test_concurrent_account_order_limit_on_disposable_postgres(
    disposable_postgres_url: str,
) -> None:
    isolated_url = disposable_postgres_url
    init_schema(isolated_url)
    app = FastAPI()
    app.state.services = SimpleNamespace(settings=SimpleNamespace(database_url=isolated_url))
    barrier = Barrier(12)

    def attempt(index: int, *, account_id: str = "same_account") -> int:
        path = (
            "/portal/v1/account/subscription-orders"
            if index % 2 else "/portal/v1/sites/site_test/credit-pack-orders"
        )
        request = Request({"type": "http", "app": app, "method": "POST", "path": path,
                           "headers": []})
        if account_id == "same_account":
            barrier.wait(timeout=20)
        try:
            enforce_portal_subscription_order_rate_limit(request, account_id=account_id)
        except PortalBearerTokenError as error:
            assert error.error_code == "portal.subscription_order_rate_limited"
            assert 1 <= error.retry_after_seconds <= 60
            return 429
        return 200

    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(attempt, range(12)))
    assert results.count(200) == 3
    assert results.count(429) == 9
    assert [attempt(i, account_id="other_account") for i in range(3)] == [200] * 3
    with get_session(isolated_url) as session:
        receipts = session.scalars(select(ReplayReceipt).where(
            ReplayReceipt.scope_kind == "portal_order_account",
            ReplayReceipt.scope_id == "same_account",
        )).all()
        assert len(receipts) == 3
        for receipt in receipts:
            receipt.created_at = datetime.now(UTC) - timedelta(seconds=61)
            receipt.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    request = Request({"type": "http", "app": app, "method": "POST", "path": "/orders",
                       "headers": []})
    enforce_portal_subscription_order_rate_limit(request, account_id="same_account")


@pytest.mark.parametrize("scenario", [
    "shared_trial", "new_plus", "new_pro", "withdrawal_recovery", "stop_replay_refund",
])
def test_commerce_regressions_on_disposable_postgres(
    disposable_postgres_url: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    scenario: str,
) -> None:
    """Replay the existing business assertions against PostgreSQL, not SQLite."""
    from tests.domain import test_plan_sale_availability as sales
    from tests.domain import test_subscription_commerce as commerce

    monkeypatch.setattr(commerce, "_database_url", lambda _: disposable_postgres_url)
    monkeypatch.setattr(sales, "_database_url", lambda _: disposable_postgres_url)
    if scenario == "shared_trial":
        commerce.test_paid_trial_is_shared_and_only_moves_upward(tmp_path)
    elif scenario in {"new_plus", "new_pro"}:
        tier = scenario.removeprefix("new_")
        sales.test_new_accounts_can_purchase_or_start_shared_trial_without_invitation(
            tmp_path, tier, 15 if tier == "plus" else 29, 3000 if tier == "plus" else 5000,
        )
    elif scenario == "withdrawal_recovery":
        sales.test_emergency_recovery_keeps_withdrawn_offers_and_packs_unavailable(tmp_path)
    else:
        commerce.test_emergency_stop_allows_existing_settlement_replay_and_refunds(tmp_path)
