from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from app.dev.live_site_addon_package import DEFAULT_NPCINK_SITE
from app.dev.live_site_preflight import (
    SiteTarget,
    _dict,
    _list,
    _text,
    active_cloud_addon_plugin,
    cloud_addon_ready,
    parse_site_spec,
)
from app.dev.live_site_preflight import (
    build_report as build_preflight_report,
)

DEFAULT_STAGE_REPORT = Path(".tmp/live-site-stage1/npcink-stage1/stage1-report.json")
DEFAULT_OUTPUT_ROOT = Path(".tmp/live-site-stage1-acceptance")


class PreflightBuilder(Protocol):
    def __call__(
        self,
        *,
        targets: list[SiteTarget],
        php_bin: str,
        wp_bin: str,
        timeout_seconds: int,
        min_public_items: int,
        use_local_socket: bool,
        quiet: bool,
    ) -> dict[str, object]: ...


def load_json(path: Path) -> dict[str, object]:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"could not read JSON report {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"JSON report {path} must be an object")
    return value


def build_acceptance_report(
    *,
    target: SiteTarget,
    stage_report_path: Path,
    output_dir: Path,
    php_bin: str,
    wp_bin: str,
    timeout_seconds: int,
    min_public_items: int,
    use_local_socket: bool,
    preflight_builder: PreflightBuilder = build_preflight_report,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stage_report = load_json(stage_report_path)
    preflight = preflight_builder(
        targets=[target],
        php_bin=php_bin,
        wp_bin=wp_bin,
        timeout_seconds=timeout_seconds,
        min_public_items=min_public_items,
        use_local_socket=use_local_socket,
        quiet=True,
    )
    site = first_site(preflight)
    checks = evaluate_acceptance(
        target=target,
        stage_report=stage_report,
        stage_report_path=stage_report_path,
        preflight=preflight,
        site=site,
    )
    ready = all(check["ok"] is True for check in checks)
    report: dict[str, object] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "stage": "live_site_cloud_addon_stage1_acceptance",
        "mode": "read_only_acceptance",
        "target": {"label": target.label, "url": target.url, "path": str(target.path)},
        "boundary": {
            "wordpress_writes": False,
            "wordpress_option_writes": False,
            "cloud_identity_provisioning": False,
            "public_runtime_provisioning": False,
            "cloud_runtime_execution": False,
            "runtime_smoke": False,
            "site_knowledge_sync": False,
            "site_knowledge_search": False,
            "content_writes": False,
            "monitoring_enabled": False,
        },
        "inputs": {
            "stage_report": str(stage_report_path),
            "preflight_source": "live_site_preflight",
        },
        "checks": checks,
        "ready_for_runtime_smoke_approval": ready,
        "next_steps": next_steps(ready=ready),
    }
    (output_dir / "acceptance-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n"
    )
    (output_dir / "summary.md").write_text(render_markdown(report))
    return report


def first_site(preflight: dict[str, object]) -> dict[str, object]:
    sites = _list(preflight.get("sites"))
    if not sites:
        return {}
    return _dict(sites[0])


def evaluate_acceptance(
    *,
    target: SiteTarget,
    stage_report: dict[str, object],
    stage_report_path: Path,
    preflight: dict[str, object],
    site: dict[str, object],
) -> list[dict[str, object]]:
    wordpress = _dict(site.get("wordpress"))
    settings = _dict(wordpress.get("cloud_settings"))
    evaluation = _dict(site.get("evaluation"))
    outputs = _dict(stage_report.get("outputs"))
    stage_boundary = _dict(stage_report.get("boundary"))
    secret_file = Path(_text(outputs.get("secret_file")))
    expected_site_id = _text(
        _dict(_dict(stage_report.get("identity_provision")).get("target")).get("site_id")
    )

    checks = [
        check(
            "stage_report_exists",
            stage_report_path.exists(),
            str(stage_report_path),
        ),
        check(
            "stage1_mode_execute",
            stage_report.get("mode") == "execute",
            stage_report.get("mode"),
        ),
        check("stage1_report_ok", stage_report.get("ok") is True, stage_report.get("ok")),
        check(
            "stage1_no_runtime_or_site_knowledge",
            stage_boundary.get("cloud_runtime_execution") is False
            and stage_boundary.get("runtime_smoke") is False
            and stage_boundary.get("site_knowledge_sync") is False
            and stage_boundary.get("site_knowledge_search") is False,
            stage_boundary,
        ),
        check(
            "secret_file_present",
            bool(_text(outputs.get("secret_file")))
            and secret_file.exists()
            and secret_file.stat().st_size > 0,
            str(secret_file) if _text(outputs.get("secret_file")) else "not generated",
        ),
        check(
            "preflight_overall_go",
            preflight.get("overall_decision") == "go",
            preflight.get("overall_decision"),
        ),
        check(
            "preflight_no_blockers",
            not _list(evaluation.get("blockers")),
            _list(evaluation.get("blockers")),
        ),
        check("http_reachable", _dict(site.get("http")).get("ok") is True, _dict(site.get("http"))),
        check("wordpress_reachable", wordpress.get("ok") is True, wordpress.get("ok")),
        check(
            "target_identity_matches",
            _text(site.get("url")).rstrip("/") == target.url.rstrip("/"),
            {"site_url": site.get("url"), "target_url": target.url},
        ),
        check(
            "cloud_addon_plugin_active",
            active_cloud_addon_plugin(wordpress),
            wordpress.get("active_plugins"),
        ),
        check("cloud_addon_verified", cloud_addon_ready(wordpress), settings),
        check(
            "cloud_site_id_matches_stage1_identity",
            bool(expected_site_id) and _text(settings.get("site_id")) == expected_site_id,
            {"expected": expected_site_id, "actual": settings.get("site_id")},
        ),
        check(
            "cloud_base_url_present",
            bool(_text(settings.get("base_url"))),
            settings.get("base_url"),
        ),
        check(
            "monitoring_still_disabled",
            settings.get("monitoring_enabled") is False,
            settings.get("monitoring_enabled"),
        ),
    ]
    return checks


def check(name: str, ok: bool, evidence: object) -> dict[str, object]:
    return {"name": name, "ok": ok, "evidence": evidence}


def next_steps(*, ready: bool) -> list[str]:
    if ready:
        return [
            "request separate approval for a bounded runtime smoke",
            "do not run runtime smoke, Site Knowledge sync/search, or content writes "
            "from this acceptance step",
        ]
    return [
        "fix failed checks before requesting runtime smoke approval",
        "rerun Stage 1 acceptance after wp-admin Save and Verify is confirmed",
    ]


def render_markdown(report: dict[str, object]) -> str:
    checks = _list(report.get("checks"))
    lines = [
        "# Live Site Stage 1 Acceptance",
        "",
        f"Generated at: `{_text(report.get('generated_at'))}`",
        f"Ready for runtime smoke approval: `{report.get('ready_for_runtime_smoke_approval')}`",
        "",
        "## Boundary",
        "",
        "This is a read-only acceptance report. It does not write WordPress options,",
        "provision Cloud identity, run runtime smoke, run Site Knowledge sync/search,",
        "enable monitoring, or write content.",
        "",
        "## Checks",
        "",
        "| Check | OK | Evidence |",
        "| --- | ---: | --- |",
    ]
    for item in checks:
        item_dict = _dict(item)
        lines.append(
            "| {name} | `{ok}` | `{evidence}` |".format(
                name=_text(item_dict.get("name")),
                ok=item_dict.get("ok"),
                evidence=_text(item_dict.get("evidence"))[:180],
            )
        )
    lines.extend(["", "## Next Steps", ""])
    lines.extend([f"- {step}" for step in _list(report.get("next_steps"))])
    lines.append("")
    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only acceptance check after npcink.local Stage 1 and Save and Verify."
    )
    parser.add_argument(
        "--site",
        nargs=3,
        metavar=("LABEL", "URL", "WORDPRESS_ROOT"),
        help="Target site. Defaults to npcink.local.",
    )
    parser.add_argument("--stage-report", type=Path, default=DEFAULT_STAGE_REPORT)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--php-bin", default="/opt/homebrew/bin/php")
    parser.add_argument("--wp-bin", default="/opt/homebrew/bin/wp")
    parser.add_argument("--timeout-seconds", type=int, default=20)
    parser.add_argument("--min-public-items", type=int, default=10)
    parser.add_argument("--no-local-socket", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    target = parse_site_spec(args.site) if args.site else DEFAULT_NPCINK_SITE
    suffix = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir or DEFAULT_OUTPUT_ROOT / f"{target.label}-acceptance-{suffix}"
    try:
        report = build_acceptance_report(
            target=target,
            stage_report_path=args.stage_report,
            output_dir=output_dir,
            php_bin=args.php_bin,
            wp_bin=args.wp_bin,
            timeout_seconds=args.timeout_seconds,
            min_public_items=args.min_public_items,
            use_local_socket=not args.no_local_socket,
        )
    except ValueError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 2

    failed_checks = [
        _dict(item).get("name")
        for item in _list(report.get("checks"))
        if _dict(item).get("ok") is not True
    ]
    print(
        json.dumps(
            {
                "ok": report["ready_for_runtime_smoke_approval"],
                "mode": report["mode"],
                "output_dir": str(output_dir),
                "failed_checks": failed_checks,
            }
        )
    )
    return 0 if report["ready_for_runtime_smoke_approval"] is True else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
