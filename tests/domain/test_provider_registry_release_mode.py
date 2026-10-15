from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.adapters.providers import registry


def test_release_provider_resolution_does_not_hide_database_errors(monkeypatch) -> None:
    def fail_get_session(database_url: str):
        del database_url
        raise SQLAlchemyError("database unavailable")

    monkeypatch.setattr(registry, "get_session", fail_get_session)

    with pytest.raises(SQLAlchemyError, match="database unavailable"):
        registry._load_enabled_provider_connections(  # noqa: SLF001
            SimpleNamespace(database_url="postgresql://release"),
            connection_source_roles=None,
            fail_on_database_error=True,
        )
