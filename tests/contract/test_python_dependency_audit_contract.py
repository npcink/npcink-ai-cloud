from __future__ import annotations

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _locked_project() -> dict[str, object]:
    lock = tomllib.loads((ROOT / "uv.lock").read_text())
    return next(
        package
        for package in lock["package"]
        if package["name"] == "npcink-ai-cloud"
    )


def test_pillow_security_floor_and_lock_are_exact() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    lock = tomllib.loads((ROOT / "uv.lock").read_text())
    project = _locked_project()

    assert "Pillow>=12.3,<13.0" in pyproject["project"]["dependencies"]
    assert [
        package["version"]
        for package in lock["package"]
        if package["name"] == "pillow"
    ] == ["12.3.0"]
    assert {
        requirement["specifier"]
        for requirement in project["metadata"]["requires-dist"]
        if requirement["name"] == "pillow"
    } == {">=12.3,<13.0"}


def test_zilliz_dependency_remains_optional_in_lock() -> None:
    project = _locked_project()

    assert "pymilvus" not in {
        dependency["name"] for dependency in project["dependencies"]
    }
    assert project["optional-dependencies"]["zilliz"] == [{"name": "pymilvus"}]
    assert {
        requirement.get("marker")
        for requirement in project["metadata"]["requires-dist"]
        if requirement["name"] == "pymilvus"
    } == {"extra == 'zilliz'"}
    assert set(project["metadata"]["provides-extras"]) == {"dev", "zilliz"}


def test_dependency_audit_is_locked_hashed_and_covers_production_variants() -> None:
    script = (ROOT / "scripts" / "check-python-dependency-audit.sh").read_text()
    package_scripts = json.loads((ROOT / "package.json").read_text())["scripts"]

    assert 'PIP_AUDIT_VERSION="2.10.1"' in script
    assert '"${UV_BIN}" lock --check' in script
    assert "--locked" in script
    assert "--no-emit-project" in script
    assert "--disable-pip" in script
    assert "--require-hashes" in script
    assert "audit_export default" in script
    assert "audit_export zilliz --extra zilliz" in script
    assert package_scripts["check:python-dependency-audit"] == (
        "bash scripts/check-python-dependency-audit.sh"
    )


def test_ci_blocks_backend_and_production_on_security_gates() -> None:
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text()

    assert "python-dependency-audit:" in workflow
    assert "run: bash scripts/check-python-dependency-audit.sh" in workflow
    assert "PYTHON_DEPENDENCY_AUDIT_RESULT" in workflow
    assert "python dependency audit did not pass" in workflow
    assert "needs['secret-scan'].result == 'success'" in workflow


def test_private_key_fixture_ignore_is_one_exact_fingerprint() -> None:
    ignore_lines = [
        line.strip()
        for line in (ROOT / ".gitleaksignore").read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert ignore_lines == [
        "86ac095d3fd9b4d8fa9bcfad902ae5ed8c699b86:"
        "tests/domain/test_payment_gateways.py:private-key:173"
    ]


def test_production_image_smoke_requires_supported_pillow() -> None:
    script = (ROOT / "scripts" / "production-python-extras-smoke.sh").read_text()

    assert script.count("docker run --rm -i") == 2
    assert script.count('"expected_pillow_version": ">=12.3,<13"') == 2
    assert script.count('"pillow_version_supported": pillow_version_supported') == 2
    assert script.count("or not pillow_version_supported") == 2
