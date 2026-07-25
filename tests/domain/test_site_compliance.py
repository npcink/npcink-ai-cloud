from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import ProviderConnection, ServiceSetting
from app.domain.site_compliance import SiteComplianceAdminError, SiteComplianceAdminService


def _build_service(tmp_path: Path) -> tuple[str, SiteComplianceAdminService]:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'site-compliance.sqlite3'}"
    init_schema(database_url)
    settings = Settings(
        _env_file=None,
        database_url=database_url,
        plugin_observability_retention_days=180,
        audit_retention_days_default=90,
    )
    return database_url, SiteComplianceAdminService(database_url, settings)


def _publishable_payload(service: SiteComplianceAdminService) -> dict[str, object]:
    payload = deepcopy(service.get_workspace()["draft"]["payload"])
    payload["operator"]["entity_name"] = "示例运营主体"
    payload["operator"]["entity_type"] = "企业"
    payload["refund"]["processing_business_days"] = 7
    payload["review"]["operator_confirmed"] = True
    for item in payload["retention"]:
        item["confirmed"] = True
    return payload


def test_site_compliance_defaults_are_fact_derived_and_unpublished(tmp_path: Path) -> None:
    database_url, service = _build_service(tmp_path)

    workspace = service.get_workspace()
    retention = {
        item["record_id"]: item for item in workspace["draft"]["payload"]["retention"]
    }

    assert workspace["published"] is None
    assert workspace["draft"]["validation"]["ready_to_publish"] is False
    assert retention["ai_runtime_results"]["confirmed"] is True
    assert "7 天" in retention["ai_runtime_results"]["public_description"]
    assert "180 天" in retention["plugin_observability"]["public_description"]
    assert retention["audit_evidence"]["confirmed"] is False
    assert service.get_public_projection()["published"] is False

    dispose_engine(database_url)


def test_site_compliance_publishes_version_without_draft_or_secrets(tmp_path: Path) -> None:
    database_url, service = _build_service(tmp_path)
    payload = _publishable_payload(service)

    saved = service.save_draft(payload, actor_ref="test")
    assert saved["draft"]["validation"]["ready_to_publish"] is True

    result = service.publish(actor_ref="test")
    public = service.get_public_projection()

    assert result["published"]["version_number"] == 1
    assert public["published"] is True
    assert public["payload"]["operator"]["entity_name"] == "示例运营主体"
    assert "validation" not in public
    assert "review" not in public["payload"]
    assert "draft" not in public

    with get_session(database_url) as session:
        row = session.get(ServiceSetting, "site_compliance")
        assert row is not None
        assert row.secret_ciphertext_json == {}

    dispose_engine(database_url)


def test_site_compliance_rejects_secrets_and_requires_active_service_disclosure(
    tmp_path: Path,
) -> None:
    database_url, service = _build_service(tmp_path)
    with get_session(database_url) as session:
        session.add(
            ProviderConnection(
                connection_id="hosted_ai",
                display_name="托管 AI 服务",
                provider_type="openai_compatible",
                enabled=True,
                base_url="https://provider.example.test/v1",
                config_json={},
                secret_ciphertext="configured-in-test",
                status="ready",
                source_role="execution_source",
                metadata_json={},
            )
        )
        session.add(
            ProviderConnection(
                connection_id="local_ai",
                display_name="本机 AI 服务",
                provider_type="openai_compatible",
                enabled=True,
                base_url="http://host.docker.internal:11434/v1",
                config_json={},
                secret_ciphertext="configured-in-test",
                status="ready",
                source_role="execution_source",
                metadata_json={},
            )
        )
        session.commit()

    with pytest.raises(SiteComplianceAdminError) as secret_error:
        service.save_draft({"api_key": "must-not-be-stored"})
    assert secret_error.value.error_code == "site_compliance.secret_field_forbidden"

    payload = _publishable_payload(service)
    local_disclosure = next(
        item for item in payload["third_parties"] if item["service_id"] == "provider_local_ai"
    )
    assert local_disclosure["disclosed"] is False
    incomplete_result = service.save_draft(payload)
    incomplete_codes = {
        item["code"] for item in incomplete_result["draft"]["validation"]["blockers"]
    }
    assert "third_party_operator_required" in incomplete_codes
    assert "third_party_privacy_url_required" in incomplete_codes
    assert "third_party_processing_region_required" in incomplete_codes

    public_disclosure = next(
        item for item in payload["third_parties"] if item["service_id"] == "provider_hosted_ai"
    )
    public_disclosure["operator_name"] = "示例第三方主体"
    public_disclosure["privacy_url"] = "https://provider.example.test/privacy"
    public_disclosure["processing_region"] = "中国"
    complete_result = service.save_draft(payload)
    assert complete_result["draft"]["validation"]["ready_to_publish"] is True

    payload["third_parties"] = []
    result = service.save_draft(payload)
    blocker_codes = {
        item["code"] for item in result["draft"]["validation"]["blockers"]
    }
    assert "third_party_classification_required" in blocker_codes
    assert "retention_enforcement_confirmation_required" not in blocker_codes

    dispose_engine(database_url)
