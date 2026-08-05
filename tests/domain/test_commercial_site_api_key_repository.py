from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.adapters.repositories.commercial_site_api_key_repository import (
    CommercialSiteApiKeyRepository,
)
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import Site


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialSiteApiKeyRepository],
)
def test_commercial_repository_preserves_site_api_key_queries_counts_and_upsert(
    tmp_path: Path,
    repository_type: type[CommercialSiteApiKeyRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 18, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        session.add_all(
            [
                Site(
                    site_id="site_keys_primary",
                    account_id=None,
                    name="Primary",
                    status="active",
                    site_url="https://primary.example.test",
                    metadata_json=None,
                    provisioned_at=now,
                ),
                Site(
                    site_id="site_keys_other",
                    account_id=None,
                    name="Other",
                    status="active",
                    site_url="https://other.example.test",
                    metadata_json=None,
                    provisioned_at=now,
                ),
            ]
        )
        session.flush()
        repository = repository_type(session)
        assert isinstance(repository, CommercialSiteApiKeyRepository)

        assert repository.get_site_key("missing") is None
        old_key = repository.upsert_site_key(
            key_id="key_a",
            site_id="site_keys_primary",
            secret_hash="hash-a",
            signing_secret_ciphertext="cipher-a",
            label="",
            scopes_json=["runtime.execute"],
            metadata_json={"version": 1},
            status="active",
            rotated_from_key_id=None,
            replaced_by_key_id=None,
            expires_at=None,
            revoked_at=None,
        )
        tied_key_b = repository.upsert_site_key(
            key_id="key_b",
            site_id="site_keys_primary",
            secret_hash="hash-b",
            signing_secret_ciphertext="cipher-b",
            label="B",
            scopes_json=None,
            metadata_json=None,
            status="revoked",
            rotated_from_key_id="key_a",
            replaced_by_key_id="key_c",
            expires_at=now + timedelta(days=1),
            revoked_at=now,
        )
        tied_key_c = repository.upsert_site_key(
            key_id="key_c",
            site_id="site_keys_primary",
            secret_hash="hash-c",
            signing_secret_ciphertext="cipher-c",
            label="C",
            scopes_json=["runtime.execute", "usage.read"],
            metadata_json={"source": "test"},
            status="active",
            rotated_from_key_id="key_b",
            replaced_by_key_id=None,
            expires_at=None,
            revoked_at=None,
        )
        repository.upsert_site_key(
            key_id="key_other",
            site_id="site_keys_other",
            secret_hash="hash-other",
            signing_secret_ciphertext="cipher-other",
            label="Other",
            scopes_json=[],
            metadata_json=None,
            status="active",
            rotated_from_key_id=None,
            replaced_by_key_id=None,
            expires_at=None,
            revoked_at=None,
        )
        old_key.created_at = now - timedelta(days=1)
        tied_key_b.created_at = now
        tied_key_c.created_at = now
        session.flush()

        assert old_key.label is None
        assert repository.get_site_key(old_key.key_id) is old_key
        assert [item.key_id for item in repository.list_site_keys("site_keys_primary")] == [
            "key_c",
            "key_b",
            "key_a",
        ]
        assert [
            item.key_id
            for item in repository.list_site_keys("site_keys_primary", limit=2, offset=1)
        ] == ["key_b", "key_a"]
        assert len(repository.list_site_keys("site_keys_primary", limit=0)) == 3
        assert repository.list_site_keys("missing") == []
        assert repository.count_site_keys("site_keys_primary") == 3
        assert repository.count_site_keys("missing") == 0
        assert repository.count_site_keys_by_site() == {
            "site_keys_other": 1,
            "site_keys_primary": 3,
        }
        assert repository.count_site_keys_by_site(site_ids=[]) == {}
        assert repository.count_site_keys_by_site(
            site_ids=["site_keys_primary"], statuses=["active"]
        ) == {"site_keys_primary": 2}
        assert repository.count_site_keys_by_site(site_ids=["site_keys_primary"], statuses=[]) == {
            "site_keys_primary": 3
        }
        assert repository.count_site_keys_total() == 4
        assert repository.count_site_keys_total(statuses=["active"]) == 3
        assert repository.count_site_keys_total(statuses=[]) == 4

        expires_at = now + timedelta(days=30)
        assert (
            repository.upsert_site_key(
                key_id=old_key.key_id,
                site_id=old_key.site_id,
                secret_hash="hash-updated",
                signing_secret_ciphertext="cipher-updated",
                label="Updated",
                scopes_json=["usage.read"],
                metadata_json={"version": 2},
                status="expired",
                rotated_from_key_id="key_previous",
                replaced_by_key_id="key_next",
                expires_at=expires_at,
                revoked_at=now,
            )
            is old_key
        )
        assert old_key.secret_hash == "hash-updated"
        assert old_key.signing_secret_ciphertext == "cipher-updated"
        assert old_key.label == "Updated"
        assert old_key.scopes_json == ["usage.read"]
        assert old_key.metadata_json == {"version": 2}
        assert old_key.status == "expired"
        assert old_key.rotated_from_key_id == "key_previous"
        assert old_key.replaced_by_key_id == "key_next"
        assert old_key.expires_at == expires_at
        assert old_key.revoked_at == now

    dispose_engine(database_url)
