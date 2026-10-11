from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.db import dispose_engine, init_schema
from app.domain.site_knowledge.metrics import cleanup_site_knowledge_observability


@pytest.fixture
def database_url(tmp_path: Path) -> Iterator[str]:
    url = f"sqlite+pysqlite:///{tmp_path / 'site-knowledge-observability.sqlite3'}"
    init_schema(url)
    yield url
    dispose_engine(url)


def test_site_knowledge_observability_cleanup_is_bounded(database_url: str) -> None:
    # The shared fixture creates the schema; this test only verifies the
    # cleanup contract against an empty store without touching index rows.
    result = cleanup_site_knowledge_observability(
        database_url,
        retention_days=180,
        batch_size=10,
        now=datetime.now(UTC) + timedelta(days=1),
    )

    assert result == {"search_metrics": 0, "index_metrics": 0, "snapshots": 0}
