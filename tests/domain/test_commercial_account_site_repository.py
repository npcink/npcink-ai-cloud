from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_account_site_repository import (
    CommercialAccountSiteRepository,
)
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Principal


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialAccountSiteRepository],
)
def test_account_site_repository_preserves_upserts_locks_and_current_bindings(
    tmp_path: Path,
    repository_type: type[CommercialAccountSiteRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 16, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        repository = repository_type(session)
        assert isinstance(repository, CommercialAccountSiteRepository)
        account = repository.upsert_account(
            account_id="acct_account_site",
            name="",
            status="active",
            metadata_json={"version": 1},
        )
        assert account.name == account.account_id
        assert repository.get_account_for_update(account.account_id) is account
        assert repository.get_account_for_update("missing") is None
        assert (
            repository.upsert_account(
                account_id=account.account_id,
                name="",
                status="suspended",
                metadata_json={"version": 2},
            )
            is account
        )
        assert account.name == account.account_id
        assert account.status == "suspended"
        assert account.metadata_json == {"version": 2}

        site = repository.upsert_site(
            site_id="site_account_site",
            account_id=account.account_id,
            name="Site",
            status="active",
            site_url=" https://site.example.test ",
            metadata_json={"url": "discarded", "source": "test"},
            provisioned_at=now,
        )
        assert site.site_url == "https://site.example.test"
        assert site.metadata_json == {"source": "test"}
        assert repository.get_site_for_update(site.site_id) is site
        assert repository.get_site_for_update("missing") is None

        principal = Principal(
            principal_id="prn_account_site",
            email="account-site@example.test",
            status="active",
            session_version=1,
            metadata_json=None,
        )
        session.add(principal)
        session.flush()

        released_site_binding = repository.create_site_account_binding(
            binding_id="site_binding_released",
            site_id=site.site_id,
            account_id=account.account_id,
            status="released",
            bound_at=now - timedelta(days=2),
            released_at=now - timedelta(days=1),
            release_reason="released",
        )
        current_site_binding = repository.create_site_account_binding(
            binding_id="site_binding_current",
            site_id=site.site_id,
            account_id=account.account_id,
            status="active",
            bound_at=now,
            metadata_json={"source": "test"},
        )
        assert released_site_binding.released_at is not None
        assert repository.get_current_site_account_binding(site.site_id) is current_site_binding
        assert (
            repository.get_current_site_account_binding(site.site_id, for_update=True)
            is current_site_binding
        )
        assert repository.get_current_site_account_binding("missing") is None

        released_principal_binding = repository.create_principal_site_binding(
            binding_id="principal_binding_released",
            principal_id=principal.principal_id,
            site_id=site.site_id,
            account_id=account.account_id,
            status="released",
            bound_at=now - timedelta(days=2),
            released_at=now - timedelta(days=1),
            release_reason="released",
        )
        current_principal_binding = repository.create_principal_site_binding(
            binding_id="principal_binding_current",
            principal_id=principal.principal_id,
            site_id=site.site_id,
            account_id=account.account_id,
            status="active",
            bound_at=now,
            metadata_json={"source": "test"},
        )
        assert released_principal_binding.released_at is not None
        assert (
            repository.get_current_principal_site_binding(site.site_id) is current_principal_binding
        )
        assert (
            repository.get_current_principal_site_binding(site.site_id, for_update=True)
            is current_principal_binding
        )
        assert repository.get_current_principal_site_binding("missing") is None

    dispose_engine(database_url)
