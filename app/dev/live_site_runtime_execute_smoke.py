from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin

from app.dev.live_site_preflight import _dict, _list, _text
from app.dev.live_site_runtime_smoke import (
    DEFAULT_ACCEPTANCE_REPORT,
    DEFAULT_BASE_URL,
    DEFAULT_STAGE_REPORT,
    GuardError,
    HttpPost,
    build_runtime_resolve_payload,
    build_signed_headers,
    load_json,
    load_secret_payload,
    post_json,
    redact_runtime_result,
    validate_acceptance,
)

APPROVAL_TEXT = (
    "我明确批准在 npcink.local 运行一次 Cloud runtime execute smoke；本次不运行 Site "
    "Knowledge sync/search，不写 WordPress 内容，不启用 monitoring。"
)
DEFAULT_RESOLVE_SMOKE_REPORT = Path(
    ".tmp/live-site-runtime-smoke/npcink-resolve/runtime-resolve-smoke-report.json"
)
DEFAULT_OUTPUT_ROOT = Path(".tmp/live-site-runtime-execute-smoke")


def normalize_approval(value: str) -> str:
    return "".join(value.split())


def approval_matches(value: str) -> bool:
    return normalize_approval(value) == normalize_approval(APPROVAL_TEXT)


def build_runtime_execute_payload(*, site_id: str, trace_id: str) -> dict[str, object]:
    payload = build_runtime_resolve_payload(site_id=site_id, trace_id=trace_id)
    payload["canonical_run_id"] = f"npcink_runtime_execute_smoke_{trace_id[:12]}"
    payload["input"] = {
        "messages": [
            {
                "role": "user",
                "content": "Return the exact text: magick cloud runtime smoke ok",
            }
        ]
    }
    return payload


def validate_resolve_smoke(report: dict[str, object]) -> list[str]:
    failures: list[str] = []
    if report.get("ok") is not True:
        failures.append("runtime resolve smoke report is not ok")
    if report.get("mode") != "execute":
        failures.append("runtime resolve smoke was not executed")
    boundary = _dict(report.get("boundary"))
    if boundary.get("runtime_resolve_smoke") is not True:
        failures.append("resolve smoke boundary did not mark runtime_resolve_smoke=true")
    if boundary.get("runtime_execute") is not False:
        failures.append("resolve smoke boundary did not preserve runtime_execute=false")
    if boundary.get("site_knowledge_sync") is not False:
        failures.append("resolve smoke boundary did not preserve site_knowledge_sync=false")
    response_failures = [str(item) for item in _list(report.get("response_failures"))]
    if response_failures:
        failures.append("resolve smoke response failures: " + ", ".join(response_failures))
    return failures


def validate_execute_response(result: dict[str, object]) -> list[str]:
    failures: list[str] = []
    if result.get("ok") is not True:
        failures.append(f"runtime execute HTTP failed: {result.get('status_code')}")
        return failures
    response = _dict(result.get("response"))
    if response.get("status") != "ok":
        failures.append(f"runtime execute envelope was not ok: {response.get('error_code')}")
    data = _dict(response.get("data"))
    required = {
        "run_id",
        "canonical_run_id",
        "status",
        "trace_id",
        "profile_id",
        "provider_id",
        "model_id",
        "execution_context",
        "task_backend",
        "run_lifecycle",
        "result",
    }
    missing = sorted(required - set(data.keys()))
    if missing:
        failures.append("runtime execute data missing keys: " + ", ".join(missing))
    if data.get("status") not in {"queued", "running", "succeeded"}:
        failures.append(f"runtime execute returned unexpected status: {data.get('status')}")
    execution_context = _dict(data.get("execution_context"))
    if execution_context.get("execution_pattern") != "inline":
        failures.append("runtime execute did not preserve execution_pattern=inline")
    if execution_context.get("storage_mode") != "result_only":
        failures.append("runtime execute did not preserve storage_mode=result_only")
    return failures


def build_execute_smoke_report(
    *,
    acceptance_report_path: Path,
    stage_report_path: Path,
    resolve_smoke_report_path: Path,
    output_dir: Path,
    base_url: str,
    timeout_seconds: int,
    execute: bool,
    approval_text: str,
    http_post: HttpPost = post_json,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    if execute and not approval_matches(approval_text):
        raise GuardError("exact approval text did not match; runtime execute smoke was not run")

    acceptance = load_json(acceptance_report_path)
    stage_report = load_json(stage_report_path)
    resolve_smoke = load_json(resolve_smoke_report_path)
    acceptance_failures = validate_acceptance(acceptance)
    resolve_failures = validate_resolve_smoke(resolve_smoke)
    outputs = _dict(stage_report.get("outputs"))
    secret_file = Path(_text(outputs.get("secret_file")))

    trace_id = "npcinkexecute" + hashlib.sha256(str(datetime.now(UTC)).encode()).hexdigest()[:20]
    identity_target = _dict(_dict(stage_report.get("identity_provision")).get("target"))
    payload_site_id = _text(identity_target.get("site_id")) or "site_npcink_local_live"
    secret_payload: dict[str, str] = {}
    if execute:
        failures = [*acceptance_failures, *resolve_failures]
        if failures:
            raise GuardError("; ".join(failures))
        secret_payload = load_secret_payload(secret_file)
        payload_site_id = secret_payload["site_id"]

    payload = build_runtime_execute_payload(site_id=payload_site_id, trace_id=trace_id)
    result: dict[str, object] = {"skipped": True, "reason": "prepare_only"}
    response_failures: list[str] = []
    if execute:
        path = "/v1/runtime/execute"
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        timestamp = str(int(datetime.now(UTC).timestamp()))
        idempotency_key = f"npcink-runtime-execute-smoke-{trace_id[:16]}"
        nonce = f"nonce-{trace_id[:24]}"
        headers = build_signed_headers(
            method="POST",
            path=path,
            site_id=secret_payload["site_id"],
            key_id=secret_payload["key_id"],
            secret=secret_payload["secret"],
            body=body,
            trace_id=trace_id,
            idempotency_key=idempotency_key,
            timestamp=timestamp,
            nonce=nonce,
        )
        result = http_post(
            urljoin(base_url.rstrip("/") + "/", path.lstrip("/")),
            payload,
            headers,
            timeout_seconds,
        )
        response_failures = validate_execute_response(result)

    report: dict[str, object] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "execute" if execute else "prepare",
        "stage": "live_site_runtime_execute_smoke",
        "boundary": {
            "wordpress_writes": False,
            "wordpress_option_writes": False,
            "cloud_identity_provisioning": False,
            "public_runtime_provisioning": False,
            "runtime_resolve_smoke": False,
            "runtime_execute_smoke": execute,
            "provider_execution_possible": execute,
            "site_knowledge_sync": False,
            "site_knowledge_search": False,
            "content_writes": False,
            "monitoring_enabled": False,
        },
        "approval": {
            "required_for_execute": APPROVAL_TEXT,
            "provided": bool(approval_text),
            "matched": approval_matches(approval_text),
        },
        "inputs": {
            "acceptance_report": str(acceptance_report_path),
            "stage_report": str(stage_report_path),
            "resolve_smoke_report": str(resolve_smoke_report_path),
            "secret_file": str(secret_file) if _text(outputs.get("secret_file")) else "",
            "base_url": base_url,
        },
        "request_plan": {
            "method": "POST",
            "path": "/v1/runtime/execute",
            "site_id": payload.get("site_id"),
            "ability_name": payload.get("ability_name"),
            "execution_pattern": payload.get("execution_pattern"),
            "storage_mode": payload.get("storage_mode"),
            "policy": payload.get("policy"),
        },
        "acceptance_failures": acceptance_failures,
        "resolve_smoke_failures": resolve_failures,
        "runtime_result": redact_runtime_result(result),
        "response_failures": response_failures,
        "ok": execute
        and not acceptance_failures
        and not resolve_failures
        and not response_failures,
        "next_steps": next_steps(
            execute=execute,
            ok=not acceptance_failures and not resolve_failures and not response_failures,
        ),
    }
    (output_dir / "runtime-execute-smoke-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n"
    )
    (output_dir / "summary.md").write_text(render_markdown(report))
    return report


def next_steps(*, execute: bool, ok: bool) -> list[str]:
    if not execute:
        return [
            "complete Stage 1, Save and Verify, acceptance, and resolve smoke first",
            "use the exact runtime execute smoke approval text before execute mode",
        ]
    if ok:
        return [
            "record the execute smoke report as real hosted runtime evidence",
            "request separate approval before any Site Knowledge sync/search",
            "do not write WordPress content without a Core/local approval path",
        ]
    return [
        "fix failed preconditions or runtime execute response checks",
        "do not run Site Knowledge sync/search or WordPress content writes",
    ]


def render_markdown(report: dict[str, object]) -> str:
    boundary = _dict(report.get("boundary"))
    acceptance_failures = (
        ", ".join(_text(item) for item in _list(report.get("acceptance_failures"))) or "none"
    )
    resolve_failures = (
        ", ".join(_text(item) for item in _list(report.get("resolve_smoke_failures")))
        or "none"
    )
    response_failures = (
        ", ".join(_text(item) for item in _list(report.get("response_failures"))) or "none"
    )
    lines = [
        "# Live Site Runtime Execute Smoke",
        "",
        f"Generated at: `{_text(report.get('generated_at'))}`",
        f"Mode: `{_text(report.get('mode'))}`",
        f"OK: `{report.get('ok')}`",
        "",
        "## Boundary",
        "",
        f"- Runtime execute smoke: `{boundary.get('runtime_execute_smoke')}`",
        f"- Provider execution possible: `{boundary.get('provider_execution_possible')}`",
        f"- WordPress writes: `{boundary.get('wordpress_writes')}`",
        f"- Site Knowledge sync/search: `{boundary.get('site_knowledge_sync')}` / "
        f"`{boundary.get('site_knowledge_search')}`",
        f"- Content writes: `{boundary.get('content_writes')}`",
        "",
        "## Failures",
        "",
        f"- Acceptance: `{acceptance_failures}`",
        f"- Resolve smoke: `{resolve_failures}`",
        f"- Runtime response: `{response_failures}`",
        "",
        "## Next Steps",
        "",
    ]
    lines.extend([f"- {step}" for step in _list(report.get("next_steps"))])
    lines.append("")
    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare or execute a guarded npcink.local runtime execute smoke."
    )
    parser.add_argument("--acceptance-report", type=Path, default=DEFAULT_ACCEPTANCE_REPORT)
    parser.add_argument("--stage-report", type=Path, default=DEFAULT_STAGE_REPORT)
    parser.add_argument("--resolve-smoke-report", type=Path, default=DEFAULT_RESOLVE_SMOKE_REPORT)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--timeout-seconds", type=int, default=60)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--approval-text", default="")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    suffix = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir or DEFAULT_OUTPUT_ROOT / f"npcink-execute-smoke-{suffix}"
    try:
        report = build_execute_smoke_report(
            acceptance_report_path=args.acceptance_report,
            stage_report_path=args.stage_report,
            resolve_smoke_report_path=args.resolve_smoke_report,
            output_dir=output_dir,
            base_url=args.base_url,
            timeout_seconds=args.timeout_seconds,
            execute=args.execute,
            approval_text=args.approval_text,
        )
    except GuardError as exc:
        print(json.dumps({"ok": False, "guard_error": str(exc)}), file=sys.stderr)
        return 2

    print(
        json.dumps(
            {
                "ok": report["ok"],
                "mode": report["mode"],
                "output_dir": str(output_dir),
                "acceptance_failures": report["acceptance_failures"],
                "resolve_smoke_failures": report["resolve_smoke_failures"],
                "response_failures": report["response_failures"],
            }
        )
    )
    return 0 if report["ok"] is True or not args.execute else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
