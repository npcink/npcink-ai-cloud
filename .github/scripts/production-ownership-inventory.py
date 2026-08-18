from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import Session

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

CONTRACT = "npcink.production_ownership_inventory.v1"
MAX_RELEVANT_ROWS = 100_000
MAX_SAMPLES = 100
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
        raise RuntimeError("production ownership inventory requires PostgreSQL")
    return database_url


def _safe_identifier(value: object) -> bool:
    return isinstance(value, str) and OPAQUE_ID_PATTERN.fullmatch(value) is not None


def _sample(items: list[dict[str, str]]) -> dict[str, object]:
    ordered = sorted(items, key=lambda item: tuple(item.values()))
    return {
        "count": len(ordered),
        "samples": ordered[:MAX_SAMPLES],
        "truncated": len(ordered) > MAX_SAMPLES,
    }


def collect_inventory(session: Session) -> dict[str, Any]:
    model_counts = {
        "accounts": int(session.scalar(select(func.count()).select_from(Account)) or 0),
        "principals": int(session.scalar(select(func.count()).select_from(Principal)) or 0),
        "memberships": int(
            session.scalar(select(func.count()).select_from(AccountUserMembership)) or 0
        ),
        "sites": int(session.scalar(select(func.count()).select_from(Site)) or 0),
        "principal_site_bindings": int(
            session.scalar(select(func.count()).select_from(PrincipalSiteBinding)) or 0
        ),
    }
    relevant_rows = sum(model_counts.values())
    if relevant_rows > MAX_RELEVANT_ROWS:
        return {
            "contract": CONTRACT,
            "status": "blocked",
            "read_only": True,
            "generated_at": datetime.now(UTC).isoformat(),
            "counts": {**model_counts, "relevant_rows": relevant_rows},
            "violations": {
                "inventory_scope_exceeded": {
                    "count": relevant_rows,
                    "limit": MAX_RELEVANT_ROWS,
                    "samples": [],
                    "truncated": True,
                }
            },
            "warnings": {},
            "privacy": {
                "identifiers": "opaque principal/account/site IDs only",
                "customer_content": False,
                "emails": False,
                "credentials": False,
                "provider_subjects": False,
            },
        }

    accounts = list(session.execute(select(Account.account_id, Account.status)))
    principals = list(session.execute(select(Principal.principal_id, Principal.status)))
    memberships = list(
        session.execute(
            select(
                AccountUserMembership.principal_id,
                AccountUserMembership.account_id,
                AccountUserMembership.status,
            )
        )
    )
    sites = list(
        session.execute(
            select(
                Site.site_id,
                Site.account_id,
                Site.status,
                Site.ownership_released_at,
            )
        )
    )
    bindings = list(
        session.execute(
            select(
                PrincipalSiteBinding.principal_id,
                PrincipalSiteBinding.site_id,
                PrincipalSiteBinding.account_id,
                PrincipalSiteBinding.status,
                PrincipalSiteBinding.released_at,
            )
        )
    )

    account_by_id = {item.account_id: item for item in accounts}
    principal_by_id = {item.principal_id: item for item in principals}
    site_by_id = {item.site_id: item for item in sites}

    identifier_values = [
        *(item.account_id for item in accounts),
        *(item.principal_id for item in principals),
        *(item.account_id for item in memberships),
        *(item.principal_id for item in memberships),
        *(item.site_id for item in sites),
        *(item.account_id for item in sites if item.account_id is not None),
        *(item.principal_id for item in bindings),
        *(item.account_id for item in bindings),
        *(item.site_id for item in bindings),
    ]
    unsafe_identifier_count = sum(
        1 for identifier in identifier_values if not _safe_identifier(identifier)
    )

    valid_membership_pairs: set[tuple[str, str]] = set()
    valid_members_by_account: Counter[str] = Counter()
    for membership in memberships:
        account = account_by_id.get(membership.account_id)
        principal = principal_by_id.get(membership.principal_id)
        if (
            membership.status == ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE
            and account is not None
            and account.status == ACCOUNT_STATUS_ACTIVE
            and principal is not None
            and principal.status == PRINCIPAL_STATUS_ACTIVE
        ):
            pair = (membership.principal_id, membership.account_id)
            valid_membership_pairs.add(pair)
            valid_members_by_account[membership.account_id] += 1

    active_sites: dict[str, Any] = {}
    for site in sites:
        account = account_by_id.get(site.account_id or "")
        if (
            site.status == SITE_STATUS_ACTIVE
            and site.ownership_released_at is None
            and account is not None
            and account.status == ACCOUNT_STATUS_ACTIVE
        ):
            active_sites[site.site_id] = site

    lifecycle_violations: list[dict[str, str]] = []
    invalid_current_bindings: list[dict[str, str]] = []
    current_bindings_by_site: dict[str, list[Any]] = defaultdict(list)
    valid_bindings_by_site: dict[str, list[Any]] = defaultdict(list)

    for binding in bindings:
        lifecycle_valid = (
            binding.status == PRINCIPAL_SITE_BINDING_STATUS_ACTIVE
            and binding.released_at is None
        ) or (
            binding.status == PRINCIPAL_SITE_BINDING_STATUS_RELEASED
            and binding.released_at is not None
        )
        ids = {
            "principal_id": binding.principal_id,
            "account_id": binding.account_id,
            "site_id": binding.site_id,
        }
        if not lifecycle_valid and all(_safe_identifier(value) for value in ids.values()):
            lifecycle_violations.append(ids)

        if binding.released_at is not None:
            continue
        current_bindings_by_site[binding.site_id].append(binding)

        account = account_by_id.get(binding.account_id)
        principal = principal_by_id.get(binding.principal_id)
        site = site_by_id.get(binding.site_id)
        binding_valid = (
            binding.status == PRINCIPAL_SITE_BINDING_STATUS_ACTIVE
            and account is not None
            and account.status == ACCOUNT_STATUS_ACTIVE
            and principal is not None
            and principal.status == PRINCIPAL_STATUS_ACTIVE
            and site is not None
            and site.status == SITE_STATUS_ACTIVE
            and site.ownership_released_at is None
            and site.account_id == binding.account_id
            and (binding.principal_id, binding.account_id) in valid_membership_pairs
        )
        if binding_valid:
            valid_bindings_by_site[binding.site_id].append(binding)
        elif all(_safe_identifier(value) for value in ids.values()):
            invalid_current_bindings.append(ids)

    duplicate_current_sites = [
        {"site_id": site_id}
        for site_id, site_bindings in current_bindings_by_site.items()
        if len(site_bindings) > 1 and _safe_identifier(site_id)
    ]
    ambiguous_multi_user_sites: list[dict[str, str]] = []
    unbound_single_member_sites: list[dict[str, str]] = []
    active_sites_without_members: list[dict[str, str]] = []
    active_sites_without_accounts: list[dict[str, str]] = []

    for site in sites:
        if site.status != SITE_STATUS_ACTIVE or site.ownership_released_at is not None:
            continue
        if site.account_id is None or site.account_id not in account_by_id:
            if _safe_identifier(site.site_id):
                active_sites_without_accounts.append({"site_id": site.site_id})
            continue
        if site.site_id not in active_sites:
            continue
        member_count = valid_members_by_account[site.account_id]
        valid_binding_count = len(valid_bindings_by_site.get(site.site_id, []))
        ids = {"account_id": site.account_id, "site_id": site.site_id}
        if not all(_safe_identifier(value) for value in ids.values()):
            continue
        if member_count >= 2 and valid_binding_count != 1:
            ambiguous_multi_user_sites.append(ids)
        elif member_count == 1 and valid_binding_count == 0:
            unbound_single_member_sites.append(ids)
        elif member_count == 0:
            active_sites_without_members.append(ids)

    violations = {
        "unsafe_identifiers": {
            "count": unsafe_identifier_count,
            "samples": [],
            "truncated": unsafe_identifier_count > 0,
        },
        "binding_lifecycle_invalid": _sample(lifecycle_violations),
        "duplicate_current_site_bindings": _sample(duplicate_current_sites),
        "invalid_current_bindings": _sample(invalid_current_bindings),
        "ambiguous_multi_user_active_sites": _sample(ambiguous_multi_user_sites),
    }
    warnings = {
        "unbound_single_member_active_sites": _sample(unbound_single_member_sites),
        "active_sites_without_valid_members": _sample(active_sites_without_members),
        "active_sites_without_accounts": _sample(active_sites_without_accounts),
    }
    blocking_count = sum(int(item["count"]) for item in violations.values())

    return {
        "contract": CONTRACT,
        "status": "passed" if blocking_count == 0 else "blocked",
        "read_only": True,
        "generated_at": datetime.now(UTC).isoformat(),
        "counts": {
            **model_counts,
            "relevant_rows": relevant_rows,
            "active_accounts": sum(
                item.status == ACCOUNT_STATUS_ACTIVE for item in accounts
            ),
            "active_principals": sum(
                item.status == PRINCIPAL_STATUS_ACTIVE for item in principals
            ),
            "valid_active_memberships": len(valid_membership_pairs),
            "active_sites": len(active_sites),
            "multi_user_accounts": sum(
                member_count >= 2 for member_count in valid_members_by_account.values()
            ),
            "valid_current_site_bindings": sum(
                len(items) for items in valid_bindings_by_site.values()
            ),
        },
        "violations": violations,
        "warnings": warnings,
        "privacy": {
            "identifiers": "opaque principal/account/site IDs only",
            "customer_content": False,
            "emails": False,
            "credentials": False,
            "provider_subjects": False,
        },
    }


def main() -> int:
    with get_session(database_url_from_runtime_config()) as session:
        if session.bind is not None and session.bind.dialect.name == "postgresql":
            session.execute(text("SET TRANSACTION READ ONLY"))
        report = collect_inventory(session)
    print(json.dumps(report, ensure_ascii=True, sort_keys=True, separators=(",", ":")))
    return 0 if report["status"] == "passed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
