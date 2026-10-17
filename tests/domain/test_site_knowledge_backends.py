from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.domain.site_knowledge.backends import (
    SiteKnowledgeBackendError,
    ZillizCloudSiteKnowledgeBackend,
)


@pytest.mark.parametrize("failure", [OSError("private endpoint/token"), RuntimeError("DNS")])
def test_zilliz_connection_failure_becomes_safe_backend_error(
    monkeypatch: pytest.MonkeyPatch, failure: Exception
) -> None:
    def connect(**_kwargs: object) -> None:
        raise failure

    monkeypatch.setitem(
        sys.modules, "pymilvus", SimpleNamespace(DataType=object, MilvusClient=connect)
    )
    settings = Settings(
        _env_file=None,
        environment="test",
        site_knowledge_zilliz_uri="https://vector.example.invalid",
        site_knowledge_zilliz_token="test-only-token",
    )

    with pytest.raises(SiteKnowledgeBackendError) as captured:
        ZillizCloudSiteKnowledgeBackend(settings)

    assert captured.value.error_code == "site_knowledge.zilliz_connection_failed"
    assert captured.value.message == "Zilliz site knowledge connection is not ready"
    assert captured.value.__cause__ is failure


def test_zilliz_connection_does_not_swallow_worker_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def connect(**_kwargs: object) -> None:
        raise KeyboardInterrupt

    monkeypatch.setitem(
        sys.modules, "pymilvus", SimpleNamespace(DataType=object, MilvusClient=connect)
    )
    settings = Settings(
        _env_file=None,
        environment="test",
        site_knowledge_zilliz_uri="https://vector.example.invalid",
        site_knowledge_zilliz_token="test-only-token",
    )

    with pytest.raises(KeyboardInterrupt):
        ZillizCloudSiteKnowledgeBackend(settings)
