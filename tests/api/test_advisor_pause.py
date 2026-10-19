from pathlib import Path

import pytest

from app.api.routes import service as routes
from app.core.db import dispose_engine
from tests.api.service_routes_test_support import _build_client
from tests.conftest import build_internal_headers


@pytest.mark.parametrize(
    "path",
    [
        "runtime",
        "commercial",
        "routing?site_id=site_mvp",
        "site-diagnostics?site_id=site_mvp",
        "operations",
        "ops-summary",
        "ops-summary-preview",
        "ops-summary-review",
    ],
)
def test_paused_advisor_never_constructs_service(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    database_url, client = _build_client(tmp_path)

    def forbidden(*args: object) -> None:
        pytest.fail("paused advisor must not construct services or call providers")

    monkeypatch.setattr(routes, "_get_advisor_service", forbidden)
    try:
        url = f"/internal/service/advisor/{path}"
        if path == "ops-summary-review":
            response = client.post(
                url,
                headers=build_internal_headers(idempotency_key="paused-review"),
                json={"cache_key": "retained-summary-cache", "review_status": "human_confirmed"},
            )
        else:
            response = client.get(url, headers=build_internal_headers())
        assert response.status_code == 409
        assert response.json()["error_code"] == "advisor.feature_paused"
        assert response.json()["data"]["retryable"] is False
        assert client.get(url).status_code in {401, 403, 405}
    finally:
        client.close()
        dispose_engine(database_url)


def test_advisor_history_remains_read_only(tmp_path: Path) -> None:
    database_url, client = _build_client(tmp_path)
    try:
        response = client.get(
            "/internal/service/advisor/ops-summary-history",
            headers=build_internal_headers(),
        )
        assert response.status_code == 200
    finally:
        client.close()
        dispose_engine(database_url)
