from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "resolve-production-release-action.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("resolve_production_release_action", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


resolver = _load_script()

SHA = "1" * 40
TREE = "2" * 40
REPOSITORY = "npcink/npcink-ai-cloud"


def _plan(changed_files: list[str]) -> dict[str, object]:
    module = resolver._load_release_plan_module()
    lane, flags, normalized = module.classify_release(changed_files)
    return {
        "schema": module.SCHEMA,
        "repository": REPOSITORY,
        "base_sha": "0" * 40,
        "head_sha": SHA,
        "head_tree": TREE,
        "changed_files": list(normalized),
        "lane": lane,
        "application_image_inputs": {
            "schema": "npcink.production_application_image_inputs.v1",
            "images": [
                {"key": "api", "fingerprint": "a" * 64},
                {"key": "frontend", "fingerprint": "b" * 64},
            ],
        },
        **flags,
    }


@pytest.mark.parametrize(
    ("changed_files", "expected"),
    [
        (["docs/README.md"], ("no_deploy", "no_deploy", "none")),
        (["site/terms/index.html"], ("static", "static", "static")),
        (["app/api/main.py"], ("backend", "runtime", "runtime")),
        (["frontend/src/app/page.tsx"], ("frontend", "runtime", "runtime")),
        (["migrations/versions/revision.py"], ("migration", "runtime", "runtime")),
    ],
)
def test_exact_plan_resolves_bounded_action(
    changed_files: list[str], expected: tuple[str, str, str]
) -> None:
    resolution = resolver.resolve_plan(
        _plan(changed_files),
        expected_repository=REPOSITORY,
        expected_head_sha=SHA,
        expected_head_tree=TREE,
    )

    assert (resolution.lane, resolution.action, resolution.health_profile) == expected


def test_inconsistent_lane_fails_before_action_resolution() -> None:
    payload = _plan(["site/terms/index.html"])
    payload["lane"] = "no_deploy"

    with pytest.raises(resolver.ResolutionError, match="lane does not match"):
        resolver.resolve_plan(
            payload,
            expected_repository=REPOSITORY,
            expected_head_sha=SHA,
            expected_head_tree=TREE,
        )


def test_inconsistent_flag_fails_before_action_resolution() -> None:
    payload = _plan(["docs/README.md"])
    payload["deployment_required"] = True

    with pytest.raises(resolver.ResolutionError, match="flag is inconsistent"):
        resolver.resolve_plan(
            payload,
            expected_repository=REPOSITORY,
            expected_head_sha=SHA,
            expected_head_tree=TREE,
        )


def test_wrong_exact_tree_fails_before_action_resolution() -> None:
    with pytest.raises(resolver.ResolutionError, match="head tree does not match"):
        resolver.resolve_plan(
            _plan(["app/api/main.py"]),
            expected_repository=REPOSITORY,
            expected_head_sha=SHA,
            expected_head_tree="3" * 40,
        )


def test_application_image_fingerprint_is_required_even_for_no_deploy() -> None:
    payload = _plan(["docs/README.md"])
    payload["application_image_inputs"]["images"][0]["fingerprint"] = "invalid"  # type: ignore[index]

    with pytest.raises(resolver.ResolutionError, match="fingerprint is invalid"):
        resolver.resolve_plan(
            payload,
            expected_repository=REPOSITORY,
            expected_head_sha=SHA,
            expected_head_tree=TREE,
        )


def test_duplicate_application_image_role_fails_before_action_resolution() -> None:
    payload = _plan(["site/terms/index.html"])
    images = payload["application_image_inputs"]["images"]  # type: ignore[index]
    images.append(dict(images[0]))  # type: ignore[union-attr]

    with pytest.raises(resolver.ResolutionError, match="roles are invalid"):
        resolver.resolve_plan(
            payload,
            expected_repository=REPOSITORY,
            expected_head_sha=SHA,
            expected_head_tree=TREE,
        )
