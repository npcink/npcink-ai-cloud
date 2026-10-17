from __future__ import annotations

import importlib.util
import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "deployed_baseline", ROOT / "scripts/resolve-production-deployed-baseline.py"
)
assert SPEC is not None and SPEC.loader is not None
BASELINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASELINE)
REPOSITORY = "npcink/npcink-ai-cloud"
REVISION = "a" * 40


def _receipt(**overrides):
    return {
        "schema": "npcink.release_timing.v1",
        "kind": "production_deploy_phases",
        "repository": REPOSITORY,
        "head_sha": REVISION,
        "workflow_run_id": "10",
        "release_action": "runtime",
        "status": "success",
        "deploy_exit_status": 0,
        "phases": [{"label": "remote deploy sequence", "conclusion": "success", "exit_status": 0}],
        **overrides,
    }


def _api(receipt=None, *, missing=False):
    def request(path):
        if "/workflows/ci.yml/" in path:
            return json.dumps(
                {
                    "workflow_runs": [
                        {
                            "id": 12,
                            "head_sha": "b" * 40,
                            "head_branch": "production",
                            "event": "push",
                            "conclusion": "success",
                            "path": ".github/workflows/ci.yml",
                        }
                    ]
                }
            ).encode()
        if "/workflows/" in path:
            return json.dumps(
                {
                    "workflow_runs": [
                        {
                            "id": run_id,
                            "head_sha": revision,
                            "updated_at": date,
                            "head_branch": "production",
                            "event": "workflow_dispatch",
                            "conclusion": "success",
                            "path": ".github/workflows/deploy-production.yml",
                        }
                        for run_id, revision, date in [
                            (11, "b" * 40, "2026-10-17"),
                            (10, REVISION, "2026-10-16"),
                        ]
                    ]
                }
            ).encode()
        if "/runs/" in path:
            artifacts = (
                []
                if missing or "/11/" in path
                else [
                    {
                        "id": 20,
                        "name": f"production-deploy-timing-10-{REVISION}",
                        "expired": False,
                        "size_in_bytes": 1000,
                    }
                ]
            )
            if "/12/" in path and not missing:
                artifacts = [
                    {
                        "id": 21,
                        "name": "production-release-plan-" + "b" * 40,
                        "expired": False,
                        "size_in_bytes": 1000,
                    }
                ]
            return json.dumps({"artifacts": artifacts}).encode()
        if path.endswith("/artifacts/21/zip"):
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr(
                    "production-release-plan.json",
                    json.dumps(
                        {
                            "schema": "npcink.production_release_plan.v2",
                            "repository": REPOSITORY,
                            "head_sha": "b" * 40,
                            "lane": "no_deploy",
                            "backend_image_required": False,
                            "frontend_image_required": False,
                            "migration_required": False,
                            "runtime_config_required": False,
                        }
                    ),
                )
            return archive.getvalue()
        assert path.endswith("/artifacts/20/zip")
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr(
                "production-deploy-phase-timing.json", json.dumps(receipt or _receipt())
            )
        return archive.getvalue()

    return request


def test_promotions_and_no_runtime_dispatch_do_not_advance_deployed_baseline():
    assert BASELINE.resolve_baseline(REPOSITORY, _api()) == REVISION


@pytest.mark.parametrize(
    "override",
    [
        {"head_sha": "c" * 40},
        {"repository": "other/repo"},
        {"workflow_run_id": "11"},
        {"release_action": "no_deploy"},
        {"status": "failure"},
        {"deploy_exit_status": 1},
        {"phases": []},
    ],
)
def test_receipt_must_bind_successful_actual_runtime_deployment(override):
    with pytest.raises(ValueError):
        BASELINE.resolve_baseline(REPOSITORY, _api(_receipt(**override)))


def test_missing_retained_evidence_fails_closed():
    with pytest.raises(ValueError, match="no retained"):
        BASELINE.resolve_baseline(REPOSITORY, _api(missing=True))


@pytest.mark.parametrize("lane", ["full", "backend", "frontend", "migration", "config"])
def test_missing_runtime_receipt_cannot_silently_select_an_older_deployment(lane):
    api = _api()

    def request(path):
        payload = api(path)
        if path.endswith("/artifacts/21/zip"):
            archive = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(payload)) as original:
                plan = json.loads(original.read("production-release-plan.json"))
            plan["lane"] = lane
            with zipfile.ZipFile(archive, "w") as replacement:
                replacement.writestr("production-release-plan.json", json.dumps(plan))
            return archive.getvalue()
        return payload

    with pytest.raises(ValueError, match="no retained runtime receipt"):
        BASELINE.resolve_baseline(REPOSITORY, request)


def _selector(plan, previous, tmp_path):
    source = (ROOT / "deploy/deploy-to-ssh-host.sh").read_text()
    marker = 'RELEASE_PLAN_EXECUTION="$('
    block = source.split(marker, 1)[1].split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
    path = tmp_path / "plan.json"
    path.write_text(json.dumps(plan))
    return subprocess.run(
        [sys.executable, "-", str(path), str(previous) if previous else ""],
        input=block,
        text=True,
        capture_output=True,
        check=False,
    )


def _plan(lane):
    return {
        "schema": "npcink.production_release_plan.v2",
        "base_sha": REVISION,
        "lane": lane,
        "deployment_required": True,
        "backend_image_required": lane in {"backend", "migration", "full"},
        "frontend_image_required": lane in {"frontend", "full"},
        "migration_required": lane == "migration",
        "runtime_config_required": False,
        "static_payload_required": False,
    }


@pytest.mark.parametrize("lane", ["backend", "migration", "frontend"])
@pytest.mark.parametrize("installed", [REVISION, "b" * 40, None])
def test_partial_cutover_requires_actual_installed_base(tmp_path, lane, installed):
    previous = tmp_path / "release-current"
    previous.mkdir()
    if installed:
        (previous / "release-bundle-manifest.json").write_text(
            json.dumps({"source": {"revision": installed}})
        )
    result = _selector(_plan(lane), previous, tmp_path)
    if installed == REVISION:
        assert result.returncode == 0, result.stderr
        assert result.stdout.startswith(lane + "\t")
    else:
        assert result.returncode != 0
        assert "Partial deployment baseline mismatch" in result.stderr
        assert result.stdout == ""


def test_full_release_does_not_preserve_stale_components(tmp_path):
    result = _selector(_plan("full"), None, tmp_path)
    assert result.returncode == 0
    assert result.stdout.strip() == "full\t1\t1\t0\t0"


def test_multiple_undeployed_promotions_include_frontend_in_cumulative_diff(tmp_path):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)

    def git(*args):
        return subprocess.check_output(["git", "-C", str(tmp_path), *args], text=True).strip()

    git("config", "user.email", "fixture@example.invalid")
    git("config", "user.name", "Fixture")
    (tmp_path / "README.md").write_text("installed")
    git("add", "README.md")
    git("commit", "-qm", "installed")
    installed = git("rev-parse", "HEAD")
    (tmp_path / "frontend").mkdir()
    (tmp_path / "frontend/page.tsx").write_text("pending UI")
    git("add", "frontend/page.tsx")
    git("commit", "-qm", "promoted but not deployed")
    promoted = git("rev-parse", "HEAD")
    (tmp_path / "app").mkdir()
    (tmp_path / "app/worker.py").write_text("Milvus fix")
    git("add", "app/worker.py")
    git("commit", "-qm", "worker fix")
    assert git("diff", "--name-only", promoted, "HEAD") == "app/worker.py"
    assert git("diff", "--name-only", installed, "HEAD").splitlines() == [
        "app/worker.py",
        "frontend/page.tsx",
    ]
