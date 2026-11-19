from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from textwrap import dedent

import pytest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/ci.yml"


def _scan_scope(*paths: str) -> str:
    return subprocess.check_output(
        ["bash", "scripts/classify-ci-changes.sh", "--production-image-scan", *paths],
        cwd=ROOT,
        text=True,
    ).strip()


@pytest.mark.parametrize(
    "image_input",
    [
        "Dockerfile",
        ".dockerignore",
        "frontend/Dockerfile",
        "uv.lock",
        "pnpm-lock.yaml",
        "frontend/package.json",
        "frontend/src/example/package.json",
        "docker-compose.prod.yml",
        "deploy/nginx.prod.conf",
        "deploy/image-lock/cve-allowlist.json",
        ".github/workflows/ci.yml",
        "scripts/scan-production-images.sh",
        "new-build-input",
    ],
)
def test_scan_scope_is_strict_for_image_supply_changes(image_input: str) -> None:
    assert _scan_scope("app/core/config.py", image_input) == "true"


def test_scan_scope_defers_only_for_recognized_paths() -> None:
    paths = ("app/core/config.py", "frontend/src/app/page.tsx", "docs/README.md")
    assert _scan_scope(*paths) == "false"
    assert _scan_scope() == "true"


@pytest.mark.parametrize(
    ("base", "path", "build_error", "scan_required"),
    [
        ("master", "app/core/config.py", False, False),
        ("master", "app/core/config.py", True, False),
        ("master", "frontend/package.json", False, True),
        ("master", "Dockerfile", False, True),
        ("production", "app/core/config.py", False, True),
        ("master", "", False, True),
    ],
)
def test_ci_image_smoke_only_defers_scan_for_ordinary_master_changes(
    tmp_path: Path, base: str, path: str, build_error: bool, scan_required: bool
) -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    job = workflow.split("\n  production-python-image-smoke:\n", 1)[1]
    job = job.split("\n  backend-targeted:", 1)[0]
    assert "needs.classify.outputs.production_image_scan_required != 'false'" in job
    assert '[ "${PRODUCTION_IMAGE_SCAN_REQUIRED}" != "false" ]' in workflow
    run = dedent(job.split("        run: |\n", 1)[1])

    scripts = tmp_path / "scripts"
    scripts.mkdir()
    smoke = ROOT / "scripts" / "production-python-extras-smoke.sh"
    shutil.copyfile(smoke, scripts / smoke.name)
    # Let the real workflow shell step exercise both modes without a daemon.
    (scripts / "scan-production-images.sh").write_text('echo "scanner invoked"\nexit 19\n')
    docker = tmp_path / "docker"
    docker.write_text(
        '#!/bin/bash\ncase "$1" in\n'
        'image) echo app ;;\nbuild) [ "$BUILD_ERROR" = 0 ] || exit 18; echo "built: $*" ;;\n'
        'run) echo "ran: $*" ;;\nesac\n'
    )
    docker.chmod(0o755)
    uvx = tmp_path / "uvx"
    uvx.write_text(
        '#!/bin/bash\nif [ "$4" = "--version" ]; then echo "uv 0.12.10"; exit; fi\n'
        'while [ "$1" != "--output-file" ]; do shift; done\ntouch "$2"\n'
    )
    uvx.chmod(0o755)
    result = subprocess.run(
        ["bash", "-c", run],
        cwd=tmp_path,
        env={
            **os.environ,
            "PATH": f"{tmp_path}:{os.environ['PATH']}",
            "UVX_BIN": str(uvx),
            "PR_BASE_REF": base,
            "PRODUCTION_IMAGE_SCAN_REQUIRED": _scan_scope(path) if path else "",
            "NPCINK_CLOUD_PROD_EXTRAS_SKIP_ZILLIZ": "0",
            "BUILD_ERROR": str(int(build_error)),
        },
        text=True,
        capture_output=True,
        timeout=15,
    )
    if build_error:
        assert result.returncode == 18, result.stderr
        assert "scanner invoked" not in result.stdout
        return
    assert result.returncode == (19 if scan_required else 0), result.stderr
    assert ("scanner invoked" in result.stdout) is scan_required
    assert ("no vulnerability scan evidence" in result.stdout) is not scan_required
    assert result.stdout.count("built:") == 2
    assert result.stdout.count("--import-app") == 2
