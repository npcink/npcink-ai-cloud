from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_runtime_composes_inject_deployment_identity_without_build_args() -> None:
    for compose_name in (
        "docker-compose.prod.yml",
        "docker-compose.runtime.yml",
        "docker-compose.m4-preview.yml",
    ):
        compose = (ROOT / compose_name).read_text(encoding="utf-8")
        assert "NPCINK_CLOUD_DEPLOYMENT_RELEASE:" in compose
        assert "NPCINK_CLOUD_DEPLOYMENT_SOURCE_REVISION:" in compose
        assert "NPCINK_CLOUD_DEPLOYMENT_SOURCE_DIRTY:" in compose
        assert "NPCINK_CLOUD_DEPLOYMENT_CREATED_AT:" in compose

    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    frontend_dockerfile = (ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")
    for source in (dockerfile, frontend_dockerfile):
        assert "NPCINK_CLOUD_DEPLOYMENT_SOURCE_REVISION" not in source
        assert "NPCINK_CLOUD_DEPLOYMENT_CREATED_AT" not in source


def test_release_and_m4_lanes_derive_identity_from_the_active_source_evidence() -> None:
    remote_loader = (ROOT / "deploy" / "remote-load-and-up.sh").read_text(encoding="utf-8")
    assert 'manifest.get("created_at_utc")' in remote_loader
    assert '(manifest.get("source") or {}).get("revision")' in remote_loader
    assert (
        "NPCINK_CLOUD_FRONTEND_REVISION=\"${NPCINK_CLOUD_DEPLOYMENT_SOURCE_REVISION}\""
        in remote_loader
    )

    m4_preview = (ROOT / "scripts" / "m4-preview.sh").read_text(encoding="utf-8")
    assert 'NPCINK_CLOUD_DEPLOYMENT_SOURCE_REVISION="${source_revision}"' in m4_preview
    assert 'NPCINK_CLOUD_DEPLOYMENT_SOURCE_DIRTY="${source_dirty}"' in m4_preview
    assert 'NPCINK_CLOUD_DEPLOYMENT_RELEASE="m4-preview"' in m4_preview
