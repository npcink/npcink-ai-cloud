from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.repositories.commercial_identity_repository import (
    CommercialIdentityRepository,
)
from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import dispose_engine, get_session, init_schema


@pytest.mark.parametrize(
    "repository_type",
    [CommercialRepository, CommercialIdentityRepository],
)
def test_identity_repository_preserves_upsert_conflict_revoke_and_version_semantics(
    tmp_path: Path,
    repository_type: type[CommercialIdentityRepository],
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / f'{repository_type.__name__}.sqlite3'}"
    init_schema(database_url)
    now = datetime(2026, 8, 3, 15, 0, tzinfo=UTC)

    with get_session(database_url) as session:
        repository = repository_type(session)
        assert isinstance(repository, CommercialIdentityRepository)
        principal = repository.upsert_principal_identity(
            principal_id="prn_identity",
            email="identity@example.test",
            metadata_json={"version": 1},
            last_login_at=now,
        )
        assert principal.status == "active"
        assert principal.session_version == 1
        assert principal.last_login_at == now

        updated = repository.upsert_principal_identity(
            principal_id=principal.principal_id,
            email="updated@example.test",
            status="disabled",
            metadata_json={"version": 2},
            last_login_at=None,
        )
        assert updated is principal
        assert updated.email == "updated@example.test"
        assert updated.status == "disabled"
        assert updated.metadata_json == {"version": 2}
        assert updated.last_login_at == now
        assert (
            repository.upsert_principal_identity(
                principal_id="prn_alias",
                email="UPDATED@EXAMPLE.TEST",
            )
            is principal
        )

        other = repository.upsert_principal_identity(
            principal_id="prn_other",
            email="other@example.test",
        )
        binding = repository.upsert_identity_provider_binding(
            binding_id="binding_identity",
            principal_id=principal.principal_id,
            provider="qq",
            external_subject_hash="subject-one",
            unionid_hash="union-one",
            metadata_json={"version": 1},
            last_login_at=now,
        )
        assert binding.status == "active"
        assert binding.last_login_at == now
        assert (
            repository.upsert_identity_provider_binding(
                binding_id="ignored-on-update",
                principal_id=principal.principal_id,
                provider="qq",
                external_subject_hash="subject-one",
                unionid_hash=None,
                status="revoked",
                metadata_json={"version": 2},
                last_login_at=None,
            )
            is binding
        )
        assert binding.binding_id == "binding_identity"
        assert binding.unionid_hash is None
        assert binding.status == "revoked"
        assert binding.metadata_json == {"version": 2}
        assert binding.last_login_at == now

        binding.status = "active"
        binding.unionid_hash = "union-one"
        session.flush()
        with pytest.raises(
            ValueError,
            match="identity provider binding principal_id is immutable",
        ):
            repository.upsert_identity_provider_binding(
                binding_id="binding_subject_conflict",
                principal_id=other.principal_id,
                provider="qq",
                external_subject_hash="subject-one",
                unionid_hash="union-other",
            )
        with pytest.raises(
            ValueError,
            match="identity provider binding principal_id is immutable",
        ):
            repository.upsert_identity_provider_binding(
                binding_id="binding_union_conflict",
                principal_id=other.principal_id,
                provider="qq",
                external_subject_hash="subject-other",
                unionid_hash="union-one",
            )

        assert (
            repository.revoke_identity_provider_bindings(
                principal_id=principal.principal_id,
                provider="qq",
            )
            == 1
        )
        assert binding.status == "revoked"
        assert (
            repository.revoke_identity_provider_bindings(
                principal_id=principal.principal_id,
                provider="qq",
            )
            == 0
        )

        principal.session_version = 0
        session.flush()
        assert (
            repository.increment_principal_session_version(principal_id=principal.principal_id)
            is principal
        )
        assert principal.session_version == 1
        assert repository.increment_principal_session_version(principal_id="missing") is None
        assert repository.upsert_principal_identity(
            principal_id=other.principal_id,
            email=other.email,
            last_login_at=now + timedelta(minutes=1),
        ).last_login_at == now + timedelta(minutes=1)

    dispose_engine(database_url)
