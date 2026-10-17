from __future__ import annotations

import re
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"


def _workflow(name: str) -> dict:
    return yaml.load((WORKFLOWS / name).read_text(), Loader=yaml.BaseLoader)


def test_review_launcher_auto_update_is_disabled_before_install_and_config() -> None:
    job = _workflow("ocr-review.yml")["jobs"]["code-review"]
    # The npm launcher starts an asynchronous global reinstall unless this is
    # inherited by every invocation, including the action's version probe.
    assert job["env"]["OCR_NO_UPDATE"] == "1"
    review = next(step for step in job["steps"] if step.get("id") == "ocr_review")
    assert review["with"]["ocr_version"] == "1.12.13"
    assert review["with"]["review_concurrency"] == "1"
    assert review["with"]["max_tokens_budget"] == "80000"


def test_startup_check_uses_the_same_pin_without_secrets_or_model_calls() -> None:
    check = _workflow("ocr-startup-check.yml")
    review = _workflow("ocr-review.yml")["jobs"]["code-review"]
    version = next(s for s in review["steps"] if s.get("id") == "ocr_review")["with"]["ocr_version"]
    assert check["permissions"] == {"contents": "read"}
    assert set(check["on"]) == {"pull_request", "workflow_dispatch"}
    job = check["jobs"]["startup"]
    assert job["env"]["OCR_NO_UPDATE"] == review["env"]["OCR_NO_UPDATE"]
    assert job["runs-on"] == review["runs-on"]
    scripts = "\n".join(s.get("run", "") for s in job["steps"])
    assert f"@alibaba-group/open-code-review@{version}" in scripts
    assert "ocr config set llm.extra_body" in scripts
    assert "last-update-check" in scripts
    assert not re.search(r"\bocr\s+(review|scan|llm)\b", scripts)
    assert "secrets." not in (WORKFLOWS / "ocr-startup-check.yml").read_text()


def test_startup_shell_steps_parse_and_verify_the_version_after_config() -> None:
    steps = _workflow("ocr-startup-check.yml")["jobs"]["startup"]["steps"]
    scripts = [s["run"] for s in steps if "run" in s]
    for script in scripts:
        subprocess.run(["bash", "-n"], input=script, text=True, check=True)
    smoke = next(s for s in scripts if "ocr config" in s)
    assert smoke.index("ocr version") < smoke.index("ocr config set llm.extra_body")
    assert smoke.rindex("ocr version") > smoke.index("ocr config set llm.extra_body")
