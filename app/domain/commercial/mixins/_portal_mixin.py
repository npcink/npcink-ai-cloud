"""Commercial service: portal operations mixin."""

from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, cast
from uuid import uuid4

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import get_session
from app.core.models import (
    PORTAL_LOGIN_CODE_STATUS_CONSUMED,
    PORTAL_LOGIN_CODE_STATUS_EXPIRED,
    PORTAL_LOGIN_CODE_STATUS_LOCKED,
    SITE_ADMIN_SITE_GRANT_STATUS_ACTIVE,
    SITE_ADMIN_SITE_GRANT_STATUS_REVOKED,
    SITE_ADMIN_STATUS_ACTIVE,
    SITE_ADMIN_STATUS_DISABLED,
    Site,
)
from app.core.security import build_secret_hash
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import (
    CommercialPermissionError,
    CommercialValidationError,
)
from app.domain.commercial.identity import (
    IDENTITY_TYPE_SITE_ADMIN,
    SITE_ADMIN_ROLE_SITE_ADMIN,
    _build_site_admin_ref,
    _normalize_site_admin_email,
    resolve_site_admin_allowed_actions,
)
from app.domain.commercial.mixins._audit_mixin import CommercialServiceAuditMixin


class CommercialServicePortalMixin(CommercialServiceAuditMixin):
    def issue_portal_login_code(
        self,
        *,
        email: str,
        ttl_seconds: int,
    ) -> dict[str, object]:
        login = self.resolve_site_admin_login(email=email)
        normalized_email = str(login.get("email") or "").strip().lower()
        site_admin_ref = str(login.get("site_admin_ref") or "").strip()
        now = self.now_factory()
        expires_at = now + timedelta(seconds=max(60, int(ttl_seconds or 0)))
        code = f"{secrets.randbelow(1_000_000):06d}"
        code_hash = build_secret_hash(code)

        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            existing_codes = repository.list_portal_login_codes(
                email=normalized_email,
                site_admin_ref=site_admin_ref,
                active_only=True,
                now=now,
                limit=None,
            )
            for existing in existing_codes:
                existing.status = PORTAL_LOGIN_CODE_STATUS_EXPIRED
                existing.consumed_at = now
            repository.create_portal_login_code(
                code_id=f"plc_{uuid4().hex}",
                email=normalized_email,
                site_admin_ref=site_admin_ref,
                code_hash=code_hash,
                expires_at=expires_at,
                metadata_json={"accounts": login.get("accounts") or []},
            )
            session.commit()
        return {
            "email": normalized_email,
            "site_admin_ref": site_admin_ref,
            "code": code,
            "expires_at": self._serialize_datetime(expires_at),
            "expires_in_seconds": max(60, int(ttl_seconds or 0)),
            "accounts": login.get("accounts") or [],
        }

    def verify_portal_login_code(
        self,
        *,
        email: str,
        code: str,
        max_attempts: int,
        login_at: datetime | None = None,
    ) -> dict[str, object]:
        normalized_email = str(email or "").strip().lower()
        normalized_code = str(code or "").strip()
        if not normalized_email or "@" not in normalized_email or " " in normalized_email:
            raise CommercialPermissionError(
                "service.portal_email_invalid",
                "a valid portal email is required",
            )
        if not normalized_code or not normalized_code.isdigit():
            raise CommercialPermissionError(
                "service.portal_login_code_invalid",
                "portal login code is invalid",
            )

        now = login_at or self.now_factory()
        bounded_attempts = max(1, int(max_attempts or 0))
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            active_codes = repository.list_portal_login_codes(
                email=normalized_email,
                active_only=True,
                now=now,
                limit=1,
            )
            if not active_codes:
                raise CommercialPermissionError(
                    "service.portal_login_code_invalid",
                    "portal login code is invalid",
                )
            active_code = active_codes[0]
            if build_secret_hash(normalized_code) != str(active_code.code_hash or ""):
                active_code.attempt_count = int(active_code.attempt_count or 0) + 1
                if active_code.attempt_count >= bounded_attempts:
                    active_code.status = PORTAL_LOGIN_CODE_STATUS_LOCKED
                    active_code.consumed_at = now
                session.commit()
                raise CommercialPermissionError(
                    "service.portal_login_code_invalid",
                    "portal login code is invalid",
                )
            active_code.status = PORTAL_LOGIN_CODE_STATUS_CONSUMED
            active_code.consumed_at = now
            site_admin_ref = str(active_code.site_admin_ref or "").strip()
            identity = repository.get_site_admin_identity_by_ref(
                site_admin_ref=site_admin_ref,
            )
            grants = repository.list_sites_for_site_admin(
                site_admin_ref=site_admin_ref,
                grant_statuses=[SITE_ADMIN_SITE_GRANT_STATUS_ACTIVE],
            )
            if identity is None or not grants:
                raise CommercialPermissionError(
                    "service.site_admin_access_required",
                    f"site admin '{site_admin_ref}' is not active for any accessible site",
                )
            identity.last_login_at = now
            session.commit()
        return {
            "email": normalized_email,
            "site_admin_ref": site_admin_ref,
            "last_login_at": self._serialize_datetime(now),
            "site_grants": [
                {
                    "site_id": site.site_id,
                    "grant_id": grant.grant_id,
                    "status": grant.status,
                }
                for site, _identity, grant in grants
            ],
        }

    def list_portal_accounts(
        self,
        *,
        site_admin_ref: str,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            candidate_sites = repository.list_sites_for_site_admin(
                site_admin_ref=site_admin_ref,
                grant_statuses=[SITE_ADMIN_SITE_GRANT_STATUS_ACTIVE],
            )
            sites_by_account: defaultdict[str, list[Site]] = defaultdict(list)
            accounts_by_id: dict[str, object] = {}
            for site, _identity, _grant in candidate_sites:
                if site.account_id:
                    sites_by_account[site.account_id].append(site)
                    account = repository.get_account(site.account_id)
                    if account is not None:
                        accounts_by_id[site.account_id] = account
            return {
                "site_admin_ref": site_admin_ref,
                "items": [
                    {
                        "account_id": str(getattr(account, "account_id", "") or ""),
                        "name": str(getattr(account, "name", "") or ""),
                        "status": str(getattr(account, "status", "") or ""),
                        "site_admin_ref": site_admin_ref,
                        "identity_type": IDENTITY_TYPE_SITE_ADMIN,
                        "allowed_actions": resolve_site_admin_allowed_actions(),
                        "role": SITE_ADMIN_ROLE_SITE_ADMIN,
                        "site_count": len(
                            sites_by_account.get(
                                str(getattr(account, "account_id", "") or ""),
                                [],
                            )
                        ),
                        "sites": [
                            cast(Any, self)._serialize_site(site)
                            for site in sites_by_account.get(
                                str(getattr(account, "account_id", "") or ""),
                                [],
                            )
                        ],
                    }
                    for account in accounts_by_id.values()
                ],
            }

    def upsert_site_admin_access(
        self,
        *,
        site_id: str,
        email: str,
        status: str = SITE_ADMIN_STATUS_ACTIVE,
        metadata_json: dict[str, object] | None = None,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        normalized_email = _normalize_site_admin_email(email)
        site_admin_ref = _build_site_admin_ref(normalized_email)
        normalized_status = str(status or SITE_ADMIN_STATUS_ACTIVE).strip().lower()
        if normalized_status not in {SITE_ADMIN_STATUS_ACTIVE, SITE_ADMIN_STATUS_DISABLED}:
            raise CommercialValidationError(
                "service.site_admin_status_invalid",
                "site admin status must be active or disabled",
            )
        grant_status = (
            SITE_ADMIN_SITE_GRANT_STATUS_ACTIVE
            if normalized_status == SITE_ADMIN_STATUS_ACTIVE
            else SITE_ADMIN_SITE_GRANT_STATUS_REVOKED
        )
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site(site_id)
            if site is None:
                raise CommercialPermissionError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            identity = repository.upsert_site_admin_identity(
                site_admin_id=f"sadm_{uuid4().hex}",
                site_admin_ref=site_admin_ref,
                email=normalized_email,
                status=normalized_status,
                metadata_json=metadata_json,
            )
            grant = repository.upsert_site_admin_site_grant(
                grant_id=f"sadmg_{uuid4().hex}",
                site_admin_id=identity.site_admin_id,
                site_id=site_id,
                status=grant_status,
                metadata_json={
                    **dict(metadata_json or {}),
                    "source": str((metadata_json or {}).get("source") or "site_admin_access"),
                },
            )
            payload = {
                "site_admin_id": identity.site_admin_id,
                "site_admin_ref": identity.site_admin_ref,
                "email": identity.email,
                "status": identity.status,
                "site_id": site_id,
                "grant_id": grant.grant_id,
                "grant_status": grant.status,
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site_admin_access.upsert",
                outcome="succeeded",
                account_id=str(getattr(site, "account_id", "") or ""),
                site_id=site_id,
                scope_kind="site_admin_access",
                scope_id=f"{site_id}:{site_admin_ref}",
                payload_json=payload,
            )
            session.commit()
        return payload

    def resolve_site_admin_login(self, *, email: str) -> dict[str, object]:
        normalized_email = _normalize_site_admin_email(email)
        site_admin_ref = _build_site_admin_ref(normalized_email)
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_site_admin_identity_by_ref(
                site_admin_ref=site_admin_ref,
            )
            candidate_sites = repository.list_sites_for_site_admin(
                site_admin_ref=site_admin_ref,
                grant_statuses=[SITE_ADMIN_SITE_GRANT_STATUS_ACTIVE],
            )
        if identity is None or not candidate_sites:
            raise CommercialPermissionError(
                "service.site_admin_email_not_found",
                f"no site-admin access was found for '{normalized_email}'",
            )
        site_items = [
            {
                "site_admin_ref": site_admin_ref,
                "identity_type": IDENTITY_TYPE_SITE_ADMIN,
                "allowed_actions": resolve_site_admin_allowed_actions(),
                "role": SITE_ADMIN_ROLE_SITE_ADMIN,
                "status": grant.status,
                "site": cast(Any, self)._serialize_site(site),
            }
            for site, _identity, grant in candidate_sites
        ]
        account_ids = {
            str(getattr(site, "account_id", "") or "")
            for site, _identity, _grant in candidate_sites
            if str(getattr(site, "account_id", "") or "").strip()
        }
        return {
            "email": normalized_email,
            "site_admin_ref": site_admin_ref,
            "sites": site_items,
            "accounts": [
                item
                for item in self.list_portal_accounts(site_admin_ref=site_admin_ref).get(
                    "items",
                    [],
                )
                if str(item.get("account_id") or "") in account_ids
            ],
        }

    def _resolve_portal_target_package_tier_id(self, target_package: str) -> str:
        normalized = str(target_package or "").strip().lower()
        mapping = {
            "free": "free",
            "pro": "pro",
            "agency": "agency",
        }
        tier_id = mapping.get(normalized)
        if tier_id:
            return tier_id
        raise CommercialValidationError(
            "service.invalid_target_package",
            "target package must be Free, Pro, or Agency",
        )
