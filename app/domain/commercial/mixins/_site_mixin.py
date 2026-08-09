"""Commercial service: site and site-key operations mixin."""

from __future__ import annotations

import secrets
from collections import Counter
from datetime import UTC, datetime, timedelta
from math import ceil
from typing import Any, cast
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.callback_security import (
    RuntimeCallbackTargetValidationError,
    validate_runtime_callback_target,
)
from app.core.db import get_session
from app.core.models import (
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    PLATFORM_KIND_WORDPRESS,
    PORTAL_OAUTH_STATE_STATUS_CONSUMED,
    PORTAL_OAUTH_STATE_STATUS_EXPIRED,
    PORTAL_OAUTH_STATE_STATUS_PENDING,
    PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
    PRINCIPAL_SITE_BINDING_STATUS_RELEASED,
    PRINCIPAL_STATUS_ACTIVE,
    SITE_ACCOUNT_BINDING_STATUS_ACTIVE,
    SITE_ACCOUNT_BINDING_STATUS_RELEASED,
    SITE_API_KEY_STATUS_ACTIVE,
    SITE_API_KEY_STATUS_EXPIRED,
    SITE_API_KEY_STATUS_REVOKED,
    SITE_STATUS_ACTIVE,
    SITE_STATUS_ARCHIVED,
    SITE_STATUS_INACTIVE,
    SITE_STATUS_PROVISIONING,
    SITE_STATUS_SUSPENDED,
    SUBSCRIPTION_STATUS_ACTIVE,
    SUBSCRIPTION_STATUS_TRIALING,
    AccountSubscription,
    PrincipalSiteBinding,
    Site,
    SiteAccountBinding,
    SiteApiKey,
)
from app.core.secrets import (
    decrypt_addon_connection_payload,
    encrypt_addon_connection_payload,
    encrypt_runtime_terminal_callback_secret,
    encrypt_site_api_signing_secret,
)
from app.core.security import build_secret_hash
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.customer_api_keys import (
    DEFAULT_PORTAL_RUNTIME_SCOPES,
    build_customer_api_key,
    expand_api_key_scopes,
    validate_api_key_scopes_for_issue,
)
from app.domain.commercial.errors import (
    CommercialConflictError,
    CommercialNotFoundError,
    CommercialPermissionError,
    CommercialValidationError,
)
from app.domain.commercial.identity import (
    IDENTITY_TYPE_USER,
    USER_ALLOWED_ACTION_PROVISION_SITES,
    USER_ROLE_OWNER,
    _extract_site_url,
    _normalize_portal_site_url,
    _slugify_portal_site_segment,
    normalize_user_role,
)
from app.domain.commercial.mixins._audit_mixin import CommercialServiceAuditMixin
from app.domain.commercial.service import (
    DEFAULT_PLAN_TIER_ID,
    PLAN_TIER_REGISTRY,
)
from app.domain.service_settings import resolve_site_relink_policy

WORDPRESS_ADDON_CONNECTION_PROVIDER = "wordpress_addon_connection"
WORDPRESS_ADDON_CONNECTION_TTL_SECONDS = 10 * 60


def _assert_portal_addon_connection_access(
    *,
    repository: CommercialRepository,
    account_id: str,
    principal_id: str,
) -> None:
    membership_row = repository.get_account_user_membership(
        principal_id=principal_id,
        account_id=account_id,
    )
    if membership_row is None:
        raise CommercialPermissionError(
            "service.principal_access_required",
            "portal account access is required",
        )
    account, identity, membership = membership_row
    allowed_actions = {
        str(action).strip()
        for action in (membership.allowed_actions_json or [])
        if str(action).strip()
    }
    if (
        str(account.status or "") != ACCOUNT_STATUS_ACTIVE
        or str(identity.status or "") != PRINCIPAL_STATUS_ACTIVE
        or str(membership.status or "") != ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE
        or USER_ALLOWED_ACTION_PROVISION_SITES not in allowed_actions
    ):
        raise CommercialPermissionError(
            "service.principal_access_required",
            "portal account access is required",
        )


def _hash_addon_connection_value(value: str, *, prefix: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise CommercialValidationError(
            "service.wordpress_addon_connection_value_required",
            "wordpress addon connection value is required",
        )
    return build_secret_hash(f"{WORDPRESS_ADDON_CONNECTION_PROVIDER}:{prefix}:{normalized}")


def _normalize_addon_return_url(value: str) -> str:
    raw = str(value or "").strip()
    parsed = urlsplit(raw)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or bool(parsed.fragment)
    ):
        raise CommercialValidationError(
            "service.wordpress_addon_return_url_invalid",
            "wordpress addon return_url must be an absolute http or https URL",
        )
    safe_query = [
        (key, item)
        for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in {"code", "state"}
    ]
    normalized = urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(safe_query),
            parsed.fragment,
        )
    )
    if len(normalized) > 2048:
        raise CommercialValidationError(
            "service.wordpress_addon_return_url_invalid",
            "wordpress addon return_url is too long",
        )
    return normalized


def _addon_host_key(value: str) -> str:
    hostname = str(urlsplit(value).hostname or "").strip().lower()
    if hostname == "localhost" or hostname.startswith("127."):
        return "loopback"
    return hostname


def _append_addon_return_query(return_url: str, *, code: str, state: str) -> str:
    parsed = urlsplit(return_url)
    query = [
        (key, item)
        for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in {"code", "state"}
    ]
    query.append(("code", code))
    if state:
        query.append(("state", state))
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(query),
            parsed.fragment,
        )
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _get_active_addon_subscription(
    repository: CommercialRepository,
    account_id: str,
) -> AccountSubscription | None:
    subscription = repository.get_runtime_subscription(account_id)
    if subscription is None or str(subscription.status or "") not in {
        SUBSCRIPTION_STATUS_ACTIVE,
        SUBSCRIPTION_STATUS_TRIALING,
    }:
        return None
    return subscription


class CommercialServiceSiteMixin(CommercialServiceAuditMixin):
    def _site_capacity_projection_in_session(
        self,
        *,
        repository: CommercialRepository,
        account_id: str,
        snapshot: object | None = None,
    ) -> dict[str, object]:
        resolved_snapshot = snapshot
        if resolved_snapshot is None:
            subscription = repository.get_runtime_subscription(account_id)
            if subscription is not None:
                resolved_snapshot = repository.get_active_entitlement_snapshot(
                    account_id,
                    subscription_id=subscription.subscription_id,
                )
        resolved_plan_version = None
        if resolved_snapshot is not None:
            plan_version_id = str(
                getattr(resolved_snapshot, "plan_version_id", "") or ""
            ).strip()
            if plan_version_id:
                resolved_plan_version = repository.get_plan_version(plan_version_id)
        plan_version_metadata = (
            getattr(resolved_plan_version, "metadata_json", None) or {}
            if resolved_plan_version is not None
            else {}
        )
        if (
            resolved_plan_version is not None
            and plan_version_metadata.get("site_limit") is not None
        ):
            active_limit = cast(Any, self)._resolve_site_limit(
                plan_version=resolved_plan_version
            )
        elif resolved_snapshot is not None:
            active_limit = cast(Any, self)._resolve_site_limit(
                snapshot=resolved_snapshot
            )
        else:
            active_limit = max(
                0,
                self._coerce_int(
                    PLAN_TIER_REGISTRY[DEFAULT_PLAN_TIER_ID].get("site_limit")
                ),
            )
        bound_limit = max(3, active_limit * 3)
        active_count = self._coerce_int(
            repository.count_sites_by_account(
                account_ids=[account_id],
                statuses=[SITE_STATUS_ACTIVE],
            ).get(account_id, 0)
        )
        bound_count = self._coerce_int(
            repository.count_sites_by_account(
                account_ids=[account_id],
                statuses=[
                    SITE_STATUS_ACTIVE,
                    SITE_STATUS_PROVISIONING,
                    SITE_STATUS_SUSPENDED,
                    SITE_STATUS_INACTIVE,
                ],
            ).get(account_id, 0)
        )
        active_sites = [
            {
                "site_id": str(site.site_id or ""),
                "name": str(site.name or ""),
                "site_url": str(site.site_url or ""),
                "platform_kind": str(site.platform_kind or ""),
                "status": str(site.status or ""),
            }
            for site in repository.list_sites(
                account_id=account_id,
                status=SITE_STATUS_ACTIVE,
                limit=None,
            )
        ]
        return {
            "active_count": active_count,
            "active_limit": active_limit,
            "active_remaining": max(0, active_limit - active_count),
            "bound_count": bound_count,
            "bound_limit": bound_limit,
            "bound_remaining": max(0, bound_limit - bound_count),
            "active_sites": active_sites,
        }

    def _assert_cross_account_relink_available(
        self,
        *,
        site: Site,
        account_id: str,
        now: datetime,
        policy: dict[str, Any],
    ) -> bool:
        current_account_id = str(site.account_id or "").strip()
        if current_account_id == account_id:
            return False
        if (
            str(site.status or "") != SITE_STATUS_ARCHIVED
            or _as_utc(site.ownership_released_at) is None
        ):
            raise CommercialConflictError(
                "service.portal_site_conflict",
                f"site id '{site.site_id}' is already bound to another account",
            )
        if not bool(policy.get("enabled", True)):
            raise CommercialConflictError(
                "service.site_cross_account_relink_disabled",
                "cross-account site relink is disabled",
            )
        cooldown_until = _as_utc(site.relink_cooldown_until)
        if cooldown_until is None:
            raise CommercialConflictError(
                "service.site_relink_release_incomplete",
                "site ownership release does not have a relink cooldown boundary",
            )
        if cooldown_until > now:
            released_at = _as_utc(site.ownership_released_at)
            effective_cooldown_days = int(policy.get("cooldown_days") or 0)
            if released_at is not None:
                effective_cooldown_days = max(
                    0,
                    ceil((cooldown_until - released_at).total_seconds() / 86400),
                )
            raise CommercialConflictError(
                "service.site_relink_cooldown_active",
                "site cannot be linked to another account until its cooldown expires",
                data={
                    "retry_after_at": self._serialize_datetime(cooldown_until),
                    "cooldown_days": effective_cooldown_days,
                },
            )
        return True

    def _ensure_site_account_binding_in_session(
        self,
        *,
        repository: CommercialRepository,
        site: Site,
        account_id: str,
        now: datetime,
        source: str,
    ) -> SiteAccountBinding:
        current = repository.get_current_site_account_binding(
            site.site_id,
            for_update=True,
        )
        if current is not None:
            if str(current.account_id or "") != account_id:
                raise CommercialConflictError(
                    "service.site_account_binding_conflict",
                    f"site '{site.site_id}' has another active account binding",
                )
            return current
        return repository.create_site_account_binding(
            binding_id=f"sab_{uuid4().hex}",
            site_id=site.site_id,
            account_id=account_id,
            status=SITE_ACCOUNT_BINDING_STATUS_ACTIVE,
            bound_at=now,
            metadata_json={"source": source},
        )

    def _release_site_account_binding_in_session(
        self,
        *,
        repository: CommercialRepository,
        site: Site,
        now: datetime,
        cooldown_until: datetime,
        reason: str,
    ) -> SiteAccountBinding:
        current = self._ensure_site_account_binding_in_session(
            repository=repository,
            site=site,
            account_id=str(site.account_id or ""),
            now=site.provisioned_at or site.created_at or now,
            source="release_backfill",
        )
        current.status = SITE_ACCOUNT_BINDING_STATUS_RELEASED
        current.released_at = now
        current.cooldown_until = cooldown_until
        current.release_reason = reason
        current_metadata = dict(current.metadata_json or {})
        current_metadata["released_via"] = reason
        current.metadata_json = current_metadata
        return current

    def _bind_site_to_account_in_session(
        self,
        *,
        repository: CommercialRepository,
        site: Site,
        account_id: str,
        now: datetime,
        source: str,
    ) -> SiteAccountBinding:
        binding = self._ensure_site_account_binding_in_session(
            repository=repository,
            site=site,
            account_id=account_id,
            now=now,
            source=source,
        )
        site.account_id = account_id
        site.ownership_released_at = None
        site.relink_cooldown_until = None
        return binding

    def _ensure_principal_site_binding_in_session(
        self,
        *,
        repository: CommercialRepository,
        site: Site,
        principal_id: str,
        account_id: str,
        now: datetime,
        source: str,
    ) -> PrincipalSiteBinding:
        current = repository.get_current_principal_site_binding(
            site.site_id,
            for_update=True,
        )
        if current is not None:
            if (
                str(current.principal_id or "") != principal_id
                or str(current.account_id or "") != account_id
            ):
                raise CommercialConflictError(
                    "service.site_user_binding_conflict",
                    f"site '{site.site_id}' is already bound to another user",
                )
            return current
        return repository.create_principal_site_binding(
            binding_id=f"psb_{uuid4().hex}",
            principal_id=principal_id,
            site_id=site.site_id,
            account_id=account_id,
            status=PRINCIPAL_SITE_BINDING_STATUS_ACTIVE,
            bound_at=now,
            metadata_json={"source": source},
        )

    def _release_principal_site_binding_in_session(
        self,
        *,
        repository: CommercialRepository,
        site: Site,
        principal_id: str,
        now: datetime,
        reason: str,
    ) -> PrincipalSiteBinding:
        current = repository.get_current_principal_site_binding(
            site.site_id,
            for_update=True,
        )
        if current is None or str(current.principal_id or "") != principal_id:
            raise CommercialPermissionError(
                "service.principal_site_access_required",
                "portal user is not bound to this site",
            )
        current.status = PRINCIPAL_SITE_BINDING_STATUS_RELEASED
        current.released_at = now
        current.release_reason = reason
        current_metadata = dict(current.metadata_json or {})
        current_metadata["released_via"] = reason
        current.metadata_json = current_metadata
        return current

    def _assert_default_free_site_capacity(
        self,
        *,
        repository: CommercialRepository,
        account_id: str,
    ) -> None:
        site_limit = max(
            0,
            self._coerce_int(
                PLAN_TIER_REGISTRY[DEFAULT_PLAN_TIER_ID].get("site_limit")
            ),
        )
        site_counts = repository.count_sites_by_account(
            account_ids=[account_id],
            statuses=[
                SITE_STATUS_ACTIVE,
            ],
        )
        current_count = self._coerce_int(site_counts.get(account_id, 0))
        if site_limit > 0 and current_count >= site_limit:
            raise CommercialPermissionError(
                "service.site_limit_exceeded",
                f"account '{account_id}' has reached its active site limit for the pending Free activation",
            )

    def _assert_account_site_bind_capacity(
        self,
        *,
        repository: CommercialRepository,
        account_id: str,
        site_limit: int,
    ) -> None:
        # Serialize bind-capacity checks per account so concurrent
        # provisioning/reconnect requests cannot both observe the same count
        # and overshoot the bound-site ceiling after commit.
        if repository.get_account_for_update(account_id) is None:
            raise CommercialNotFoundError(
                "service.account_not_found",
                f"account '{account_id}' was not found",
            )
        # Binding is not capped by the activation site_limit: accounts may bind
        # multiple sites, while only site_limit of them may be active at once.
        # A soft bind ceiling (max 3, or 3x the activation limit) prevents
        # unbounded accumulation of bound-but-inactive sites.
        bind_limit = max(3, self._coerce_int(site_limit) * 3)
        site_counts = repository.count_sites_by_account(
            account_ids=[account_id],
            statuses=[
                SITE_STATUS_ACTIVE,
                SITE_STATUS_PROVISIONING,
                SITE_STATUS_SUSPENDED,
                SITE_STATUS_INACTIVE,
            ],
        )
        current_count = self._coerce_int(site_counts.get(account_id, 0))
        if current_count >= bind_limit:
            raise CommercialPermissionError(
                "service.site_bind_limit_exceeded",
                f"account '{account_id}' has reached its bound-site soft limit of {bind_limit}",
            )

    def _assert_site_activation_capacity_in_session(
        self,
        *,
        repository: CommercialRepository,
        account_id: str,
    ) -> None:
        # Serialize activation capacity checks per account so concurrent
        # activation requests cannot both count the same active-site set and
        # exceed site_limit after commit.
        if repository.get_account_for_update(account_id) is None:
            raise CommercialNotFoundError(
                "service.account_not_found",
                f"account '{account_id}' was not found",
            )
        subscription = repository.get_runtime_subscription(account_id)
        snapshot = (
            repository.get_active_entitlement_snapshot(
                account_id,
                subscription_id=subscription.subscription_id,
            )
            if subscription is not None
            else None
        )
        if snapshot is not None:
            cast(Any, self)._assert_account_site_capacity(
                repository=repository,
                account_id=account_id,
                snapshot=snapshot,
            )
        else:
            self._assert_default_free_site_capacity(
                repository=repository,
                account_id=account_id,
            )

    def _revoke_active_site_keys_in_session(
        self,
        *,
        repository: CommercialRepository,
        site_id: str,
        now: datetime,
        audit_context: ServiceAuditContext | None,
        reason: str,
    ) -> list[str]:
        revoked_key_ids: list[str] = []
        for api_key in repository.list_site_keys(site_id):
            if str(api_key.status or "") != SITE_API_KEY_STATUS_ACTIVE:
                continue
            api_key.status = SITE_API_KEY_STATUS_REVOKED
            api_key.revoked_at = now
            revoked_key_ids.append(api_key.key_id)
            key_payload = self._serialize_site_key(api_key)
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site_key.revoke",
                outcome="succeeded",
                site_id=site_id,
                key_id=api_key.key_id,
                scope_kind="site_key",
                scope_id=api_key.key_id,
                payload_json={
                    **key_payload,
                    "reason": reason,
                },
            )
        return revoked_key_ids

    def _issue_automatic_runtime_site_key_in_session(
        self,
        *,
        repository: CommercialRepository,
        site: Site,
        secret: str,
        key_id: str,
        label: str,
        metadata_json: dict[str, object],
        audit_context: ServiceAuditContext | None,
        replaced_key_ids: list[str] | None = None,
    ) -> SiteApiKey:
        api_key = repository.upsert_site_key(
            key_id=key_id,
            site_id=site.site_id,
            secret_hash=build_secret_hash(secret),
            signing_secret_ciphertext=encrypt_site_api_signing_secret(
                secret,
                settings=self.settings,
            ),
            label=label,
            scopes_json=expand_api_key_scopes(DEFAULT_PORTAL_RUNTIME_SCOPES),
            metadata_json=metadata_json,
            status=SITE_API_KEY_STATUS_ACTIVE,
            rotated_from_key_id=None,
            replaced_by_key_id=None,
            expires_at=None,
            revoked_at=None,
        )
        payload = self._serialize_site_key(api_key)
        self._record_service_audit_in_session(
            repository=repository,
            audit_context=audit_context,
            event_kind="site_key.issue",
            outcome="succeeded",
            account_id=site.account_id,
            site_id=site.site_id,
            key_id=api_key.key_id,
            scope_kind="site_key",
            scope_id=api_key.key_id,
            payload_json={
                **payload,
                "source": "automatic_runtime_credential",
                "replaced_key_ids": list(replaced_key_ids or []),
            },
        )
        return api_key

    def provision_site(
        self,
        *,
        site_id: str,
        account_id: str,
        name: str,
        status: str = SITE_STATUS_PROVISIONING,
        site_url: str | None = None,
        metadata_json: dict[str, object] | None = None,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        now = self.now_factory()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            account = repository.get_account(account_id)
            if account is None:
                raise CommercialNotFoundError(
                    "service.account_not_found",
                    f"account '{account_id}' was not found",
                )
            if str(account.status or "") != ACCOUNT_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.account_inactive",
                    f"account '{account_id}' is not active",
                )
            subscription = repository.get_runtime_subscription(account_id)
            snapshot = (
                repository.get_active_entitlement_snapshot(
                    account_id,
                    subscription_id=subscription.subscription_id,
                )
                if subscription is not None
                else None
            )
            # Lock the account before reading the existing site so concurrent
            # duplicate provisioning of the same site serializes: the second
            # caller sees the created site and treats it as an idempotent
            # update instead of failing the bind-capacity check at the ceiling.
            if repository.get_account_for_update(account_id) is None:
                raise CommercialNotFoundError(
                    "service.account_not_found",
                    f"account '{account_id}' was not found",
                )
            existing_site = repository.get_site(site_id)
            if existing_site is not None and str(existing_site.account_id or "") != account_id:
                raise CommercialConflictError(
                    "service.site_account_binding_conflict",
                    f"site '{site_id}' is already bound to another account",
                )
            if (
                existing_site is None
                or repository.get_current_site_account_binding(
                    existing_site.site_id,
                    for_update=False,
                )
                is None
            ):
                cast(Any, self)._assert_account_site_bind_capacity(
                    repository=repository,
                    account_id=account_id,
                    site_limit=cast(Any, self)._resolve_site_limit(snapshot=snapshot),
                )
            requested_status = str(status or "").strip() or SITE_STATUS_PROVISIONING
            if requested_status == SITE_STATUS_ACTIVE and (
                existing_site is None
                or str(existing_site.status or "") != SITE_STATUS_ACTIVE
            ):
                self._assert_site_activation_capacity_in_session(
                    repository=repository,
                    account_id=account_id,
                )
            site = repository.upsert_site(
                site_id=site_id,
                account_id=account_id,
                name=name or site_id,
                status=requested_status,
                site_url=site_url,
                platform_kind=PLATFORM_KIND_WORDPRESS,
                metadata_json=metadata_json,
                provisioned_at=now,
            )
            self._bind_site_to_account_in_session(
                repository=repository,
                site=site,
                account_id=account_id,
                now=now,
                source="internal_site_provision",
            )
            payload = self._serialize_site(site)
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site.provision",
                outcome="succeeded",
                account_id=account_id,
                site_id=site.site_id,
                scope_kind="site",
                scope_id=site.site_id,
                payload_json=payload,
            )
            session.commit()
            return payload

    def activate_site(
        self,
        site_id: str,
        *,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        now = self.now_factory()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            site_account_id = str(site.account_id or "")
            if (
                str(site.status or "") != SITE_STATUS_ACTIVE
                and site_account_id
            ):
                self._assert_site_activation_capacity_in_session(
                    repository=repository,
                    account_id=site_account_id,
                )
            site.status = SITE_STATUS_ACTIVE
            if site.provisioned_at is None:
                site.provisioned_at = now
            site.activated_at = now
            site.suspended_at = None
            site.suspension_reason = None
            payload = self._serialize_site(site)
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site.activate",
                outcome="succeeded",
                account_id=site.account_id,
                site_id=site.site_id,
                scope_kind="site",
                scope_id=site.site_id,
                payload_json=payload,
            )
            session.commit()
            return payload

    def update_portal_site_lifecycle(
        self,
        site_id: str,
        *,
        principal_id: str,
        status: str,
        replace_site_ids: list[str] | None = None,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        desired_status = str(status or "").strip()
        if desired_status not in {SITE_STATUS_ACTIVE, SITE_STATUS_INACTIVE}:
            raise CommercialValidationError(
                "service.portal_site_lifecycle_status_invalid",
                "portal site lifecycle status must be active or inactive",
            )
        normalized_replacements = list(
            dict.fromkeys(
                str(item or "").strip()
                for item in (replace_site_ids or [])
                if str(item or "").strip() and str(item or "").strip() != site_id
            )
        )
        now = self.now_factory()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            access_row = repository.get_portal_site_access(
                principal_id=principal_id,
                site_id=site_id,
            )
            if access_row is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            access_site, account, identity, membership, site_binding = access_row
            if (
                account is None
                or str(account.status or "") != ACCOUNT_STATUS_ACTIVE
                or identity is None
                or str(identity.status or "") != PRINCIPAL_STATUS_ACTIVE
                or membership is None
                or str(membership.status or "")
                != ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE
                or USER_ALLOWED_ACTION_PROVISION_SITES
                not in {
                    str(action).strip()
                    for action in (membership.allowed_actions_json or [])
                    if str(action).strip()
                }
                or site_binding is None
            ):
                raise CommercialPermissionError(
                    "service.principal_site_access_required",
                    "portal site access is required",
                )
            account_id = str(access_site.account_id or "")
            if repository.get_account_for_update(account_id) is None:
                raise CommercialNotFoundError(
                    "service.account_not_found",
                    f"account '{account_id}' was not found",
                )
            site = repository.get_site_for_update(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            previous_status = str(site.status or "")
            if previous_status == SITE_STATUS_SUSPENDED:
                raise CommercialPermissionError(
                    "service.portal_site_lifecycle_operator_owned",
                    "suspended sites can only be changed by a Cloud operator",
                )
            if previous_status == SITE_STATUS_ARCHIVED:
                raise CommercialPermissionError(
                    "service.portal_site_removed",
                    "removed sites must reconnect before activation",
                )

            deactivated_site_ids: list[str] = []
            if desired_status == SITE_STATUS_ACTIVE and previous_status == SITE_STATUS_ACTIVE and normalized_replacements:
                raise CommercialValidationError(
                    "service.portal_site_replacement_not_allowed",
                    "replace_site_ids is only valid when activating an inactive site at capacity",
                )
            if desired_status == SITE_STATUS_ACTIVE and previous_status != SITE_STATUS_ACTIVE:
                capacity = self._site_capacity_projection_in_session(
                    repository=repository,
                    account_id=account_id,
                )
                active_limit = self._coerce_int(capacity.get("active_limit"))
                active_count = self._coerce_int(capacity.get("active_count"))
                required_release_count = (
                    max(0, active_count + 1 - active_limit) if active_limit > 0 else 0
                )
                replacement_sites: list[Site] = []
                for replacement_site_id in normalized_replacements:
                    replacement = repository.get_site_for_update(replacement_site_id)
                    replacement_binding = repository.get_current_principal_site_binding(
                        replacement_site_id,
                        for_update=False,
                    )
                    if (
                        replacement is None
                        or str(replacement.account_id or "") != account_id
                        or str(replacement.status or "") != SITE_STATUS_ACTIVE
                        or replacement_binding is None
                        or str(replacement_binding.principal_id or "") != principal_id
                    ):
                        raise CommercialValidationError(
                            "service.portal_site_replacement_invalid",
                            f"replacement site '{replacement_site_id}' is not an active bound site in this account",
                        )
                    replacement_sites.append(replacement)
                if len(replacement_sites) < required_release_count:
                    raise CommercialConflictError(
                        "service.site_limit_exceeded",
                        "the active site limit is full; explicitly select an active site to replace",
                        data={
                            **{
                                key: value
                                for key, value in capacity.items()
                                if key != "active_sites"
                            },
                            "required_release_count": required_release_count,
                        },
                    )
                if len(replacement_sites) != required_release_count:
                    raise CommercialValidationError(
                        "service.portal_site_replacement_count_invalid",
                        "replace_site_ids must contain exactly the number of active sites required to release capacity",
                        data={"required_release_count": required_release_count},
                    )
                for replacement in replacement_sites:
                    replacement.status = SITE_STATUS_INACTIVE
                    deactivated_site_ids.append(replacement.site_id)
                    self._record_service_audit_in_session(
                        repository=repository,
                        audit_context=audit_context,
                        event_kind="site.deactivate",
                        outcome="succeeded",
                        account_id=account_id,
                        site_id=replacement.site_id,
                        scope_kind="site",
                        scope_id=replacement.site_id,
                        payload_json=self._serialize_site(replacement),
                    )
                site.status = SITE_STATUS_ACTIVE
                site.activated_at = now
                site.suspended_at = None
                site.suspension_reason = None
            elif desired_status == SITE_STATUS_INACTIVE and normalized_replacements:
                raise CommercialValidationError(
                    "service.portal_site_replacement_not_allowed",
                    "replace_site_ids is only valid when activating a site at capacity",
                )
            elif desired_status == SITE_STATUS_INACTIVE and previous_status != SITE_STATUS_INACTIVE:
                site.status = SITE_STATUS_INACTIVE

            if previous_status != str(site.status or ""):
                self._record_service_audit_in_session(
                    repository=repository,
                    audit_context=audit_context,
                    event_kind=(
                        "site.activate"
                        if str(site.status or "") == SITE_STATUS_ACTIVE
                        else "site.deactivate"
                    ),
                    outcome="succeeded",
                    account_id=account_id,
                    site_id=site.site_id,
                    scope_kind="site",
                    scope_id=site.site_id,
                    payload_json=self._serialize_site(site),
                )
            session.flush()
            capacity = self._site_capacity_projection_in_session(
                repository=repository,
                account_id=account_id,
            )
            result = {
                "site": self._serialize_site(site),
                "capacity": {
                    key: value
                    for key, value in capacity.items()
                    if key != "active_sites"
                },
                "transition": {
                    "previous_status": previous_status,
                    "deactivated_site_ids": deactivated_site_ids,
                },
            }
            session.commit()
            return result

    def suspend_site(
        self,
        site_id: str,
        *,
        reason: str = "",
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        now = self.now_factory()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            site.status = SITE_STATUS_SUSPENDED
            site.suspended_at = now
            site.suspension_reason = reason or None
            payload = self._serialize_site(site)
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site.suspend",
                outcome="succeeded",
                account_id=site.account_id,
                site_id=site.site_id,
                scope_kind="site",
                scope_id=site.site_id,
                payload_json=payload,
            )
            session.commit()
            return payload

    def remove_portal_site(
        self,
        site_id: str,
        *,
        principal_id: str,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        now = self.now_factory()
        relink_policy = resolve_site_relink_policy(self.database_url)
        cooldown_until = now + timedelta(days=int(relink_policy.get("cooldown_days") or 90))
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site_for_update(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            self._release_principal_site_binding_in_session(
                repository=repository,
                site=site,
                principal_id=principal_id,
                now=now,
                reason="portal_user_removed_site",
            )
            if str(site.status or "") == SITE_STATUS_SUSPENDED:
                raise CommercialPermissionError(
                    "service.portal_site_not_removable",
                    f"site '{site_id}' cannot be removed from the portal",
                )
            if str(site.status or "") == SITE_STATUS_ARCHIVED:
                return {
                    "site": self._serialize_site(site),
                    "revoked_key_ids": [],
                    "relink_policy": {
                        "enabled": bool(relink_policy.get("enabled", True)),
                        "cooldown_days": int(relink_policy.get("cooldown_days") or 90),
                        "same_account_reconnect_allowed": True,
                        "relink_available_at": self._serialize_datetime(
                            site.relink_cooldown_until
                        ),
                    },
                }
            metadata = dict(site.metadata_json or {})
            lifecycle = metadata.get("portal_lifecycle")
            lifecycle = dict(lifecycle) if isinstance(lifecycle, dict) else {}
            previous_status = str(site.status or "").strip()
            lifecycle["previous_status"] = previous_status
            lifecycle["removed_at"] = self._serialize_datetime(now)
            lifecycle["removed"] = True
            metadata["portal_lifecycle"] = lifecycle
            site.metadata_json = metadata
            site.status = SITE_STATUS_ARCHIVED
            site.ownership_released_at = now
            site.relink_cooldown_until = cooldown_until
            self._release_site_account_binding_in_session(
                repository=repository,
                site=site,
                now=now,
                cooldown_until=cooldown_until,
                reason="portal_user_removed_site",
            )
            revoked_key_ids: list[str] = []
            for api_key in repository.list_site_keys(site.site_id):
                if str(api_key.status or "") != SITE_API_KEY_STATUS_ACTIVE:
                    continue
                api_key.status = SITE_API_KEY_STATUS_REVOKED
                api_key.revoked_at = now
                revoked_key_ids.append(api_key.key_id)
                key_payload = self._serialize_site_key(api_key)
                self._record_service_audit_in_session(
                    repository=repository,
                    audit_context=audit_context,
                    event_kind="site_key.revoke",
                    outcome="succeeded",
                    site_id=site.site_id,
                    key_id=api_key.key_id,
                    scope_kind="site_key",
                    scope_id=api_key.key_id,
                    payload_json={
                        **key_payload,
                        "reason": "portal_user_removed_site",
                    },
                )
            payload = self._serialize_site(site)
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site.remove",
                outcome="succeeded",
                account_id=site.account_id,
                site_id=site.site_id,
                scope_kind="site",
                scope_id=site.site_id,
                payload_json={
                    **payload,
                    "revoked_key_ids": revoked_key_ids,
                    "cross_account_relink_policy": {
                        "enabled": bool(relink_policy.get("enabled", True)),
                        "cooldown_days": int(relink_policy.get("cooldown_days") or 90),
                        "cooldown_until": self._serialize_datetime(cooldown_until),
                    },
                },
            )
            session.commit()
            return {
                "site": payload,
                "revoked_key_ids": revoked_key_ids,
                "relink_policy": {
                    "enabled": bool(relink_policy.get("enabled", True)),
                    "cooldown_days": int(relink_policy.get("cooldown_days") or 90),
                    "same_account_reconnect_allowed": True,
                    "relink_available_at": self._serialize_datetime(cooldown_until),
                },
            }

    def update_site_relink_cooldown(
        self,
        site_id: str,
        *,
        action: str,
        cooldown_until: datetime | None = None,
        reason: str = "",
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        now = self.now_factory()
        policy = resolve_site_relink_policy(self.database_url)
        normalized_action = str(action or "").strip()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site_for_update(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            released_at = _as_utc(site.ownership_released_at)
            if str(site.status or "") != SITE_STATUS_ARCHIVED or released_at is None:
                raise CommercialConflictError(
                    "service.site_relink_not_released",
                    "site must be removed before its cross-account relink cooldown can change",
                )
            resolved_cooldown_until: datetime
            if normalized_action == "clear":
                resolved_cooldown_until = now
            elif normalized_action == "reset":
                resolved_cooldown_until = released_at + timedelta(
                    days=int(policy.get("cooldown_days") or 90)
                )
            elif normalized_action == "set":
                normalized_cooldown_until = _as_utc(cooldown_until)
                if normalized_cooldown_until is None:
                    raise CommercialValidationError(
                        "service.site_relink_cooldown_until_required",
                        "cooldown_until is required when setting a site relink cooldown",
                    )
                resolved_cooldown_until = normalized_cooldown_until
            else:
                raise CommercialValidationError(
                    "service.site_relink_cooldown_action_invalid",
                    "site relink cooldown action is invalid",
                )

            site.relink_cooldown_until = resolved_cooldown_until
            released_binding = repository.get_latest_released_site_account_binding(
                site.site_id
            )
            if released_binding is not None:
                released_binding.cooldown_until = resolved_cooldown_until
                binding_metadata = dict(released_binding.metadata_json or {})
                binding_metadata["cooldown_override_action"] = normalized_action
                binding_metadata["cooldown_override_reason"] = str(reason or "").strip()
                released_binding.metadata_json = binding_metadata

            result: dict[str, object] = {
                "site_id": site.site_id,
                "status": site.status,
                "ownership_released_at": self._serialize_datetime(released_at),
                "relink_cooldown_until": self._serialize_datetime(resolved_cooldown_until),
                "cross_account_relink_ready": bool(
                    policy.get("enabled", True) and resolved_cooldown_until <= now
                ),
                "policy_enabled": bool(policy.get("enabled", True)),
                "default_cooldown_days": int(policy.get("cooldown_days") or 90),
                "action": normalized_action,
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site.relink_cooldown.update",
                outcome="succeeded",
                account_id=site.account_id,
                site_id=site.site_id,
                scope_kind="site",
                scope_id=site.site_id,
                payload_json={
                    **result,
                    "reason": str(reason or "").strip(),
                },
            )
            session.commit()
            return result

    def update_site_runtime_callbacks(
        self,
        *,
        site_id: str,
        terminal_callback: dict[str, object] | None,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )

            metadata = dict(site.metadata_json or {})
            runtime_callbacks = metadata.get("runtime_callbacks")
            runtime_callbacks = (
                dict(runtime_callbacks) if isinstance(runtime_callbacks, dict) else {}
            )
            normalized_terminal = cast(Any, self)._normalize_runtime_terminal_callback(
                terminal_callback
            )
            callback_url = str(normalized_terminal.get("callback_url") or "")
            if callback_url:
                try:
                    validate_runtime_callback_target(callback_url)
                except RuntimeCallbackTargetValidationError as error:
                    raise CommercialValidationError(
                        "service.validation_error",
                        str(error),
                    ) from error
            secret_ciphertext = encrypt_runtime_terminal_callback_secret(
                str(normalized_terminal.get("secret") or ""),
                settings=self.settings,
            )
            stored_terminal = {
                "enabled": bool(normalized_terminal.get("enabled")),
                "callback_url": str(normalized_terminal.get("callback_url") or ""),
                "key_id": str(normalized_terminal.get("key_id") or ""),
                "secret_ciphertext": secret_ciphertext,
                "callback_id": str(normalized_terminal.get("callback_id") or "runtime_terminal"),
            }
            runtime_callbacks["terminal"] = stored_terminal
            metadata["runtime_callbacks"] = runtime_callbacks
            metadata["runtime_terminal_callback_enabled"] = bool(normalized_terminal.get("enabled"))
            metadata["runtime_terminal_callback_url"] = str(
                normalized_terminal.get("callback_url") or ""
            )
            metadata["runtime_terminal_callback_key_id"] = str(
                normalized_terminal.get("key_id") or ""
            )
            metadata["runtime_terminal_callback_id"] = str(
                normalized_terminal.get("callback_id") or "runtime_terminal"
            )
            metadata.pop("runtime_terminal_callback_secret", None)
            site.metadata_json = metadata

            payload: dict[str, object] = {
                "site_id": site.site_id,
                "runtime_callback": {
                    "enabled": bool(normalized_terminal.get("enabled")),
                    "callback_url": str(normalized_terminal.get("callback_url") or ""),
                    "key_id": str(normalized_terminal.get("key_id") or ""),
                    "callback_id": str(
                        normalized_terminal.get("callback_id") or "runtime_terminal"
                    ),
                },
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site.runtime_callbacks.update",
                outcome="succeeded",
                account_id=site.account_id,
                site_id=site.site_id,
                scope_kind="site",
                scope_id=site.site_id,
                payload_json=payload,
            )
            session.commit()
            return payload

    def issue_site_key(
        self,
        *,
        site_id: str,
        key_id: str | None,
        secret: str | None,
        scopes: list[str] | None,
        label: str,
        expires_at: datetime | None,
        metadata_json: dict[str, object] | None = None,
        rotated_from_key_id: str | None = None,
        audit_context: ServiceAuditContext | None = None,
        activate_site_on_issue: bool = False,
    ) -> dict[str, object]:
        resolved_key_id = key_id or f"key_{uuid4().hex}"
        plaintext_secret = secret or f"sk_{secrets.token_urlsafe(24)}"
        now = self.now_factory()
        normalized_scopes = validate_api_key_scopes_for_issue(scopes)

        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            if str(site.status or "") == SITE_STATUS_ARCHIVED:
                raise CommercialPermissionError(
                    "service.portal_site_removed",
                    f"site '{site_id}' has been removed",
                )
            if str(site.status or "") == SITE_STATUS_SUSPENDED:
                raise CommercialPermissionError(
                    "service.portal_site_suspended",
                    f"site '{site_id}' is suspended",
                )
            api_key = repository.upsert_site_key(
                key_id=resolved_key_id,
                site_id=site_id,
                secret_hash=build_secret_hash(plaintext_secret),
                signing_secret_ciphertext=encrypt_site_api_signing_secret(
                    plaintext_secret,
                    settings=self.settings,
                ),
                label=label,
                scopes_json=normalized_scopes,
                metadata_json=metadata_json,
                status=SITE_API_KEY_STATUS_ACTIVE,
                rotated_from_key_id=rotated_from_key_id,
                replaced_by_key_id=None,
                expires_at=expires_at,
                revoked_at=None,
            )
            payload = self._serialize_site_key(api_key)
            payload["secret"] = plaintext_secret
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site_key.issue",
                outcome="succeeded",
                site_id=site_id,
                key_id=api_key.key_id,
                scope_kind="site_key",
                scope_id=api_key.key_id,
                payload_json=payload,
            )
            if activate_site_on_issue and site.status == SITE_STATUS_PROVISIONING:
                site_account_id = str(site.account_id or "")
                subscription = (
                    repository.get_runtime_subscription(site_account_id)
                    if site_account_id
                    else None
                )
                snapshot = (
                    repository.get_active_entitlement_snapshot(
                        site_account_id,
                        subscription_id=subscription.subscription_id,
                    )
                    if subscription is not None
                    else None
                )
                if snapshot is not None:
                    cast(Any, self)._assert_account_site_capacity(
                        repository=repository,
                        account_id=site_account_id,
                        snapshot=snapshot,
                    )
                else:
                    self._assert_default_free_site_capacity(
                        repository=repository,
                        account_id=site_account_id,
                    )
                site.status = SITE_STATUS_ACTIVE
                if site.provisioned_at is None:
                    site.provisioned_at = now
                site.activated_at = now
                site.suspended_at = None
                site.suspension_reason = None
                payload["site_status"] = site.status
                payload["site_activated"] = True
                self._record_service_audit_in_session(
                    repository=repository,
                    audit_context=audit_context,
                    event_kind="site.activate",
                    outcome="succeeded",
                    account_id=site.account_id,
                    site_id=site.site_id,
                    key_id=api_key.key_id,
                    scope_kind="site",
                    scope_id=site.site_id,
                    payload_json=self._serialize_site(site),
                )
            else:
                payload["site_status"] = str(site.status or "")
                payload["site_activated"] = False
            session.commit()
            return payload

    def create_wordpress_addon_connection(
        self,
        *,
        account_id: str,
        principal_id: str,
        site_url: str,
        site_name: str,
        return_url: str,
        addon_state: str,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        normalized_account_id = str(account_id or "").strip()
        normalized_principal_id = str(principal_id or "").strip()
        safe_return_url = _normalize_addon_return_url(return_url)
        normalized_addon_state = str(addon_state or "").strip()
        if not normalized_addon_state:
            raise CommercialValidationError(
                "service.wordpress_addon_state_required",
                "wordpress addon state is required",
            )
        canonical_site_url, site_source = _normalize_portal_site_url(site_url)
        if _addon_host_key(safe_return_url) != _addon_host_key(canonical_site_url):
            raise CommercialValidationError(
                "service.wordpress_addon_return_host_mismatch",
                "wordpress addon return_url must use the WordPress site host",
            )
        site_slug = _slugify_portal_site_segment(site_source)
        if not normalized_account_id:
            raise CommercialPermissionError(
                "service.account_id_required",
                "account id is required",
            )
        if not normalized_principal_id:
            raise CommercialPermissionError(
                "service.principal_id_required",
                "principal id is required",
            )
        if not site_slug:
            raise CommercialPermissionError(
                "service.portal_site_slug_invalid",
                "wordpress site url could not be converted into a stable site id",
            )

        normalized_site_id = f"site_{site_slug}"
        resolved_site_name = (
            str(site_name or "").strip()
            or urlsplit(canonical_site_url).hostname
            or normalized_site_id
        )
        now = self.now_factory()
        connection_code = secrets.token_urlsafe(32)
        expires_at = now + timedelta(seconds=WORDPRESS_ADDON_CONNECTION_TTL_SECONDS)
        relink_policy = resolve_site_relink_policy(self.database_url)

        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            _assert_portal_addon_connection_access(
                repository=repository,
                account_id=normalized_account_id,
                principal_id=normalized_principal_id,
            )
            subscription = _get_active_addon_subscription(
                repository,
                normalized_account_id,
            )
            snapshot = None
            if subscription is not None:
                snapshot = repository.get_active_entitlement_snapshot(
                    normalized_account_id,
                    subscription_id=subscription.subscription_id,
                )
                if snapshot is None:
                    raise CommercialPermissionError(
                        "service.entitlement_snapshot_required",
                        f"account '{normalized_account_id}' does not have an active entitlement snapshot",
                    )
            elif repository.list_account_subscriptions(normalized_account_id):
                raise CommercialPermissionError(
                    "service.subscription_required",
                    f"account '{normalized_account_id}' has subscription history but no active customer subscription",
                )

            service = cast(Any, self)
            existing_site = repository.get_site(normalized_site_id)
            site_created = existing_site is None
            if existing_site is None:
                service._assert_account_site_bind_capacity(
                    repository=repository,
                    account_id=normalized_account_id,
                    site_limit=service._resolve_site_limit(snapshot=snapshot),
                )
            else:
                cross_account_relink = self._assert_cross_account_relink_available(
                    site=existing_site,
                    account_id=normalized_account_id,
                    now=now,
                    policy=relink_policy,
                )
                if str(existing_site.status or "") == SITE_STATUS_SUSPENDED:
                    raise CommercialPermissionError(
                        "service.portal_site_not_connectable",
                        f"site '{normalized_site_id}' is not available for addon connection",
                    )
                current_binding = repository.get_current_site_account_binding(
                    existing_site.site_id,
                    for_update=False,
                )
                if cross_account_relink or current_binding is None:
                    service._assert_account_site_bind_capacity(
                        repository=repository,
                        account_id=normalized_account_id,
                        site_limit=service._resolve_site_limit(snapshot=snapshot),
                    )
            repository.create_portal_oauth_state(
                state_id=f"wacs_{uuid4().hex}",
                provider=WORDPRESS_ADDON_CONNECTION_PROVIDER,
                state_hash=_hash_addon_connection_value(connection_code, prefix="code"),
                return_to=safe_return_url,
                client_scope_id=normalized_site_id,
                expires_at=expires_at,
                metadata_json={
                    "source": "wordpress_addon_connection",
                    "account_id": normalized_account_id,
                    "principal_id": normalized_principal_id,
                    "site_id": normalized_site_id,
                    "addon_state_hash": _hash_addon_connection_value(
                        normalized_addon_state,
                        prefix="state",
                    ),
                    "payload_ciphertext": encrypt_addon_connection_payload(
                        {
                            "account_id": normalized_account_id,
                            "principal_id": normalized_principal_id,
                            "site_id": normalized_site_id,
                            "site_name": resolved_site_name,
                            "site_url": canonical_site_url,
                        },
                        settings=self.settings,
                    ),
                },
            )

            connection_payload = {
                "site_id": normalized_site_id,
                "site_url": canonical_site_url,
                "platform_kind": PLATFORM_KIND_WORDPRESS,
                "site_created": site_created,
                "activation_state": "pending_exchange",
                "expires_at": self._serialize_datetime(expires_at),
                "return_url": safe_return_url,
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="wordpress_addon_connection.issue",
                outcome="succeeded",
                account_id=normalized_account_id,
                site_id=normalized_site_id,
                scope_kind="site",
                scope_id=normalized_site_id,
                payload_json=connection_payload,
            )
            session.commit()

        return {
            **connection_payload,
            "redirect_url": _append_addon_return_query(
                safe_return_url,
                code=connection_code,
                state=normalized_addon_state,
            ),
            "expires_in_seconds": WORDPRESS_ADDON_CONNECTION_TTL_SECONDS,
        }

    def consume_wordpress_addon_connection(
        self,
        *,
        code: str,
        addon_state: str,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        normalized_code = str(code or "").strip()
        normalized_addon_state = str(addon_state or "").strip()
        if not normalized_code or not normalized_addon_state:
            raise CommercialPermissionError(
                "service.wordpress_addon_connection_code_required",
                "wordpress addon connection code and state are required",
            )
        now = self.now_factory()
        relink_policy = resolve_site_relink_policy(self.database_url)
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            row = repository.get_portal_oauth_state(
                provider=WORDPRESS_ADDON_CONNECTION_PROVIDER,
                state_hash=_hash_addon_connection_value(normalized_code, prefix="code"),
                for_update=True,
            )
            if row is None:
                raise CommercialPermissionError(
                    "service.wordpress_addon_connection_code_invalid",
                    "wordpress addon connection code is invalid",
                )
            if row.status != PORTAL_OAUTH_STATE_STATUS_PENDING or row.consumed_at is not None:
                raise CommercialPermissionError(
                    "service.wordpress_addon_connection_code_invalid",
                    "wordpress addon connection code is invalid",
                )
            metadata = row.metadata_json if isinstance(row.metadata_json, dict) else {}
            expected_state_hash = str(metadata.get("addon_state_hash") or "")
            if expected_state_hash != _hash_addon_connection_value(
                normalized_addon_state,
                prefix="state",
            ):
                raise CommercialPermissionError(
                    "service.wordpress_addon_connection_state_invalid",
                    "wordpress addon connection state is invalid",
                )
            row_expires_at = (
                row.expires_at.replace(tzinfo=UTC)
                if row.expires_at.tzinfo is None
                else row.expires_at.astimezone(UTC)
            )
            if row_expires_at <= now:
                row.status = PORTAL_OAUTH_STATE_STATUS_EXPIRED
                row.consumed_at = now
                session.commit()
                raise CommercialPermissionError(
                    "service.wordpress_addon_connection_code_expired",
                    "wordpress addon connection code has expired",
                )
            try:
                payload = decrypt_addon_connection_payload(
                    str(metadata.get("payload_ciphertext") or ""),
                    settings=self.settings,
                )
            except RuntimeError as error:
                raise CommercialPermissionError(
                    "service.wordpress_addon_connection_payload_invalid",
                    "wordpress addon connection payload is invalid",
                ) from error

            account_id = str(payload.get("account_id") or "").strip()
            principal_id = str(payload.get("principal_id") or "").strip()
            site_id = str(payload.get("site_id") or "").strip()
            site_name = str(payload.get("site_name") or "").strip()
            site_url = str(payload.get("site_url") or "").strip()
            if not account_id or not principal_id or not site_id or not site_url:
                raise CommercialPermissionError(
                    "service.wordpress_addon_connection_payload_invalid",
                    "wordpress addon connection payload is invalid",
                )
            if repository.get_account_for_update(account_id) is None:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    "portal account access is required",
                )
            _assert_portal_addon_connection_access(
                repository=repository,
                account_id=account_id,
                principal_id=principal_id,
            )
            if audit_context is not None:
                audit_context.actor_kind = "wordpress_addon"
                audit_context.actor_ref = site_id

            service = cast(Any, self)
            subscription = _get_active_addon_subscription(repository, account_id)
            free_entitlement_activated = False
            if subscription is None:
                if repository.list_account_subscriptions(account_id):
                    raise CommercialPermissionError(
                        "service.subscription_required",
                        f"account '{account_id}' has subscription history but no active customer subscription",
                    )
                subscription_payload = (
                    service._bind_default_free_subscription_for_account_in_session(
                        repository=repository,
                        account_id=account_id,
                        audit_context=audit_context,
                    )
                )
                if not isinstance(subscription_payload, dict):
                    raise CommercialPermissionError(
                        "service.subscription_required",
                        f"account '{account_id}' could not activate its Free subscription",
                    )
                free_entitlement_activated = True
                subscription = _get_active_addon_subscription(repository, account_id)
            if subscription is None:
                raise CommercialPermissionError(
                    "service.subscription_required",
                    f"account '{account_id}' does not have an active customer subscription",
                )
            snapshot = repository.get_active_entitlement_snapshot(
                account_id,
                subscription_id=subscription.subscription_id,
            )
            if snapshot is None:
                raise CommercialPermissionError(
                    "service.entitlement_snapshot_required",
                    f"account '{account_id}' does not have an active entitlement snapshot",
                )

            site = repository.get_site_for_update(site_id)
            site_created = site is None
            site_transferred = False
            previous_account_id = ""
            if site is None:
                service._assert_account_site_bind_capacity(
                    repository=repository,
                    account_id=account_id,
                    site_limit=service._resolve_site_limit(snapshot=snapshot),
                )
                site = repository.upsert_site(
                    site_id=site_id,
                    account_id=account_id,
                    name=site_name or site_id,
                    status=SITE_STATUS_PROVISIONING,
                    site_url=site_url,
                    platform_kind=PLATFORM_KIND_WORDPRESS,
                    metadata_json={
                        "source": "portal_self_serve",
                        "created_via": "wordpress_addon_connection",
                    },
                    provisioned_at=now,
                )
                self._record_service_audit_in_session(
                    repository=repository,
                    audit_context=audit_context,
                    event_kind="site.provision",
                    outcome="succeeded",
                    account_id=account_id,
                    site_id=site.site_id,
                    scope_kind="site",
                    scope_id=site.site_id,
                    payload_json=self._serialize_site(site),
                )
                self._bind_site_to_account_in_session(
                    repository=repository,
                    site=site,
                    account_id=account_id,
                    now=now,
                    source="wordpress_addon_connection",
                )
            else:
                previous_account_id = str(site.account_id or "")
                previous_ownership_released_at = site.ownership_released_at
                previous_relink_cooldown_until = site.relink_cooldown_until
                site_transferred = self._assert_cross_account_relink_available(
                    site=site,
                    account_id=account_id,
                    now=now,
                    policy=relink_policy,
                )
                if str(site.status or "") == SITE_STATUS_SUSPENDED:
                    raise CommercialPermissionError(
                        "service.portal_site_not_connectable",
                        f"site '{site_id}' is not available for addon connection",
                    )
                current_site_account_binding = repository.get_current_site_account_binding(
                    site.site_id,
                    for_update=False,
                )
                if site_transferred or current_site_account_binding is None:
                    service._assert_account_site_bind_capacity(
                        repository=repository,
                        account_id=account_id,
                        site_limit=service._resolve_site_limit(snapshot=snapshot),
                    )
                self._bind_site_to_account_in_session(
                    repository=repository,
                    site=site,
                    account_id=account_id,
                    now=now,
                    source=(
                        "wordpress_addon_cross_account_relink"
                        if site_transferred
                        else "wordpress_addon_reconnect"
                    ),
                )
                site.name = site_name or site.name or site_id
                site.site_url = site_url
                site.platform_kind = PLATFORM_KIND_WORDPRESS
                if str(site.status or "") == SITE_STATUS_ARCHIVED:
                    site_metadata = dict(site.metadata_json or {})
                    lifecycle = site_metadata.get("portal_lifecycle")
                    if isinstance(lifecycle, dict):
                        lifecycle = dict(lifecycle)
                        lifecycle.pop("removed", None)
                        lifecycle.pop("removed_at", None)
                        lifecycle["reconnected_at"] = self._serialize_datetime(now)
                        site_metadata["portal_lifecycle"] = lifecycle
                    site.metadata_json = site_metadata
                if site_transferred:
                    self._record_service_audit_in_session(
                        repository=repository,
                        audit_context=audit_context,
                        event_kind="site.account_relink",
                        outcome="succeeded",
                        account_id=account_id,
                        site_id=site.site_id,
                        scope_kind="site",
                        scope_id=site.site_id,
                        payload_json={
                            "site_id": site.site_id,
                            "previous_account_id": previous_account_id,
                            "account_id": account_id,
                            "ownership_released_at": self._serialize_datetime(
                                previous_ownership_released_at
                            ),
                            "relink_cooldown_until": self._serialize_datetime(
                                previous_relink_cooldown_until
                            ),
                            "source": "wordpress_addon_connection",
                        },
                    )

            self._ensure_principal_site_binding_in_session(
                repository=repository,
                site=site,
                principal_id=principal_id,
                account_id=account_id,
                now=now,
                source="wordpress_addon_connection",
            )
            key_secret = f"sk_{secrets.token_urlsafe(24)}"
            key_id = f"key_{uuid4().hex}"
            revoked_key_ids = self._revoke_active_site_keys_in_session(
                repository=repository,
                site_id=site.site_id,
                now=now,
                audit_context=audit_context,
                reason="wordpress_addon_connection_reissued",
            )
            api_key = self._issue_automatic_runtime_site_key_in_session(
                repository=repository,
                site=site,
                secret=key_secret,
                key_id=key_id,
                label="WordPress addon connection",
                metadata_json={
                    "source": "wordpress_addon_connection",
                    "credential_owner": "system",
                    "user_visible": False,
                },
                audit_context=audit_context,
                replaced_key_ids=revoked_key_ids,
            )
            should_auto_activate = site.status in {
                SITE_STATUS_PROVISIONING,
                SITE_STATUS_ARCHIVED,
            }
            capacity_before_activation = service._site_capacity_projection_in_session(
                repository=repository,
                account_id=account_id,
                snapshot=snapshot,
            )
            has_active_capacity = (
                self._coerce_int(capacity_before_activation.get("active_limit")) <= 0
                or self._coerce_int(capacity_before_activation.get("active_count"))
                < self._coerce_int(capacity_before_activation.get("active_limit"))
            )
            if should_auto_activate and has_active_capacity:
                site.status = SITE_STATUS_ACTIVE
                if site.provisioned_at is None:
                    site.provisioned_at = now
                site.activated_at = now
                site.suspended_at = None
                site.suspension_reason = None
                self._record_service_audit_in_session(
                    repository=repository,
                    audit_context=audit_context,
                    event_kind="site.activate",
                    outcome="succeeded",
                    account_id=account_id,
                    site_id=site.site_id,
                    key_id=api_key.key_id,
                    scope_kind="site",
                    scope_id=site.site_id,
                    payload_json=self._serialize_site(site),
                )
            elif should_auto_activate:
                site.status = SITE_STATUS_INACTIVE

            cloud_api_key = build_customer_api_key(
                site_id=site.site_id,
                key_id=api_key.key_id,
                secret=key_secret,
            )
            result = {
                "site_id": site.site_id,
                "key_id": api_key.key_id,
                "cloud_api_key": cloud_api_key,
                "activation_state": str(site.status or SITE_STATUS_INACTIVE),
                "activation_required": str(site.status or "") != SITE_STATUS_ACTIVE,
                "activation_reason": (
                    "active_site_limit_reached"
                    if str(site.status or "") != SITE_STATUS_ACTIVE
                    and not has_active_capacity
                    else (
                        "manual_activation_required"
                        if str(site.status or "") == SITE_STATUS_INACTIVE
                        else ""
                    )
                ),
                "capacity": {
                    key: value
                    for key, value in service._site_capacity_projection_in_session(
                        repository=repository,
                        account_id=account_id,
                        snapshot=snapshot,
                    ).items()
                    if key != "active_sites"
                },
                "site_created": site_created,
                "site_transferred": site_transferred,
                "revoked_key_ids": revoked_key_ids,
                "free_entitlement_activated": free_entitlement_activated,
                "subscription_id": subscription.subscription_id,
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="wordpress_addon_connection.exchange",
                outcome="succeeded",
                account_id=account_id,
                subscription_id=subscription.subscription_id,
                site_id=site.site_id,
                key_id=api_key.key_id,
                scope_kind="site",
                scope_id=site.site_id,
                payload_json={
                    key: value
                    for key, value in result.items()
                    if key != "cloud_api_key"
                },
            )
            row.status = PORTAL_OAUTH_STATE_STATUS_CONSUMED
            row.consumed_at = now
            session.commit()
        return result

    def list_site_keys(
        self,
        site_id: str,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            if repository.get_site(site_id) is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            total = repository.count_site_keys(site_id)
            normalized_offset = max(offset, 0)
            normalized_limit = limit if limit is None else max(limit, 1)
            keys = repository.list_site_keys(
                site_id,
                limit=normalized_limit,
                offset=normalized_offset,
            )
            effective_limit = normalized_limit if normalized_limit is not None else total
            next_offset = normalized_offset + len(keys)
            has_more = next_offset < total
            return {
                "site_id": site_id,
                "items": [self._serialize_site_key(item) for item in keys],
                "pagination": {
                    "limit": effective_limit,
                    "offset": normalized_offset,
                    "total": total,
                    "has_more": has_more,
                    "next_offset": next_offset if has_more else None,
                },
                "sort": {
                    "created_at": "desc",
                    "key_id": "desc",
                },
            }

    def rotate_site_key(
        self,
        *,
        site_id: str,
        key_id: str,
        next_key_id: str | None,
        secret: str | None,
        scopes: list[str] | None,
        label: str,
        expires_at: datetime | None,
        metadata_json: dict[str, object] | None = None,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        now = self.now_factory()
        normalized_scopes = (
            validate_api_key_scopes_for_issue(scopes) if scopes is not None else None
        )
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            current = repository.get_site_key(key_id)
            if current is None or current.site_id != site_id:
                raise CommercialNotFoundError(
                    "service.key_not_found",
                    f"site key '{key_id}' was not found for site '{site_id}'",
                )
            resolved_key_id = next_key_id or f"key_{uuid4().hex}"
            plaintext_secret = secret or f"sk_{secrets.token_urlsafe(24)}"
            rotated_key = repository.upsert_site_key(
                key_id=resolved_key_id,
                site_id=site_id,
                secret_hash=build_secret_hash(plaintext_secret),
                signing_secret_ciphertext=encrypt_site_api_signing_secret(
                    plaintext_secret,
                    settings=self.settings,
                ),
                label=label or (current.label or ""),
                scopes_json=(
                    normalized_scopes
                    if normalized_scopes is not None
                    else list(current.scopes_json or [])
                ),
                metadata_json=metadata_json,
                status=SITE_API_KEY_STATUS_ACTIVE,
                rotated_from_key_id=key_id,
                replaced_by_key_id=None,
                expires_at=expires_at,
                revoked_at=None,
            )
            current.status = SITE_API_KEY_STATUS_REVOKED
            current.revoked_at = now
            current.replaced_by_key_id = rotated_key.key_id
            payload: dict[str, object] = {
                "previous": self._serialize_site_key(current),
                "current": {
                    **self._serialize_site_key(rotated_key),
                    "secret": plaintext_secret,
                },
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site_key.rotate",
                outcome="succeeded",
                site_id=site_id,
                key_id=rotated_key.key_id,
                scope_kind="site_key",
                scope_id=rotated_key.key_id,
                payload_json=payload,
            )
            session.commit()
            return payload

    def revoke_site_key(
        self,
        *,
        site_id: str,
        key_id: str,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        now = self.now_factory()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            api_key = repository.get_site_key(key_id)
            if api_key is None or api_key.site_id != site_id:
                raise CommercialNotFoundError(
                    "service.key_not_found",
                    f"site key '{key_id}' was not found for site '{site_id}'",
                )
            api_key.status = SITE_API_KEY_STATUS_REVOKED
            api_key.revoked_at = now
            payload = self._serialize_site_key(api_key)
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site_key.revoke",
                outcome="succeeded",
                site_id=site_id,
                key_id=api_key.key_id,
                scope_kind="site_key",
                scope_id=api_key.key_id,
                payload_json=payload,
            )
            session.commit()
            return payload

    def expire_site_key(
        self,
        *,
        site_id: str,
        key_id: str,
        expires_at: datetime,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            api_key = repository.get_site_key(key_id)
            if api_key is None or api_key.site_id != site_id:
                raise CommercialNotFoundError(
                    "service.key_not_found",
                    f"site key '{key_id}' was not found for site '{site_id}'",
                )
            api_key.status = SITE_API_KEY_STATUS_EXPIRED
            api_key.expires_at = expires_at
            payload = self._serialize_site_key(api_key)
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="site_key.expire",
                outcome="succeeded",
                site_id=site_id,
                key_id=api_key.key_id,
                scope_kind="site_key",
                scope_id=api_key.key_id,
                payload_json=payload,
            )
            session.commit()
            return payload

    def resolve_portal_site_access(
        self,
        *,
        site_id: str,
        principal_id: str,
        required_roles: set[str] | None = None,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            access_row = repository.get_portal_site_access(
                principal_id=principal_id,
                site_id=site_id,
            )
            if access_row is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            site, account, identity, membership, site_binding = access_row
            if account is None or account.status != ACCOUNT_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.portal_account_inactive",
                    f"account '{site.account_id}' is not active",
                )
            if (
                identity is None
                or identity.status != PRINCIPAL_STATUS_ACTIVE
                or membership is None
                or membership.status != ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE
            ):
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{principal_id}' is not active for account '{site.account_id}'",
                )
            if site_binding is None:
                raise CommercialPermissionError(
                    "service.principal_site_access_required",
                    f"principal '{principal_id}' is not bound to site '{site_id}'",
                )
            role = normalize_user_role(str(membership.role or USER_ROLE_OWNER))
            allowed_actions = [
                str(action).strip()
                for action in (membership.allowed_actions_json or [])
                if str(action).strip()
            ]
            if required_roles is not None and role not in required_roles:
                raise CommercialPermissionError(
                    "service.portal_role_forbidden",
                    f"principal '{principal_id}' lacks required role for site '{site_id}'",
                )
        return {
            "site_id": site.site_id,
            "account_id": site.account_id,
            "principal_id": principal_id,
            "identity_type": IDENTITY_TYPE_USER,
            "allowed_actions": allowed_actions,
            "role": role,
            "site": self._serialize_site(site),
        }

    def list_portal_sites(
        self,
        *,
        principal_id: str,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            items = []
            account_ids: set[str] = set()
            for site, _identity, membership in repository.list_sites_for_principal(
                principal_id=principal_id,
                membership_statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
            ):
                if str(site.account_id or "").strip():
                    account_ids.add(str(site.account_id or ""))
                items.append(
                    {
                        "principal_id": principal_id,
                        "identity_type": IDENTITY_TYPE_USER,
                        "allowed_actions": [
                            str(action).strip()
                            for action in (membership.allowed_actions_json or [])
                            if str(action).strip()
                        ],
                        "role": USER_ROLE_OWNER,
                        "membership_status": membership.status,
                        "site": self._serialize_site(site),
                    }
                )
            capacities = {}
            for account_id in sorted(account_ids):
                capacity = self._site_capacity_projection_in_session(
                    repository=repository,
                    account_id=account_id,
                )
                capacities[account_id] = {
                    key: value
                    for key, value in capacity.items()
                    if key != "active_sites"
                }
            return {
                "principal_id": principal_id,
                "items": items,
                "capacities": capacities,
            }

    def list_admin_sites(
        self,
        *,
        status: str | None = None,
        account_id: str | None = None,
        subscription_status: str | None = None,
        expires_before: datetime | None = None,
        limit: int = 100,
        usage_window_days: int = 7,
    ) -> dict[str, object]:
        usage_since = self.now_factory() - timedelta(days=max(1, usage_window_days))
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            filtered_site_ids: set[str] | None = None
            if subscription_status or expires_before is not None:
                filtered_subscriptions = repository.list_subscriptions(
                    status=subscription_status,
                    current_period_end_before=expires_before,
                    limit=None,
                )
                filtered_site_ids = {
                    site.site_id
                    for site in repository.list_sites(
                        account_ids=[
                            subscription.account_id
                            for subscription in filtered_subscriptions
                            if subscription.account_id
                        ],
                        limit=None,
                    )
                }
            sites = repository.list_sites(
                status=status,
                account_id=account_id,
                site_ids=sorted(filtered_site_ids) if filtered_site_ids is not None else None,
                limit=limit,
            )
            site_ids = [site.site_id for site in sites]
            account_ids = [site.account_id for site in sites if site.account_id]
            key_counts = repository.count_site_keys_by_site(
                site_ids=site_ids,
                statuses=[SITE_API_KEY_STATUS_ACTIVE],
            )
            subscriptions = repository.list_subscriptions(account_ids=account_ids, limit=None)
            usage_summary = repository.summarize_usage_meter_by_site(
                site_ids=site_ids,
                since=usage_since,
            )
            latest_billing_by_site = repository.get_latest_billing_snapshots_by_site(
                site_ids=site_ids
            )

        service = cast(Any, self)
        latest_subscription_by_account = service._latest_subscription_map(subscriptions)
        site_counts_by_account = Counter(
            site.account_id for site in sites if str(site.account_id or "").strip()
        )
        items = []
        for site in sites:
            subscription = latest_subscription_by_account.get(site.account_id or "")
            billing_snapshot = latest_billing_by_site.get(site.site_id)
            usage = usage_summary.get(site.site_id, {})
            items.append(
                {
                    "site": self._serialize_site(site),
                    "active_key_count": key_counts.get(site.site_id, 0),
                    "coverage": service._build_subscription_coverage_summary(
                        subscription,
                        site_count=site_counts_by_account.get(site.account_id or "", 0),
                    ),
                    "recent_usage": {
                        "window_days": max(1, usage_window_days),
                        "event_count": self._coerce_int(usage.get("event_count")),
                        "quantity_total": round(
                            self._coerce_float(usage.get("quantity_total")),
                            6,
                        ),
                        "last_seen_at": usage.get("last_seen_at"),
                    },
                    "latest_billing_snapshot": (
                        service._serialize_billing_snapshot(billing_snapshot)
                        if billing_snapshot is not None
                        else None
                    ),
                }
            )
        return {
            "filters": {
                "status": status or "",
                "account_id": account_id or "",
                "subscription_status": subscription_status or "",
                "expires_before": self._serialize_datetime(expires_before),
                "limit": limit,
                "usage_window_days": max(1, usage_window_days),
            },
            "items": items,
        }

    def get_admin_site(self, site_id: str) -> dict[str, object]:
        relink_policy = resolve_site_relink_policy(self.database_url)
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found",
                    f"site '{site_id}' was not found",
                )
            account = repository.get_account(site.account_id) if site.account_id else None
            keys = repository.list_site_keys(site_id)
            subscription = repository.get_latest_account_subscription(site.account_id or "")
            snapshot = repository.get_active_entitlement_snapshot(
                site.account_id or "",
                subscription_id=subscription.subscription_id if subscription is not None else None,
            )
            site_count = repository.count_sites_by_account(
                account_ids=[str(site.account_id or "")]
            ).get(site.account_id or "", 0)

        service = cast(Any, self)
        usage_meter = service.inspect_usage_meter(site_id, limit=20)
        billing_snapshots = service.list_billing_snapshots(site_id)
        reconciliation = (
            service.reconcile_billing_snapshot(site_id) if subscription is not None else None
        )
        commercial_policy = service.inspect_commercial_policy(site_id)
        ownership_released_at = _as_utc(site.ownership_released_at)
        relink_cooldown_until = _as_utc(site.relink_cooldown_until)
        cross_account_relink_ready = bool(
            relink_policy.get("enabled", True)
            and site.status == SITE_STATUS_ARCHIVED
            and ownership_released_at is not None
            and relink_cooldown_until is not None
            and relink_cooldown_until <= self.now_factory()
        )
        return {
            "site": self._serialize_site(site),
            "account": service._serialize_account(account) if account is not None else None,
            "site_keys": [self._serialize_site_key(item) for item in keys],
            "site_relink_policy": {
                "enabled": bool(relink_policy.get("enabled", True)),
                "default_cooldown_days": int(relink_policy.get("cooldown_days") or 90),
                "ownership_released_at": self._serialize_datetime(site.ownership_released_at),
                "cooldown_until": self._serialize_datetime(site.relink_cooldown_until),
                "cross_account_relink_ready": cross_account_relink_ready,
            },
            "subscription": (
                service._serialize_subscription(subscription) if subscription is not None else None
            ),
            "coverage": service._build_subscription_coverage_summary(
                subscription,
                site_count=site_count,
                site_limit=int(getattr(snapshot, "site_limit", 0) or 0),
            ),
            "usage_meter": usage_meter,
            "billing_snapshots": billing_snapshots,
            "billing_reconciliation": reconciliation,
            "commercial_policy": commercial_policy,
        }

    def get_portal_site_diagnostics(self, site_id: str) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            site = repository.get_site(site_id)
            if site is None:
                raise CommercialNotFoundError(
                    "service.site_not_found", f"site '{site_id}' was not found"
                )
            keys = repository.list_site_keys(site_id, limit=100)
            active_keys = [item for item in keys if item.status == SITE_API_KEY_STATUS_ACTIVE]
            recent_events = repository.list_service_audit_events(site_id=site_id, limit=20)
            failed_events = [
                item
                for item in recent_events
                if str(item.outcome or "").lower() in {"error", "denied", "failed"}
            ]
            latest_key_usage = max(
                [item.last_used_at for item in keys if item.last_used_at],
                default=None,
            )
            expiring_threshold = self.now_factory() + timedelta(days=14)
            if expiring_threshold.tzinfo is None:
                expiring_threshold = expiring_threshold.replace(tzinfo=UTC)
            expiring_soon = 0
            for item in active_keys:
                expires_at = item.expires_at
                if expires_at is None:
                    continue
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=UTC)
                if expires_at <= expiring_threshold:
                    expiring_soon += 1
            site_url = _extract_site_url(site)
            checks = [
                self._build_diagnostic_check(
                    "site_status",
                    site.status == SITE_STATUS_ACTIVE,
                    "站点已激活" if site.status == SITE_STATUS_ACTIVE else "站点尚未激活或已暂停",
                    "先在站点页启用站点，或重新接入已移除站点，再重试云端请求。",
                ),
                self._build_diagnostic_check(
                    "active_key",
                    len(active_keys) > 0,
                    "连接凭证可用" if active_keys else "没有可用连接凭证",
                    "从 WordPress 插件重新连接站点，系统会自动生成新的连接凭证。",
                ),
                self._build_diagnostic_check(
                    "site_url",
                    bool(site_url),
                    "WordPress URL 已配置" if site_url else "WordPress URL 未配置",
                    "在站点记录中确认站点 URL，方便排查绑定关系。",
                ),
                self._build_diagnostic_check(
                    "recent_failures",
                    len(failed_events) == 0,
                    "最近未发现失败事件" if not failed_events else "最近存在失败或拒绝事件",
                    "打开审计页查看失败事件详情和 trace id。",
                ),
            ]
            return {
                "site_id": site.site_id,
                "account_id": site.account_id or "",
                "status": "ok" if all(item["ok"] for item in checks) else "attention",
                "generated_at": self._serialize_datetime(self.now_factory()),
                "site": self._serialize_site(site),
                "site_status": site.status,
                "site_url": site_url,
                "platform_kind": str(site.platform_kind or PLATFORM_KIND_WORDPRESS),
                "active_key_count": len(active_keys),
                "latest_key_used_at": self._serialize_datetime(latest_key_usage),
                "latest_auth_failure_at": self._serialize_datetime(
                    failed_events[0].created_at if failed_events else None
                ),
                "key_summary": {
                    "total": len(keys),
                    "active": len(active_keys),
                    "latest_used_at": self._serialize_datetime(latest_key_usage),
                    "expiring_soon": expiring_soon,
                },
                "recent_failures": [
                    self._serialize_service_audit_event(item) for item in failed_events[:5]
                ],
                "checks": checks,
            }

    def _serialize_site(self, site: Site) -> dict[str, object]:
        return {
            "site_id": site.site_id,
            "account_id": site.account_id or "",
            "name": site.name,
            "status": site.status,
            "site_url": _extract_site_url(site),
            "platform_kind": str(site.platform_kind or PLATFORM_KIND_WORDPRESS),
            "metadata": site.metadata_json or {},
            "provisioned_at": self._serialize_datetime(site.provisioned_at),
            "activated_at": self._serialize_datetime(site.activated_at),
            "suspended_at": self._serialize_datetime(site.suspended_at),
            "suspension_reason": site.suspension_reason or "",
            "ownership_released_at": self._serialize_datetime(site.ownership_released_at),
            "relink_cooldown_until": self._serialize_datetime(site.relink_cooldown_until),
            "created_at": self._serialize_datetime(site.created_at),
            "updated_at": self._serialize_datetime(site.updated_at),
        }

    def _serialize_site_key(self, api_key: SiteApiKey) -> dict[str, object]:
        return {
            "key_id": api_key.key_id,
            "site_id": api_key.site_id,
            "label": api_key.label or "",
            "scopes": list(api_key.scopes_json or []),
            "metadata": api_key.metadata_json or {},
            "status": api_key.status,
            "rotated_from_key_id": api_key.rotated_from_key_id or "",
            "replaced_by_key_id": api_key.replaced_by_key_id or "",
            "expires_at": self._serialize_datetime(api_key.expires_at),
            "revoked_at": self._serialize_datetime(api_key.revoked_at),
            "last_used_at": self._serialize_datetime(api_key.last_used_at),
            "created_at": self._serialize_datetime(api_key.created_at),
            "updated_at": self._serialize_datetime(api_key.updated_at),
        }

    def _latest_subscription_map_by_site(
        self,
        *,
        subscriptions: list[AccountSubscription],
        sites: list[Site],
    ) -> dict[str, AccountSubscription]:
        latest_by_account = cast(Any, self)._latest_subscription_map(subscriptions)
        return {
            site.site_id: latest_by_account[site.account_id]
            for site in sites
            if site.account_id and site.account_id in latest_by_account
        }

    def _resolve_site_limit(
        self,
        *,
        plan_version: object | None = None,
        subscription: object | None = None,
        snapshot: object | None = None,
    ) -> int:
        sources = [
            getattr(snapshot, "site_limit", None),
            (getattr(snapshot, "metadata_json", None) or {}).get("site_limit")
            if snapshot is not None
            else None,
            (getattr(plan_version, "metadata_json", None) or {}).get("site_limit")
            if plan_version is not None
            else None,
            (getattr(subscription, "metadata_json", None) or {}).get("site_limit")
            if subscription is not None
            else None,
        ]
        for source in sources:
            if source is not None:
                return max(0, self._coerce_int(source))
        tier_id = cast(Any, self)._infer_plan_tier_id(
            {
                "plan_id": str(getattr(subscription, "plan_id", "") or ""),
                "metadata": getattr(subscription, "metadata_json", None) or {},
            },
            [],
        )
        baseline = PLAN_TIER_REGISTRY.get(tier_id, PLAN_TIER_REGISTRY[DEFAULT_PLAN_TIER_ID])
        return max(0, self._coerce_int(baseline.get("site_limit")))
