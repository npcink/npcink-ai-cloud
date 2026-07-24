from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]


def _load_module() -> ModuleType:
    path = ROOT / "scripts" / "check-python-cve-upstream.py"
    spec = importlib.util.spec_from_file_location("python_cve_upstream_watch", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_waiting_state_does_not_claim_a_fix() -> None:
    module = _load_module()

    status, action = module.evaluate_status(
        pinned_digest="sha256:" + "1" * 64,
        registry_digest="sha256:" + "1" * 64,
        python_version="3.14.6",
        today=date(2026, 7, 24),
    )

    assert status == "waiting_for_candidate"
    assert "do not claim" in action


def test_digest_or_version_change_requires_scan_review() -> None:
    module = _load_module()

    digest_status, digest_action = module.evaluate_status(
        pinned_digest="sha256:" + "1" * 64,
        registry_digest="sha256:" + "2" * 64,
        python_version="3.14.6",
        today=date(2026, 7, 24),
    )
    version_status, version_action = module.evaluate_status(
        pinned_digest="sha256:" + "1" * 64,
        registry_digest="sha256:" + "1" * 64,
        python_version="3.14.7",
        today=date(2026, 7, 24),
    )

    assert digest_status == version_status == "candidate_changed"
    assert "fresh image scan" in digest_action
    assert "fresh image scan" in version_action


def test_unchanged_candidate_fails_after_exception_expiry() -> None:
    module = _load_module()

    status, action = module.evaluate_status(
        pinned_digest="sha256:" + "1" * 64,
        registry_digest="sha256:" + "1" * 64,
        python_version="3.14.6",
        today=date(2026, 8, 6),
    )

    assert status == "exception_expired"
    assert "Stop controlled production validation" in action
