from __future__ import annotations

from app.ops.baseline_status import (
    evaluate_remote_baseline_status,
    load_remote_baseline_status,
)
from app.ops.baseline_status import main as baseline_status_main
from app.ops.bootstrap_portal_site import bootstrap_portal_site
from app.ops.bootstrap_portal_site import main as bootstrap_portal_site_main
from app.ops.editor_assist_quality_status import (
    build_payload as build_editor_assist_quality_payload,
)
from app.ops.editor_assist_quality_status import (
    main as editor_assist_quality_status_main,
)
from app.ops.feedback_status import build_payload as build_feedback_status_payload
from app.ops.feedback_status import main as feedback_status_main
from app.ops.seed_runtime import main as seed_runtime_main
from app.ops.seed_runtime import seed_site_auth


def test_baseline_status_cli_public_entries() -> None:
    assert callable(baseline_status_main)
    assert callable(evaluate_remote_baseline_status)
    assert callable(load_remote_baseline_status)


def test_feedback_status_cli_public_entries() -> None:
    assert callable(feedback_status_main)
    assert callable(build_feedback_status_payload)


def test_bootstrap_portal_site_cli_public_entries() -> None:
    assert callable(bootstrap_portal_site_main)
    assert callable(bootstrap_portal_site)


def test_seed_runtime_cli_public_entries() -> None:
    assert callable(seed_runtime_main)
    assert callable(seed_site_auth)


def test_editor_assist_quality_status_cli_public_entries() -> None:
    assert callable(editor_assist_quality_status_main)
    assert callable(build_editor_assist_quality_payload)
