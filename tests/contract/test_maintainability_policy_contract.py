from __future__ import annotations

import importlib.util
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check-maintainability-policy.py"

requires_repository_git = pytest.mark.skipif(
    not (ROOT / ".git").exists(),
    reason="maintainability policy contracts require repository Git metadata",
)


def _load_script():
    spec = importlib.util.spec_from_file_location("maintainability_policy", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _base_ref_is_resolvable(base_ref: str) -> bool:
    """Report whether this checkout can resolve the policy comparison base ref.

    The policy compares the tree against a base ref with Git, so it only carries
    meaning where that Git context exists. A container smoke copies the source
    into an image without repository metadata, and a host without a usable Git
    executable cannot answer the question either. In both cases the contract is
    skipped rather than failed, because a Git-level error says nothing about the
    policy itself; CI keeps a real repository and keeps enforcing the check.
    """
    try:
        subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "--verify", "--quiet", f"{base_ref}^{{commit}}"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return False
    return True


@requires_repository_git
def test_current_maintainability_policy_passes() -> None:
    module = _load_script()
    if not _base_ref_is_resolvable("origin/master"):
        pytest.skip("origin/master is not resolvable in this checkout")
    assert module.check(ROOT, "origin/master") == []


def test_service_route_family_extractor_uses_top_level_path_segment(tmp_path: Path) -> None:
    module = _load_script()
    assert module._route_family("/admin/accounts/{account_id}") == "admin"
    assert module._route_family("/sites/{site_id}/keys") == "sites"
    assert module._route_family("/") is None
    service = tmp_path / "service.py"
    service.write_text(
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n"
        "@router.get(path='/runtime/health')\n"
        "def health(): pass\n",
        encoding="utf-8",
    )
    assert module._service_route_families(service) == {"runtime"}


def test_behavior_test_change_is_distinct_from_source_contract_change() -> None:
    module = _load_script()
    assert module._has_behavior_test_change([("M", "tests/api/test_example.py")])
    assert module._has_behavior_test_change([("M", "frontend/tests/vitest/example.test.ts")])
    assert not module._has_behavior_test_change([("M", "tests/contract/test_example.py")])
    assert not module._has_behavior_test_change([("D", "tests/api/test_example.py")])
