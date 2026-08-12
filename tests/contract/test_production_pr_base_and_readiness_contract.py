from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _event() -> dict[str, object]:
    repo = "npcink/npcink-ai-cloud"
    return {
        "pull_request": {
            "body": "Approved for production validation by operator.",
            "base": {"ref": "production", "repo": {"full_name": repo}},
            "head": {"ref": "master", "repo": {"full_name": repo}},
        }
    }


def test_production_pr_base_contract_accepts_master_same_repo() -> None:
    module = _load("production_pr_base", ROOT / "scripts/check-production-pr-base.py")
    assert module.validate(_event(), repository="npcink/npcink-ai-cloud")["status"] == "passed"


@pytest.mark.parametrize(
    "mutator, message",
    [
        (lambda event: event["pull_request"]["base"].update(ref="master"), "target production"),
        (
            lambda event: event["pull_request"]["head"].update(ref="feature/foo"),
            "master or release-fix",
        ),
        (
            lambda event: event["pull_request"]["head"]["repo"].update(full_name="attacker/repo"),
            "head repository",
        ),
        (
            lambda event: event["pull_request"].update(body="## Scope\nmissing approval"),
            "operator approval",
        ),
    ],
)
def test_production_pr_base_contract_fails_closed(mutator, message: str) -> None:
    module = _load("production_pr_base", ROOT / "scripts/check-production-pr-base.py")
    event = _event()
    mutator(event)
    with pytest.raises(module.ProductionPrBaseError, match=message):
        module.validate(event, repository="npcink/npcink-ai-cloud")


def test_readiness_summary_is_read_only_and_blocks_unknown(tmp_path: Path) -> None:
    module = _load("readiness_summary", ROOT / "scripts/release-readiness-summary.py")
    passed = tmp_path / "passed.json"
    passed.write_text(
        '{"contract_version":"npcink.production-authoritative-cve-precheck.v1",'
        '"status":"passed","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",'
        '"duration_seconds":2,"checked_at_utc":"2026-08-12T00:00:00Z",'
        '"lock":"deploy/image-lock/production-images.json",'
        '"authoritative_file":"deploy/image-lock/authoritative-not-affected.json",'
        '"entries":[{"vulnerability_id":"CVE-2026-11940"}]}\n'
    )
    blocked = tmp_path / "blocked.json"
    blocked.write_text(
        '{"schema":"npcink.production_release_preflight.v1",'
        '"release_preflight":"blocked","production_sha":'
        '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","preflight_mode":"dry-run",'
        '"repository":"npcink/npcink-ai-cloud","cloud_ci_run_id":1,"codeql_run_id":2,'
        '"release_action":"runtime","plan_artifact_id":3,"deploy_secrets_ready":true,'
        '"formal_smoke_secrets_ready":false}\n'
    )
    result = module.summarize([passed, blocked])
    assert result["schema"] == "npcink.release_readiness_summary.v1"
    assert result["status"] == "blocked"
    assert result["mode"] == "read-only-summary"


def test_readiness_summary_rejects_unbound_passed_json(tmp_path: Path) -> None:
    module = _load("readiness_summary", ROOT / "scripts/release-readiness-summary.py")
    evidence = tmp_path / "fake.json"
    evidence.write_text('{"status":"passed"}\n')
    with pytest.raises(ValueError, match="unsupported or missing evidence schema"):
        module.summarize([evidence])


def test_readiness_summary_rejects_mixed_revisions(tmp_path: Path) -> None:
    module = _load("readiness_summary", ROOT / "scripts/release-readiness-summary.py")
    first = tmp_path / "first.json"
    first.write_text(
        '{"contract_version":"npcink.production-authoritative-cve-precheck.v1",'
        '"status":"passed","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",'
        '"checked_at_utc":"2026-08-12T00:00:00Z",'
        '"lock":"deploy/image-lock/production-images.json",'
        '"authoritative_file":"deploy/image-lock/authoritative-not-affected.json",'
        '"entries":[{"vulnerability_id":"CVE-2026-11940"}]}\n'
    )
    second = tmp_path / "second.json"
    second.write_text(
        '{"schema":"npcink.production_release_preflight.v1",'
        '"release_preflight":"ready","production_sha":'
        '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","preflight_mode":"dry-run",'
        '"repository":"npcink/npcink-ai-cloud","cloud_ci_run_id":1,"codeql_run_id":2,'
        '"release_action":"runtime","plan_artifact_id":3,"deploy_secrets_ready":true,'
        '"formal_smoke_secrets_ready":false}\n'
    )
    with pytest.raises(ValueError, match="revisions do not match"):
        module.summarize([first, second])
