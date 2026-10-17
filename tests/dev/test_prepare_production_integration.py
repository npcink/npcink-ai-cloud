from __future__ import annotations

import importlib.util
import subprocess
from pathlib import Path
from types import ModuleType

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / ".github/scripts/prepare-production-integration.py"


@pytest.fixture
def helper() -> ModuleType:
    spec = importlib.util.spec_from_file_location("prepare_production_integration", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


@pytest.fixture
def history(tmp_path: Path) -> tuple[Path, dict[str, object]]:
    root = tmp_path / "repo"
    root.mkdir()
    git(root, "init", "-b", "master")
    git(root, "config", "user.name", "Test")
    git(root, "config", "user.email", "test@example.invalid")
    (root / "app.txt").write_text("original\n")
    (root / "protection.txt").write_text("protected\n")
    git(root, "add", "app.txt", "protection.txt")
    git(root, "commit", "-qm", "initial")
    initial = git(root, "rev-parse", "HEAD")
    (root / "app.txt").write_text("reviewed old release\n")
    git(root, "commit", "-qam", "reviewed baseline")
    baseline = git(root, "rev-parse", "HEAD")
    # A production squash has the same tree, but not the master ancestry.
    production = git(root, "commit-tree", f"{baseline}^{{tree}}", "-p", initial, "-m", "release")
    (root / "app.txt").write_text("reviewed fix\n")
    git(root, "commit", "-qam", "reviewed fix")
    source = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/production", production)
    git(root, "update-ref", "refs/remotes/origin/master", source)
    paths = tmp_path / "paths.txt"
    paths.write_text("app.txt\n")
    return root, {
        "production": production,
        "source": source,
        "equivalent_master": baseline,
        "paths_file": paths,
        "branch": "release-fix/test-reviewed-tree",
    }


def test_conflicting_history_becomes_exact_tree_without_changing_existing_work(
    helper: ModuleType,
    history: tuple[Path, dict[str, object]],
) -> None:
    root, inputs = history
    conflict = subprocess.run(
        ["git", "merge-tree", "--write-tree", str(inputs["production"]), str(inputs["source"])],
        cwd=root,
        capture_output=True,
    )
    assert conflict.returncode == 1
    (root / "app.txt").write_text("another session's uncommitted work\n")
    git(root, "add", "app.txt")
    (root / "app.txt").write_text("another session's later unstaged work\n")
    (root / "untracked.txt").write_text("leave alone\n")
    before = git(root, "status", "--porcelain")
    index_before = git(root, "diff", "--cached", "--binary")
    working_before = git(root, "diff", "--binary")
    refs = git(root, "for-each-ref", "--format=%(refname) %(objectname)")
    plan = helper.prepare(root, **inputs)
    assert plan["state"] == "planned"
    assert git(root, "for-each-ref", "--format=%(refname) %(objectname)") == refs
    receipt = helper.prepare(root, **inputs, apply=True)
    candidate = receipt["candidate_sha"]
    assert git(root, "rev-parse", f"{candidate}^{{tree}}") == plan["reviewed_master_tree"]
    assert git(root, "rev-parse", f"{candidate}^1") == inputs["production"]
    assert git(root, "rev-list", "--parents", "-n", "1", candidate).split() == [
        candidate,
        inputs["production"],
    ]
    assert git(root, "merge-tree", "--write-tree", str(inputs["production"]), candidate)
    assert git(root, "status", "--porcelain") == before
    assert git(root, "diff", "--cached", "--binary") == index_before
    assert git(root, "diff", "--binary") == working_before
    assert (root / "untracked.txt").read_text() == "leave alone\n"
    assert git(root, "show", f"{candidate}:protection.txt") == "protected"
    for line in refs.splitlines():
        ref, sha = line.split()
        assert git(root, "rev-parse", ref) == sha
    with pytest.raises(helper.IntegrationError, match="already exists"):
        helper.prepare(root, **inputs, apply=True)


@pytest.mark.parametrize("case", ["stale", "unique-production", "scope", "branch", "source"])
def test_unreviewed_or_stale_inputs_fail_before_ref_creation(
    helper: ModuleType,
    history: tuple[Path, dict[str, object]],
    case: str,
) -> None:
    root, inputs = history
    if case == "stale":
        git(root, "update-ref", "refs/remotes/origin/production", str(inputs["source"]))
    elif case == "unique-production":
        inputs["equivalent_master"] = inputs["source"]
    elif case == "scope":
        inputs["paths_file"].write_text("protection.txt\n")
    elif case == "branch":
        inputs["branch"] = "master"
    else:
        inputs["source"] = inputs["production"]
    refs = git(root, "for-each-ref", "--format=%(refname) %(objectname)")
    with pytest.raises(helper.IntegrationError):
        helper.prepare(root, **inputs, apply=True)
    assert git(root, "for-each-ref", "--format=%(refname) %(objectname)") == refs


def test_advanced_master_does_not_expand_frozen_reviewed_scope(
    helper: ModuleType,
    history: tuple[Path, dict[str, object]],
) -> None:
    root, inputs = history
    (root / "later.txt").write_text("another reviewed batch\n")
    git(root, "add", "later.txt")
    git(root, "commit", "-qm", "later work")
    git(root, "update-ref", "refs/remotes/origin/master", "HEAD")
    receipt = helper.prepare(root, **inputs, apply=True)
    assert receipt["fetched_master_sha"] != receipt["reviewed_master_sha"]
    assert receipt["changed_paths"] == ["app.txt"]
    assert git(root, "ls-tree", "--name-only", receipt["candidate_sha"], "later.txt") == ""


def test_branch_creation_race_never_overwrites_existing_ref(
    helper: ModuleType,
    history: tuple[Path, dict[str, object]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root, inputs = history
    original = helper.git

    def racing_git(root: Path, *args: str, **kwargs: object) -> str:
        if args[0] == "commit-tree":
            git(root, "update-ref", f"refs/heads/{inputs['branch']}", str(inputs["production"]))
        return original(root, *args, **kwargs)

    monkeypatch.setattr(helper, "git", racing_git)
    with pytest.raises(helper.IntegrationError):
        helper.prepare(root, **inputs, apply=True)
    assert git(root, "rev-parse", str(inputs["branch"])) == inputs["production"]


@pytest.mark.parametrize("tracking_branch", ["master", "production"])
def test_concurrent_fetch_change_stops_candidate_creation(
    helper: ModuleType,
    history: tuple[Path, dict[str, object]],
    monkeypatch: pytest.MonkeyPatch,
    tracking_branch: str,
) -> None:
    root, inputs = history
    original = helper.git
    replacement = inputs["production"] if tracking_branch == "master" else inputs["source"]
    tracking_ref = f"refs/remotes/origin/{tracking_branch}"

    def racing_git(root: Path, *args: str, **kwargs: object) -> str:
        if args[0] == "commit-tree":
            git(root, "update-ref", tracking_ref, str(replacement))
        return original(root, *args, **kwargs)

    monkeypatch.setattr(helper, "git", racing_git)
    with pytest.raises(helper.IntegrationError):
        helper.prepare(root, **inputs, apply=True)
    assert git(root, "rev-parse", tracking_ref) == replacement
    assert git(root, "for-each-ref", f"refs/heads/{inputs['branch']}") == ""
