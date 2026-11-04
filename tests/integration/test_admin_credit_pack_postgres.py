"""Run via the integrator's disposable PostgreSQL lane, never the live catalog."""

import pytest

from tests.domain.test_admin_commercial_consistency import assert_catalog_concurrency
from tests.integration.test_portal_postgres_acceptance import (  # noqa: F401
    m4_database_url,
    portal_database,
)


@pytest.mark.parametrize("initial", ["unconfigured", "legacy", "configured"])
def test_credit_pack_cas_on_postgres(request: pytest.FixtureRequest, initial: str) -> None:
    assert_catalog_concurrency(request.getfixturevalue("portal_database"), initial)
