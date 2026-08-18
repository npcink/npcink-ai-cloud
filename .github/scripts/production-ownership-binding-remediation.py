from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_service_audit_repository import (
    CommercialServiceAuditRepository,
)
from app.core.db import get_session
from app.core.models import (
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
    PRINCIPAL_SITE_BINDING_STATUS_RELEASED,
    PRINCIPAL_STATUS_ACTIVE,
    SITE_STATUS_ACTIVE,
    Account,
    AccountUserMembership,
    Principal,
    PrincipalSiteBinding,
    Site,
)
from app.core.runtime_config import config_dir_from_environment, load_runtime_settings_values

CONTRACT = "npcink.production_ownership_binding_remediation.v1"
REPAIR_CONFIRMATION = "Release the invalid production ownership binding."
RELEASE_REASON = "operator_invalid_ownership_binding_repair"
OPAQUE_ID_PATTERN = re.compile(r"[A-Za-z0-9:_-]{1,191}\Z")


def database_url_from_runtime_config() -> str:
    runtime_values = load_runtime_settings_values(config_dir_from_environment())
    database_url = runtime_values.get("database_url")
    if (
        not isinstance(database_url, str)
        or not database_url
        or database_url != database_url.strip()
    ):
        raise RuntimeError("production database URL is missing or malformed")
    try:
        backend_name = make_url(database_url).get_backend_name()
    except (ArgumentError, TypeError, ValueError) as error:
        raise RuntimeError("production database URL is missing or malformed") from error
    if backend_name != "postgresql":
        raise RuntimeError("production ownership remediation requires PostgreSQL")
    return database_url


def _safe_identifier(value: object) -> bool:
    return isinstance(value, str) and OPAQUE_ID_PATTERN.fullmatch(value) is not None


def _finding_token(item: dict[str, Any]) -> str:
    payload = {
        "binding_id": item["binding_id"],
        "principal_id": item["principal_id"],
        "account_id": item["account_id"],
        "site_id": item["site_id"],
        "reasons": item["reasons"],
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def collect_invalid_current_bindings(
    session: Session,
    *,
    for_update: bool = False,
) -> list[dict[str, Any]]:
    binding_statement = select(
        PrincipalSiteBinding.binding_id,
        PrincipalSiteBinding.principal_id,
        PrincipalSiteBinding.account_id,
        PrincipalSiteBinding.site_id,
        PrincipalSiteBinding.status,
        PrincipalSiteBinding.released_at,
    ).where(PrincipalSiteBinding.released_at.is_(None))
    if for_update:
        binding_statement = binding_statement.with_for_update()
    bindings = list(session.execute(binding_statement))
    accounts = {
        item.account_id: item.status
        for item in session.execute(select(Account.account_id, Account.status))
    }
    principals = {
        item.principal_id: item.status
        for item in session.execute(select(Principal.principal_id, Principal.status))
    }
    sites = {
        item.site_id: item
        for item in session.execute(
            select(
                Site.site_id,
                Site.account_id,
                Site.status,
                Site.ownership_released_at,
            )
        )
    }
    active_memberships = {
        (item.principal_id, item.account_id)
        for item in session.execute(
            select(
                AccountUserMembership.principal_id,
                AccountUserMembership.account_id,
                AccountUserMembership.status,
            )
        )
        if item.status == ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE
    }

    findings: list[dict[str, Any]] = []
    for binding in bindings:
        identifiers = (
            binding.binding_id,
            binding.principal_id,
            binding.account_id,
            binding.site_id,
        )
        if not all(_safe_identifier(value) for value in identifiers):
            raise RuntimeError("ownership binding contains a non-opaque identifier")

        reasons: list[str] = []
        account_status = accounts.get(binding.account_id)
        principal_status = principals.get(binding.principal_id)
        site = sites.get(binding.site_id)
        if binding.status != PRINCIPAL_SITE_BINDING_STATUS_ACTIVE:
            reasons.append("binding_not_active")
        if account_status is None:
            reasons.append("account_missing")
        elif account_status != ACCOUNT_STATUS_ACTIVE:
            reasons.append("account_not_active")
        if principal_status is None:
            reasons.append("principal_missing")
        elif principal_status != PRINCIPAL_STATUS_ACTIVE:
            reasons.append("principal_not_active")
        if site is None:
            reasons.append("site_missing")
        else:
            if site.status != SITE_STATUS_ACTIVE:
                reasons.append("site_not_active")
            if site.ownership_released_at is not None:
                reasons.append("site_ownership_released")
            if site.account_id != binding.account_id:
                reasons.append("site_account_mismatch")
        if (binding.principal_id, binding.account_id) not in active_memberships:
            reasons.append("membership_not_active")
        if not reasons:
            continue

        item: dict[str, Any] = {
            "binding_id": binding.binding_id,
            "principal_id": binding.principal_id,
            "account_id": binding.account_id,
            "site_id": binding.site_id,
            "status": binding.status,
            "reasons": sorted(reasons),
        }
        item["finding_token"] = _finding_token(item)
        findings.append(item)
    return sorted(findings, key=lambda item: item["finding_token"])


def diagnose(session: Session) -> dict[str, Any]:
    findings = collect_invalid_current_bindings(session)
    return {
        "contract": CONTRACT,
        "mode": "diagnose",
        "status": "repairable" if len(findings) == 1 else "blocked",
        "read_only": True,
        "generated_at": datetime.now(UTC).isoformat(),
        "invalid_current_bindings": {
            "count": len(findings),
            "samples": [
                {
                    "finding_token": item["finding_token"],
                    "reasons": item["reasons"],
                }
                for item in findings
            ],
        },
        "privacy": {
            "identifiers": "finding token and reason codes only",
            "customer_content": False,
            "emails": False,
            "credentials": False,
            "provider_subjects": False,
        },
    }


def release_invalid_binding(
    session: Session,
    *,
    expected_finding_token: str,
    confirmation: str,
) -> dict[str, Any]:
    if confirmation != REPAIR_CONFIRMATION:
        raise RuntimeError("ownership binding repair confirmation is invalid")
    if not re.fullmatch(r"[0-9a-f]{64}", expected_finding_token):
        raise RuntimeError("ownership binding finding token is malformed")

    findings = collect_invalid_current_bindings(session, for_update=True)
    if len(findings) != 1:
        raise RuntimeError("ownership binding repair requires exactly one invalid binding")
    finding = findings[0]
    if finding["finding_token"] != expected_finding_token:
        raise RuntimeError("ownership binding finding token no longer matches")
    if finding["status"] != PRINCIPAL_SITE_BINDING_STATUS_ACTIVE:
        raise RuntimeError("ownership binding repair requires an active current binding")

    current_site_binding_count = int(
        session.scalar(
            select(func.count())
            .select_from(PrincipalSiteBinding)
            .where(
                PrincipalSiteBinding.site_id == finding["site_id"],
                PrincipalSiteBinding.released_at.is_(None),
            )
        )
        or 0
    )
    if current_site_binding_count != 1:
        raise RuntimeError("ownership binding repair found an ambiguous current site binding")

    released_at = datetime.now(UTC)
    result = session.execute(
        update(PrincipalSiteBinding)
        .where(
            PrincipalSiteBinding.binding_id == finding["binding_id"],
            PrincipalSiteBinding.status == PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
            PrincipalSiteBinding.released_at.is_(None),
        )
        .values(
            status=PRINCIPAL_SITE_BINDING_STATUS_RELEASED,
            released_at=released_at,
            release_reason=RELEASE_REASON,
        )
    )
    if result.rowcount != 1:
        raise RuntimeError("ownership binding repair lost its compare-and-set race")

    CommercialServiceAuditRepository(session).record_service_audit_event(
        account_id=finding["account_id"],
        site_id=finding["site_id"],
        key_id=None,
        subscription_id=None,
        plan_id=None,
        plan_version_id=None,
        scope_kind="principal_site_binding",
        scope_id=finding["binding_id"],
        event_kind="ownership.binding.release",
        outcome="succeeded",
        method="workflow",
        path="production-maintenance",
        trace_id=None,
        idempotency_key=expected_finding_token,
        actor_kind="platform_admin",
        actor_ref="github_actions",
        payload_json={
            "finding_token": expected_finding_token,
            "previous_status": finding["status"],
            "reasons": finding["reasons"],
            "release_reason": RELEASE_REASON,
        },
    )
    session.commit()
    return {
        "contract": CONTRACT,
        "mode": "release",
        "status": "repaired",
        "generated_at": datetime.now(UTC).isoformat(),
        "released_bindings": 1,
        "finding_token": expected_finding_token,
        "reasons": finding["reasons"],
        "site_account_or_principal_changed": False,
        "privacy": {
            "identifiers": "finding token and reason codes only",
            "customer_content": False,
            "emails": False,
            "credentials": False,
            "provider_subjects": False,
        },
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in {"diagnose", "release"}:
        raise RuntimeError("usage: remediation.py diagnose|release [finding-token confirmation]")
    mode = argv[1]
    with get_session(database_url_from_runtime_config()) as session:
        if mode == "diagnose":
            if session.bind is not None and session.bind.dialect.name == "postgresql":
                session.execute(text("SET TRANSACTION READ ONLY"))
            report = diagnose(session)
        else:
            if len(argv) != 4:
                raise RuntimeError("release requires a finding token and confirmation")
            if session.bind is not None and session.bind.dialect.name == "postgresql":
                session.execute(text("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"))
            report = release_invalid_binding(
                session,
                expected_finding_token=argv[2],
                confirmation=argv[3],
            )
    print(json.dumps(report, ensure_ascii=True, sort_keys=True, separators=(",", ":")))
    return 0 if report["status"] in {"repairable", "repaired"} else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
