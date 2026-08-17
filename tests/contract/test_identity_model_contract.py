from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.models import IdentityProviderBinding, PlatformAdminGrant
from app.domain.commercial.errors import CommercialPermissionError
from app.domain.commercial.identity import (
    IDENTITY_TYPE_PLATFORM_ADMIN,
    IDENTITY_TYPE_USER,
    PLATFORM_ADMIN_ALLOWED_ROLES,
    USER_ALLOWED_ACTION_PROVISION_SITES,
    USER_ALLOWED_ROLES,
    _canonicalize_platform_admin_role_for_write,
    _new_principal_id,
    _normalize_principal_email,
    normalize_user_role,
    resolve_principal_allowed_actions,
)


def test_launch_identity_model_has_only_platform_admin_and_user() -> None:
    assert IDENTITY_TYPE_PLATFORM_ADMIN == "platform_admin"
    assert IDENTITY_TYPE_USER == "user"
    assert PLATFORM_ADMIN_ALLOWED_ROLES == {"platform_admin"}
    assert USER_ALLOWED_ROLES == {"owner"}


def test_portal_user_actions_keep_addon_provision_without_key_management() -> None:
    actions = set(resolve_principal_allowed_actions())

    assert USER_ALLOWED_ACTION_PROVISION_SITES in actions
    assert actions == {
        "view_sites",
        "view_usage",
        "view_billing",
        "manage_billing",
        "view_audit",
        "run_ai_insights",
        "provision_sites",
        "remove_sites",
    }


def test_operator_role_is_not_accepted_before_the_role_is_launched() -> None:
    with pytest.raises(CommercialPermissionError) as error:
        normalize_user_role("operator")

    assert error.value.error_code == "service.portal_user_role_invalid"


@pytest.mark.parametrize("value", ["", "operator", "user", "unexpected"])
def test_platform_admin_role_write_path_rejects_unlaunched_roles(value: str) -> None:
    with pytest.raises(CommercialPermissionError) as error:
        _canonicalize_platform_admin_role_for_write(value)

    assert error.value.error_code == "service.platform_admin_role_invalid"


def test_platform_admin_role_is_locked_to_canonical_database_value() -> None:
    constraint_names = {
        str(constraint.name or "")
        for constraint in PlatformAdminGrant.__table__.constraints
    }

    assert "ck_platform_admin_grants_role" in constraint_names


@pytest.mark.parametrize(
    "value",
    [
        "a@b",
        "foo@@bar",
        "a b@example.com",
        "a@b..com",
        ".foo@example.com",
        "foo.@example.com",
        "foo..bar@example.com",
        "a@-example.com",
        "a@example-.com",
    ],
)
def test_principal_email_rejects_malformed_login_aliases(value: str) -> None:
    with pytest.raises(CommercialPermissionError) as error:
        _normalize_principal_email(value)

    assert error.value.error_code == "service.principal_email_invalid"


def test_principal_email_rejects_values_that_exceed_database_capacity() -> None:
    with pytest.raises(CommercialPermissionError) as error:
        _normalize_principal_email(f"{'a' * 180}@example.com")

    assert error.value.error_code == "service.principal_email_invalid"


def test_principal_ids_use_the_frozen_server_generated_format() -> None:
    principal_id = _new_principal_id()

    assert principal_id.startswith("prn_")
    assert len(principal_id) == 36
    assert int(principal_id.removeprefix("prn_"), 16) >= 0


def test_unionid_remains_a_service_invariant_without_a_global_database_constraint() -> None:
    constraint_names = {
        str(constraint.name or "") for constraint in IdentityProviderBinding.__table__.constraints
    }

    assert "uq_identity_provider_bindings_provider_subject" in constraint_names
    assert "uq_identity_provider_bindings_provider_unionid" not in constraint_names


def test_provider_binding_cannot_move_between_principals(monkeypatch: pytest.MonkeyPatch) -> None:
    class NoopSession:
        def flush(self) -> None:
            return None

    binding = SimpleNamespace(
        principal_id="prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        unionid_hash=None,
    )
    repository = CommercialRepository(cast(Any, NoopSession()))
    monkeypatch.setattr(
        repository,
        "get_identity_provider_binding",
        lambda **_kwargs: binding,
    )

    with pytest.raises(ValueError, match="principal_id is immutable"):
        repository.upsert_identity_provider_binding(
            binding_id="pib_test",
            principal_id="prn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            provider="qq",
            external_subject_hash="subject-hash",
            unionid_hash=None,
        )

    assert binding.principal_id == "prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
