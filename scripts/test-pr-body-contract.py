#!/usr/bin/env python3
"""Regression tests for the PR body contract."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "check_pr_body_contract",
    ROOT / ".github/scripts/check_pr_body_contract.py",
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load PR body contract module")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def payload(
    *,
    login: str = "muze-page",
    user_type: str = "User",
    body: str = "## Scope\nx\n## Boundary\nx\n## Verification\nx\n## Risk\nx",
    head_ref: str = "codex/example",
    head_repo: str = "npcink/npcink-ai-cloud",
    base_ref: str = "master",
    base_repo: str = "npcink/npcink-ai-cloud",
) -> dict[str, Any]:
    return {
        "pull_request": {
            "body": body,
            "user": {"login": login, "type": user_type},
            "head": {"ref": head_ref, "repo": {"full_name": head_repo}},
            "base": {"ref": base_ref, "repo": {"full_name": base_repo}},
        }
    }


class PrBodyContractTests(unittest.TestCase):
    def test_human_contract_accepts_required_headings(self) -> None:
        self.assertEqual(MODULE.validate_contract(payload(), ["app/main.py"]), "human")

    def test_human_contract_rejects_missing_heading(self) -> None:
        with self.assertRaisesRegex(MODULE.ContractError, "Risk"):
            MODULE.validate_contract(
                payload(body="## Scope\nx\n## Boundary\nx\n## Verification\nx"),
                ["app/main.py"],
            )

    def test_dependabot_accepts_manifest_and_lockfile(self) -> None:
        event = payload(
            login="dependabot[bot]",
            user_type="Bot",
            body=(
                "Bumps [next](https://github.com/vercel/next.js) "
                "from 16.2.9 to 16.2.11."
            ),
            head_ref="dependabot/npm_and_yarn/next-16.2.11",
        )
        self.assertEqual(
            MODULE.validate_contract(
                event, ["frontend/package.json", "pnpm-lock.yaml"]
            ),
            "dependabot",
        )

    def test_dependabot_accepts_github_action_update(self) -> None:
        event = payload(
            login="app/dependabot",
            user_type="Bot",
            body=(
                "Bumps [actions/checkout](https://github.com/actions/checkout) "
                "from 4 to 5."
            ),
            head_ref="dependabot/github_actions/actions/checkout-5",
        )
        self.assertEqual(
            MODULE.validate_contract(event, [".github/workflows/ci.yml"]),
            "dependabot",
        )

    def test_dependabot_rejects_application_source(self) -> None:
        event = payload(
            login="dependabot[bot]",
            user_type="Bot",
            body=(
                "Bumps [next](https://github.com/vercel/next.js) "
                "from 16.2.9 to 16.2.11."
            ),
            head_ref="dependabot/npm_and_yarn/next-16.2.11",
        )
        with self.assertRaisesRegex(MODULE.ContractError, "app/main.py"):
            MODULE.validate_contract(event, ["package.json", "app/main.py"])

    def test_dependabot_rejects_external_head_repository(self) -> None:
        event = payload(
            login="dependabot[bot]",
            user_type="Bot",
            body=(
                "Bumps [next](https://github.com/vercel/next.js) "
                "from 16.2.9 to 16.2.11."
            ),
            head_ref="dependabot/npm_and_yarn/next-16.2.11",
            head_repo="attacker/npcink-ai-cloud",
        )
        with self.assertRaisesRegex(MODULE.ContractError, "head repository"):
            MODULE.validate_contract(event, ["package.json"])

    def test_dependabot_rejects_non_dependabot_branch(self) -> None:
        event = payload(
            login="dependabot[bot]",
            user_type="Bot",
            body=(
                "Bumps [next](https://github.com/vercel/next.js) "
                "from 16.2.9 to 16.2.11."
            ),
            head_ref="codex/fake-dependency-update",
        )
        with self.assertRaisesRegex(MODULE.ContractError, "dependabot/"):
            MODULE.validate_contract(event, ["package.json"])

    def test_dependabot_rejects_missing_version_statement(self) -> None:
        event = payload(
            login="dependabot[bot]",
            user_type="Bot",
            body="Automated dependency update.",
            head_ref="dependabot/npm_and_yarn/next-16.2.11",
        )
        with self.assertRaisesRegex(MODULE.ContractError, "from/to"):
            MODULE.validate_contract(event, ["package.json"])


if __name__ == "__main__":
    unittest.main()
