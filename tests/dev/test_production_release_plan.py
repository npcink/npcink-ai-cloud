from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "production-release-plan.py"
BASE_SHA = "1" * 40
HEAD_SHA = "2" * 40
TREE_SHA = "3" * 40


def _load_script():
    spec = importlib.util.spec_from_file_location("production_release_plan", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["production_release_plan"] = module
    spec.loader.exec_module(module)
    return module


production_release_plan = _load_script()


def _plan(*paths: str) -> dict[str, object]:
    return production_release_plan.create_plan(
        repository="npcink/npcink-ai-cloud",
        base_sha=BASE_SHA,
        head_sha=HEAD_SHA,
        head_tree=TREE_SHA,
        changed_files=paths,
    )


@pytest.mark.parametrize(
    ("paths", "lane", "expected"),
    [
        (
            (
                "README.md",
                "docs/release.md",
                "tests/dev/test_x.py",
                "frontend/tests/release.test.tsx",
                "deploy/OPS_PLAYBOOK.md",
            ),
            "no_deploy",
            {},
        ),
        (("site/terms/index.html",), "static", {"static_payload_required": True}),
        (("frontend/src/app/page.tsx",), "frontend", {"frontend_image_required": True}),
        (("app/main.py",), "backend", {"backend_image_required": True}),
        (
            ("migrations/versions/20260810_change.py",),
            "migration",
            {"backend_image_required": True, "migration_required": True},
        ),
        (
            ("docker-compose.runtime.yml",),
            "config",
            {"runtime_config_required": True},
        ),
    ],
)
def test_release_plan_selects_known_lane(
    paths: tuple[str, ...], lane: str, expected: dict[str, bool]
) -> None:
    plan = _plan(*paths)

    assert plan["lane"] == lane
    expected_flags = {
        "deployment_required": lane != "no_deploy",
        "backend_image_required": False,
        "frontend_image_required": False,
        "migration_required": False,
        "runtime_config_required": False,
        "static_payload_required": False,
        **expected,
    }
    for field, value in expected_flags.items():
        assert plan[field] is value


@pytest.mark.parametrize(
    "paths",
    [
        (),
        ("uv.lock",),
        ("Dockerfile",),
        ("frontend/Dockerfile",),
        ("deploy/image-lock/production-images.json",),
        ("deploy/remote-load-and-up.sh", "app/main.py"),
        ("app/main.py", "frontend/src/app/page.tsx"),
    ],
)
def test_release_plan_fails_closed_to_full(paths: tuple[str, ...]) -> None:
    plan = _plan(*paths)

    assert plan["lane"] == "full"
    assert plan["deployment_required"] is True
    assert plan["backend_image_required"] is True
    assert plan["frontend_image_required"] is True


def test_release_plan_keeps_exact_revision_and_sorted_unique_paths() -> None:
    plan = _plan("app/z.py", "docs/readme.md", "app/a.py", "app/z.py")

    assert plan["schema"] == "npcink.production_release_plan.v2"
    assert [record["key"] for record in plan["application_image_inputs"]["images"]] == [
        "api",
        "frontend",
    ]
    assert plan["repository"] == "npcink/npcink-ai-cloud"
    assert plan["base_sha"] == BASE_SHA
    assert plan["head_sha"] == HEAD_SHA
    assert plan["head_tree"] == TREE_SHA
    assert plan["changed_files"] == ["app/a.py", "app/z.py", "docs/readme.md"]


@pytest.mark.parametrize("path", ["/tmp/file", "../file", "app\\main.py", ""])
def test_release_plan_rejects_untrusted_paths(path: str) -> None:
    with pytest.raises(
        production_release_plan.ReleasePlanError,
        match="repository-relative",
    ):
        _plan(path)


def test_cli_writes_deterministic_receipt(tmp_path: Path) -> None:
    output = tmp_path / "production-release-plan.json"
    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--repository",
            "npcink/npcink-ai-cloud",
            "--base-sha",
            BASE_SHA,
            "--head-sha",
            HEAD_SHA,
            "--head-tree",
            TREE_SHA,
            "--output",
            str(output),
            "app/main.py",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )

    assert completed.stdout == "[ok] production release plan created\n"
    assert json.loads(output.read_text(encoding="utf-8"))["lane"] == "backend"
