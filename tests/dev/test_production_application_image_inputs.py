from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "production-application-image-inputs.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("production_application_image_inputs", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


image_inputs = _load_script()


def _write(root: Path, relative: str, content: str = "fixture\n") -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.fixture
def image_source(tmp_path: Path) -> Path:
    root = tmp_path / "source"
    root.mkdir()
    files = {
        "Dockerfile",
        ".dockerignore",
        "README.md",
        "alembic.ini",
        "pyproject.toml",
        "uv.lock",
        "app/main.py",
        "migrations/env.py",
        "deploy/wait-for-install.sh",
        "scripts/verify-production-python-lock.py",
        "scripts/live-site-addon-rollback.py",
        "scripts/live-site-runtime-execute-smoke.py",
        "scripts/live-site-runtime-smoke.py",
        "scripts/live-site-save-verify-handoff.py",
        "scripts/live-site-stage1.py",
        "scripts/live-site-trial-status.py",
        "scripts/production_performance_baseline.py",
        "scripts/runtime_hot_path_explain.py",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "frontend/Dockerfile",
        "frontend/package.json",
        "frontend/next-env.d.ts",
        "frontend/next.config.mjs",
        "frontend/postcss.config.mjs",
        "frontend/src/proxy.ts",
        "frontend/src/app/page.tsx",
        "frontend/tailwind.config.ts",
        "frontend/tsconfig.json",
        "deploy/unrelated-release-tool.sh",
    }
    for relative in files:
        _write(root, relative)
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=root, check=True)
    return root


def _by_key(payload: dict[str, object]) -> dict[str, dict[str, object]]:
    return {record["key"]: record for record in payload["images"]}


def test_fingerprints_change_only_for_owned_build_inputs(image_source: Path) -> None:
    before = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    _write(image_source, "deploy/unrelated-release-tool.sh", "changed\n")
    unrelated = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    assert _by_key(unrelated) == _by_key(before)

    _write(image_source, "scripts/runtime_hot_path_explain.py", "changed\n")
    runtime_script = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    assert _by_key(runtime_script)["api"]["fingerprint"] != _by_key(before)["api"]["fingerprint"]
    assert _by_key(runtime_script)["frontend"] == _by_key(before)["frontend"]

    _write(image_source, "app/main.py", "changed\n")
    backend = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    assert _by_key(backend)["api"]["fingerprint"] != _by_key(before)["api"]["fingerprint"]
    assert (
        _by_key(backend)["frontend"]["fingerprint"]
        == _by_key(before)["frontend"]["fingerprint"]
    )


def test_frontend_fingerprint_excludes_release_revision(image_source: Path) -> None:
    payload = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    frontend = _by_key(payload)["frontend"]

    assert frontend["build_parameters"] == {
        "platform": "linux/amd64",
        "package_extras": "",
    }
    assert all("revision" not in record["path"] for record in frontend["files"])
    assert image_inputs.validate_inputs(payload) == payload


def test_dockerignore_changes_both_fingerprints(image_source: Path) -> None:
    before = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    _write(image_source, ".dockerignore", "app/generated\nfrontend/src/generated\n")
    after = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )

    assert _by_key(before)["api"]["fingerprint"] != _by_key(after)["api"]["fingerprint"]
    assert (
        _by_key(before)["frontend"]["fingerprint"]
        != _by_key(after)["frontend"]["fingerprint"]
    )


def test_api_fingerprint_binds_platform_and_package_extras(image_source: Path) -> None:
    amd64 = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    arm64 = image_inputs.create_inputs(
        image_source,
        platform="linux/arm64",
        package_extras="[zilliz]",
    )
    no_extra = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="",
    )

    assert _by_key(amd64)["api"]["fingerprint"] != _by_key(arm64)["api"]["fingerprint"]
    assert _by_key(amd64)["api"]["fingerprint"] != _by_key(no_extra)["api"]["fingerprint"]


def test_fingerprint_binds_git_file_mode(image_source: Path) -> None:
    before = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    subprocess.run(
        ["git", "update-index", "--chmod=+x", "deploy/wait-for-install.sh"],
        cwd=image_source,
        check=True,
    )
    after = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )

    assert _by_key(before)["api"]["fingerprint"] != _by_key(after)["api"]["fingerprint"]
    wait_script = next(
        record
        for record in _by_key(after)["api"]["files"]
        if record["path"] == "deploy/wait-for-install.sh"
    )
    assert wait_script["git_mode"] == "100755"


def test_validator_rejects_tampered_fingerprint(image_source: Path) -> None:
    payload = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    payload["images"][0]["fingerprint"] = "0" * 64

    with pytest.raises(image_inputs.ImageInputError, match="fingerprint mismatch"):
        image_inputs.validate_inputs(payload)


def test_validator_rejects_non_string_paths(image_source: Path) -> None:
    payload = image_inputs.create_inputs(
        image_source,
        platform="linux/amd64",
        package_extras="[zilliz]",
    )
    payload["images"][0]["files"][0]["path"] = 7

    with pytest.raises(image_inputs.ImageInputError, match="path must be a string"):
        image_inputs.validate_inputs(payload)
