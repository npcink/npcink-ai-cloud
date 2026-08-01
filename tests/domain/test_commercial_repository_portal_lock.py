from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import build_postgres_advisory_lock_material


class _PostgresSession:
    def __init__(self) -> None:
        self.parameters: list[dict[str, object]] = []

    def get_bind(self) -> SimpleNamespace:
        return SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

    def execute(self, _statement: object, parameters: dict[str, object]) -> None:
        self.parameters.append(parameters)

    def flush(self) -> None:
        return None


def test_portal_login_code_advisory_lock_uses_postgres_safe_text(
    monkeypatch: Any,
) -> None:
    session = _PostgresSession()
    repository = CommercialRepository(cast(Any, session))
    monkeypatch.setattr(repository, "list_portal_login_codes", lambda **_kwargs: [])

    repository.expire_pending_portal_login_codes(
        email=" Portal-Demo@Example.com ",
        purpose="portal_login",
        now=datetime(2026, 8, 1, tzinfo=UTC),
    )

    lock_material = str(session.parameters[0]["lock_material"])
    assert lock_material == '["portal-demo@example.com","portal_login"]'
    assert "\0" not in lock_material


def test_portal_login_code_advisory_lock_key_is_unambiguous(
    monkeypatch: Any,
) -> None:
    session = _PostgresSession()
    repository = CommercialRepository(cast(Any, session))
    monkeypatch.setattr(repository, "list_portal_login_codes", lambda **_kwargs: [])
    now = datetime(2026, 8, 1, tzinfo=UTC)

    repository.expire_pending_portal_login_codes(
        email="ab",
        purpose="c",
        now=now,
    )
    repository.expire_pending_portal_login_codes(
        email="a",
        purpose="bc",
        now=now,
    )

    assert session.parameters[0]["lock_material"] != session.parameters[1]["lock_material"]


def test_postgres_advisory_lock_material_escapes_nul_as_text() -> None:
    lock_material = build_postgres_advisory_lock_material("alpha\0beta", "scope")

    assert lock_material == '["alpha\\u0000beta","scope"]'
    assert "\0" not in lock_material
