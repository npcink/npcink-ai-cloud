from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_platform_admin_queries import (
    CommercialPlatformAdminQueries,
)
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import PlatformAdminGrant, Principal


@pytest.mark.parametrize(
    "query_type",
    [CommercialRepository, CommercialPlatformAdminQueries],
)
def test_platform_admin_queries_preserve_lookup_filters_order_and_limit(
    tmp_path: Path,
    query_type: type[CommercialPlatformAdminQueries],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{query_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 13, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        principals = [
            Principal(
                principal_id=principal_id,
                email=email,
                status="active",
                session_version=1,
                metadata_json=None,
            )
            for principal_id, email in [
                ("platform:older", "older@example.test"),
                ("platform:newer-a", "newer-a@example.test"),
                ("platform:newer-b", "newer-b@example.test"),
            ]
        ]
        session.add_all(principals)
        session.flush()
        older = PlatformAdminGrant(
            grant_id="grant_older",
            principal_id="platform:older",
            provider="manual",
            external_subject=None,
            email="Older@Example.Test",
            role="platform_admin",
            status="revoked",
            metadata_json=None,
            created_at=now - timedelta(days=1),
        )
        newer_a = PlatformAdminGrant(
            grant_id="grant_newer_a",
            principal_id="platform:newer-a",
            provider="oidc",
            external_subject="subject-a",
            email="Newer-A@Example.Test",
            role="platform_admin",
            status="active",
            metadata_json=None,
            created_at=now,
        )
        newer_b = PlatformAdminGrant(
            grant_id="grant_newer_b",
            principal_id="platform:newer-b",
            provider="oidc",
            external_subject="subject-b",
            email="newer-b@example.test",
            role="platform_admin",
            status="active",
            metadata_json=None,
            created_at=now,
        )
        session.add_all([older, newer_b, newer_a])
        session.flush()

        queries = query_type(session)
        assert isinstance(queries, CommercialPlatformAdminQueries)
        assert queries.get_platform_admin_grant(principal_id=older.principal_id) is older
        assert queries.get_platform_admin_grant(principal_id="missing") is None
        assert (
            queries.get_platform_admin_grant_by_subject(
                provider="oidc", external_subject="subject-a"
            )
            is newer_a
        )
        assert (
            queries.get_platform_admin_grant_by_subject(
                provider="manual", external_subject="subject-a"
            )
            is None
        )
        assert (
            queries.get_platform_admin_grant_by_email(provider="oidc", email="NEWER-A@EXAMPLE.TEST")
            is newer_a
        )
        assert (
            queries.get_platform_admin_grant_by_email(
                provider="manual", email="NEWER-A@EXAMPLE.TEST"
            )
            is None
        )
        assert queries.list_platform_admin_grants() == [newer_a, newer_b, older]
        assert queries.list_platform_admin_grants(status="active") == [newer_a, newer_b]
        assert queries.list_platform_admin_grants(role="platform_admin") == [
            newer_a,
            newer_b,
            older,
        ]
        assert queries.list_platform_admin_grants(provider="manual") == [older]
        assert queries.list_platform_admin_grants(limit=1) == [newer_a]
        assert queries.list_platform_admin_grants(limit=0) == [newer_a, newer_b, older]
        assert queries.list_platform_admin_grants(limit=-1) == [newer_a, newer_b, older]

    dispose_engine(database_url)
