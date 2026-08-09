from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CLASSIFIER = ROOT / "scripts" / "classify-ci-changes.sh"
DOCS_GATE = ROOT / "scripts" / "check-docs-only.sh"
BACKEND_GATE = ROOT / "scripts" / "check-pr-backend-gate.sh"
BACKEND_SELECTOR = ROOT / "scripts" / "select-pr-backend-tests.py"
PR_WAITER = ROOT / "scripts" / "wait-pr-readiness.py"
WEIGHT_REFRESH = ROOT / "scripts" / "refresh-pytest-duration-weights.sh"
BALANCE_REPORT = ROOT / "scripts" / "report-pytest-shard-balance.py"
CHANGED_COVERAGE_REPORT = ROOT / "scripts" / "report-changed-code-coverage.py"
PRODUCTION_CI_EVIDENCE = ROOT / "scripts" / "production-ci-evidence.py"
CI_WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
CODEQL_WORKFLOW = ROOT / ".github" / "workflows" / "codeql.yml"


def _classify(*paths: str) -> dict[str, str]:
    completed = subprocess.run(
        ["bash", str(CLASSIFIER), *paths],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return dict(line.split("=", 1) for line in completed.stdout.splitlines())


def test_ci_change_classifier_is_fail_closed_without_paths() -> None:
    assert _classify() == {
        "deploy_required": "true",
        "static_terms_only": "false",
        "docs_only": "false",
        "frontend_only": "false",
        "frontend_e2e_required": "true",
    }


def test_ci_change_classifier_selects_only_safe_documentation_paths() -> None:
    assert _classify(
        "README.md",
        "AGENTS.md",
        "docs/m4-preview-development-v1.md",
        "deploy/OPS_PLAYBOOK.md",
    ) == {
        "deploy_required": "false",
        "static_terms_only": "false",
        "docs_only": "true",
        "frontend_only": "false",
        "frontend_e2e_required": "false",
    }

    assert (
        _classify(
            "docs/m4-preview-development-v1.md",
            "tests/contract/test_ci_efficiency_contract.py",
        )["docs_only"]
        == "false"
    )


def test_ci_change_classifier_preserves_static_terms_and_runtime_boundaries() -> None:
    assert _classify("site/terms/index.html", "site/terms/styles.css") == {
        "deploy_required": "true",
        "static_terms_only": "true",
        "docs_only": "false",
        "frontend_only": "false",
        "frontend_e2e_required": "false",
    }

    assert _classify("app/main.py") == {
        "deploy_required": "true",
        "static_terms_only": "false",
        "docs_only": "false",
        "frontend_only": "false",
        "frontend_e2e_required": "false",
    }
    assert _classify(".github/workflows/ci.yml") == {
        "deploy_required": "true",
        "static_terms_only": "false",
        "docs_only": "false",
        "frontend_only": "false",
        "frontend_e2e_required": "true",
    }


def test_ci_change_classifier_selects_only_frontend_tree_changes() -> None:
    assert _classify(
        "frontend/src/app/admin/ai-resources/page.tsx",
        "frontend/tests/admin-ai-resources.test.tsx",
    )["frontend_only"] == "true"
    assert _classify(
        "frontend/src/app/admin/ai-resources/page.tsx",
        "app/main.py",
    )["frontend_only"] == "false"
    assert _classify(
        "frontend/src/app/admin/ai-resources/page.tsx",
        "pnpm-lock.yaml",
    )["frontend_only"] == "false"
    assert _classify(".github/workflows/ci.yml")["frontend_only"] == "false"


def test_codeql_runs_for_master_and_production_pull_requests() -> None:
    workflow = CODEQL_WORKFLOW.read_text(encoding="utf-8")

    assert "push:\n    branches: [master, production]" in workflow
    assert "pull_request:\n    branches: [master, production]" in workflow


def test_production_push_reuses_tree_bound_production_pr_ci_evidence() -> None:
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    evidence_script = PRODUCTION_CI_EVIDENCE.read_text(encoding="utf-8")
    production_push_guard = (
        "github.event_name != 'push' || github.ref != 'refs/heads/production'"
    )

    assert "production-promotion-evidence:" in workflow
    assert "Production PR CI evidence" in workflow
    assert "commits/${GITHUB_SHA}/pulls" in workflow
    assert "production-pr-ci-evidence-${pr_number}-${pr_head_sha}" in workflow
    assert "python3 scripts/production-ci-evidence.py verify" in workflow
    assert "production commit tree does not match the tree tested" in evidence_script
    assert "exactly one merged same-repository production PR" in evidence_script
    assert workflow.count(production_push_guard) >= 8
    assert "needs: [production-promotion-evidence]" in workflow
    assert "Create production PR CI evidence receipt" in workflow
    assert "Upload production PR CI evidence receipt" in workflow
    assert "production-pr-ci-evidence-${{ github.event.pull_request.number }}" in workflow


def test_ci_change_classifier_selects_only_relevant_frontend_e2e_paths() -> None:
    for path in (
        "frontend/src/app/portal/page.tsx",
        "frontend/tests/e2e/admin-operator-path.spec.ts",
        "frontend/playwright.config.ts",
        "package.json",
        "pnpm-lock.yaml",
        "scripts/run-cloud-frontend-playwright.js",
    ):
        assert _classify(path)["frontend_e2e_required"] == "true"

    assert _classify("app/api/routes/service.py")["frontend_e2e_required"] == "false"
    assert (
        _classify("tests/api/test_service_routes.py")["frontend_e2e_required"]
        == "false"
    )
    assert _classify("docs/portal-boundary.md")["frontend_e2e_required"] == "false"


def test_docs_only_scripts_and_workflow_are_fail_closed() -> None:
    subprocess.run(["bash", "-n", str(CLASSIFIER)], cwd=ROOT, check=True)
    subprocess.run(["bash", "-n", str(DOCS_GATE)], cwd=ROOT, check=True)

    docs_gate = DOCS_GATE.read_text(encoding="utf-8")
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")

    assert "git -C" in docs_gate
    assert "mapfile" not in docs_gate
    assert 'changed_files+=("${changed_file}")' in docs_gate
    assert "--diff-filter=ACMRD" in docs_gate
    assert "diff --check" in docs_gate
    assert "check-release-policy.sh" in docs_gate
    assert "docs_only=true" in docs_gate
    assert "received a non-documentation change" in docs_gate

    assert "docs_only: ${{ steps.changed.outputs.docs_only }}" in workflow
    assert "frontend_only: ${{ steps.changed.outputs.frontend_only }}" in workflow
    assert (
        "frontend_e2e_required: "
        "${{ steps.changed.outputs.frontend_e2e_required }}" in workflow
    )
    assert (
        "specialized_quality_required: "
        "${{ steps.changed.outputs.specialized_quality_required }}" in workflow
    )
    assert workflow.count("--diff-filter=ACMRD") == 3
    assert "bash scripts/classify-ci-changes.sh" in workflow
    assert "bash scripts/check-docs-only.sh" in workflow
    assert "specialized-quality:" in workflow
    assert "python3 scripts/check_changed.py" in workflow
    assert "--specialized-only" in workflow
    assert "specialized changed-domain quality gates did not pass" in workflow
    assert "specialized changed-domain quality gates must stay PR-only" in workflow
    assert "Docs-only frontend acknowledgement" in workflow
    assert (
        "python dependency audit should be skipped for docs-only or frontend-only changes"
        in workflow
    )
    assert "targeted backend gate should be skipped for frontend-only changes" in workflow
    assert "Select frontend-only backend gate" in workflow
    assert "pnpm --dir frontend exec playwright install --with-deps chromium" in workflow
    assert "node scripts/run-cloud-frontend-playwright.js" in workflow
    assert workflow.count(
        "PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/playwright-browsers"
    ) == 2
    assert "tests/e2e/admin-operator-path.spec.ts" in workflow
    assert "tests/e2e/portal-workspace-path.spec.ts" in workflow
    assert (
        "admin operator path smoke|portal workspace interaction path|"
        "Alipay return polls|account projections stay idle|"
        "account-level support stays available"
    ) in workflow
    assert workflow.count(
        "if: needs.classify.outputs.frontend_e2e_required == 'true'"
    ) == 2


@pytest.mark.skipif(
    not (ROOT / ".git").exists(),
    reason="CI-only Git diff contract requires repository metadata omitted from M4 bundles",
)
def test_docs_only_gate_runs_fail_closed_with_system_bash() -> None:
    environment = os.environ.copy()
    environment["NPCINK_CLOUD_CI_BASE_SHA"] = "origin/master"
    environment["NPCINK_CLOUD_CI_HEAD_SHA"] = "HEAD"

    completed = subprocess.run(
        ["/bin/bash", str(DOCS_GATE)],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode != 0
    assert (
        "docs-only gate received no changed files" in completed.stderr
        or "docs-only gate received a non-documentation change" in completed.stderr
    )
    assert "command not found" not in completed.stderr


def test_targeted_backend_gate_parallelizes_contracts_and_selects_impacted_tests() -> None:
    source = BACKEND_GATE.read_text(encoding="utf-8")
    selector = BACKEND_SELECTOR.read_text(encoding="utf-8")
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")

    assert "pytest tests/contract -q --durations=25" in source
    assert "--targeted-contract-shard" in source
    assert "--shards 2" in source
    assert "mapfile" not in source
    assert "select-pr-backend-tests.py" in source
    assert "contract shards are already covered" in source
    assert '"app/api/routes/portal.py"' in selector
    assert '"tests/api/test_portal_routes.py"' in selector
    assert "selecting all tests/api" in selector
    for lane in ("static", "contract-1", "contract-2", "impacted"):
        assert f"lane: {lane}" in workflow
    assert "matrix.needs_node" in workflow
    assert "backend-docs:" in workflow
    assert "docs-only backend gate did not pass" in workflow


def test_pr_wait_command_monitors_checks_and_review_threads_together() -> None:
    waiter = PR_WAITER.read_text(encoding="utf-8")
    package = (ROOT / "package.json").read_text(encoding="utf-8")
    workflow_standard = (
        ROOT / "docs" / "single-session-ai-workflow-standard-v1.md"
    ).read_text(encoding="utf-8")

    assert "reviewThreads(first:100)" in waiter
    assert 'readiness.state == "review_required"' in waiter
    assert "settle-polls" in waiter
    assert '"pr:wait": "python3 scripts/wait-pr-readiness.py"' in package
    assert "pnpm run pr:wait -- --pr <number>" in workflow_standard


def test_pytest_weight_refresh_is_reproducible_and_fail_closed(
    tmp_path: Path,
) -> None:
    subprocess.run(["bash", "-n", str(WEIGHT_REFRESH)], cwd=ROOT, check=True)
    dirname_binary = shutil.which("dirname")
    assert dirname_binary is not None
    (tmp_path / "dirname").symlink_to(dirname_binary)
    environment_without_gh = {
        **os.environ,
        "PATH": str(tmp_path),
    }
    help_result = subprocess.run(
        ["bash", str(WEIGHT_REFRESH), "--", "--help"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    too_few_result = subprocess.run(
        ["/bin/bash", str(WEIGHT_REFRESH), "--", "123"],
        cwd=ROOT,
        env=environment_without_gh,
        text=True,
        capture_output=True,
        check=False,
    )
    valid_args_without_gh_result = subprocess.run(
        ["/bin/bash", str(WEIGHT_REFRESH), "--", "123", "456", "789"],
        cwd=ROOT,
        env=environment_without_gh,
        text=True,
        capture_output=True,
        check=False,
    )
    source = WEIGHT_REFRESH.read_text(encoding="utf-8")
    package = (ROOT / "package.json").read_text(encoding="utf-8")

    assert "ci:pytest:weights:refresh" in help_result.stdout
    assert too_few_result.returncode == 2
    assert "at least 3 run ids are required" in too_few_result.stderr
    assert valid_args_without_gh_result.returncode == 1
    assert "GitHub CLI (gh) is required" in valid_args_without_gh_result.stderr
    assert "EXPECTED_SHARDS=3" in source
    assert "MINIMUM_RUNS=3" in source
    assert "gh run download" in source
    assert "validate_master_run" in source
    assert "success\\tpush\\tmaster" in source
    assert "--recent-master" in source
    assert "--event push" in source
    assert "--status success" in source
    assert "pytest-backend-timing-shard-*" in source
    assert "write-pytest-duration-weights.py" in source
    assert "expected ${EXPECTED_SHARDS} pytest shard reports" in source
    assert "--aggregation mean-plus-stddev" in source
    assert 'mv "${OUTPUT_TEMP}" "${ROOT_DIR}/ci/pytest-backend-durations.json"' in source
    assert '"ci:pytest:weights:refresh"' in package


def test_pytest_balance_observability_is_advisory_and_uses_complete_artifacts() -> None:
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    report = BALANCE_REPORT.read_text(encoding="utf-8")

    assert "Summarize pytest shard balance" in workflow
    assert "gh run download" in workflow
    assert "report-pytest-shard-balance.py" in workflow
    assert "Pytest shard balance summary was unavailable" in workflow
    assert "::warning title=Pytest shard balance drift::" in report
    assert "actual_max_min_ratio" in report
    assert "file_drift_seconds" in report


def test_changed_code_coverage_reuses_shards_and_remains_advisory() -> None:
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    report = CHANGED_COVERAGE_REPORT.read_text(encoding="utf-8")

    assert workflow.count("pytest-backend-coverage-shard-${{ matrix.shard }}") == 1
    assert 'git diff --name-only --diff-filter=ACMR "${BASE_SHA}...${HEAD_SHA}"' in workflow
    assert '--include="${coverage_include_arg}"' in workflow
    assert 'coverage_include_paths=("app/__init__.py" "${changed_app_files[@]}")' in workflow
    assert 'if [ "${#changed_app_files[@]}" -gt 0 ]' in workflow
    assert "coverage combine" in workflow
    assert '--coverage-data "${combine_dir}/.coverage"' in workflow
    assert "report-changed-code-coverage.py" in workflow
    assert "changed-code-coverage.json" in workflow
    assert "changed-code-coverage.md" in workflow
    assert "expected 3 backend coverage shard files" in workflow
    assert "github.event_name == 'pull_request'" in workflow
    assert "HEAD_SHA: ${{ github.sha }}" in workflow
    assert "--fail-under" not in workflow
    assert '"advisory": True' in report
    assert '"threshold": None' in report
    assert '"scope": "app/**/*.py"' in report
    assert "does not block merging" in report
