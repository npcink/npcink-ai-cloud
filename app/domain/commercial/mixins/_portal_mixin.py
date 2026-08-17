"""Commercial service: portal operations mixin."""

from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

from app.adapters.repositories.commercial_repository import CommercialRepository
from app.core.db import get_session
from app.core.models import (
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED,
    CREDIT_LEDGER_EVENT_CONSUME,
    IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
    IDENTITY_PROVIDER_BINDING_STATUS_REVOKED,
    PLATFORM_KIND_WORDPRESS,
    PORTAL_LOGIN_CODE_STATUS_CONSUMED,
    PORTAL_LOGIN_CODE_STATUS_EXPIRED,
    PORTAL_LOGIN_CODE_STATUS_LOCKED,
    PORTAL_OAUTH_STATE_STATUS_CONSUMED,
    PORTAL_OAUTH_STATE_STATUS_EXPIRED,
    PORTAL_OAUTH_STATE_STATUS_PENDING,
    PRINCIPAL_STATUS_ACTIVE,
    PRINCIPAL_STATUS_DISABLED,
    Site,
)
from app.core.security import build_secret_hash, verify_secret_hash
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.errors import (
    CommercialNotFoundError,
    CommercialPermissionError,
    CommercialValidationError,
)
from app.domain.commercial.identity import (
    IDENTITY_TYPE_USER,
    USER_ROLE_OWNER,
    _new_principal_id,
    _normalize_principal_email,
    normalize_user_role,
    resolve_principal_allowed_actions,
)
from app.domain.commercial.membership_policy import (
    assert_single_account_membership_available,
)
from app.domain.commercial.mixins._audit_mixin import CommercialServiceAuditMixin

PORTAL_LOGIN_CODE_PURPOSE_LOGIN = "portal_login"
PORTAL_LOGIN_CODE_PURPOSE_EMAIL_CHANGE = "portal_email_change"
PORTAL_LOGIN_CODE_PURPOSE_REGISTRATION = "portal_registration"


def _normalize_identity_provider(provider: str) -> str:
    normalized = str(provider or "").strip().lower()
    if normalized != "qq":
        raise CommercialValidationError(
            "service.portal_identity_provider_unsupported",
            "portal identity provider must be qq",
        )
    return normalized


def _sanitize_portal_return_to(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "/portal"
    if not raw.startswith("/portal"):
        return "/portal"
    if raw.startswith("//") or "://" in raw:
        return "/portal"
    return raw[:255]


def _normalize_portal_oauth_intent(value: str) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {"login", "bind"} else "login"


def _hash_provider_subject(provider: str, value: str) -> str:
    normalized_value = str(value or "").strip()
    if not normalized_value:
        raise CommercialValidationError(
            "service.portal_identity_subject_required",
            "identity provider subject is required",
        )
    return build_secret_hash(f"{provider}:{normalized_value}")


def _hash_external_identity(provider: str, value: str, *, kind: str = "subject") -> str:
    normalized_value = str(value or "").strip()
    if not normalized_value:
        raise CommercialValidationError(
            "service.portal_identity_subject_required",
            "identity provider subject is required",
        )
    return build_secret_hash(f"{provider}:{kind}:{normalized_value}")


def _serialize_identity_provider_binding(
    binding: Any,
    *,
    principal_id: str,
) -> dict[str, object]:
    metadata = getattr(binding, "metadata_json", None)
    profile = metadata.get("profile") if isinstance(metadata, dict) else None
    profile = profile if isinstance(profile, dict) else {}
    return {
        "binding_id": str(getattr(binding, "binding_id", "") or ""),
        "provider": str(getattr(binding, "provider", "") or ""),
        "principal_id": principal_id,
        "identity_type": IDENTITY_TYPE_USER,
        "role": USER_ROLE_OWNER,
        "status": str(getattr(binding, "status", "") or ""),
        "has_unionid": bool(getattr(binding, "unionid_hash", None)),
        "display_name": " ".join(str(profile.get("display_name") or "").split())[:80],
        "last_login_at": (
            binding.last_login_at.isoformat().replace("+00:00", "Z")
            if getattr(binding, "last_login_at", None)
            else ""
        ),
    }


def _as_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _resolve_membership_allowed_actions(value: object) -> list[str]:
    return (
        [str(action).strip() for action in value if str(action).strip()]
        if isinstance(value, list)
        else []
    )


def _portal_registration_code_metadata(value: object) -> dict[str, object]:
    metadata = value if isinstance(value, dict) else {}
    if str(metadata.get("purpose") or "").strip() != PORTAL_LOGIN_CODE_PURPOSE_REGISTRATION:
        return {}
    return metadata


def _portal_email_change_code_metadata(value: object) -> dict[str, object]:
    metadata = value if isinstance(value, dict) else {}
    if str(metadata.get("purpose") or "").strip() != PORTAL_LOGIN_CODE_PURPOSE_EMAIL_CHANGE:
        return {}
    return metadata


def _principal_registration_access_is_blocked(
    repository: CommercialRepository,
    *,
    principal_id: str,
    principal_status: str,
) -> bool:
    if principal_status != PRINCIPAL_STATUS_ACTIVE:
        return True
    memberships = repository.list_account_user_memberships(
        principal_ids=[principal_id],
        statuses=None,
    )
    if not memberships:
        return False
    active_accounts = repository.list_accounts_for_principal(
        principal_id=principal_id,
        membership_statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
    )
    return not active_accounts


class CommercialServicePortalMixin(CommercialServiceAuditMixin):
    def resolve_portal_account_principal_scope(
        self,
        *,
        account_id: str,
        principal_id: str,
    ) -> dict[str, object]:
        normalized_account_id = str(account_id or "").strip()
        normalized_principal_id = str(principal_id or "").strip()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            membership_row = repository.get_account_user_membership(
                principal_id=normalized_principal_id,
                account_id=normalized_account_id,
            )
            if membership_row is None:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    "portal account access is required",
                )
            account, identity, membership = membership_row
            if (
                account.status != ACCOUNT_STATUS_ACTIVE
                or identity.status != PRINCIPAL_STATUS_ACTIVE
                or membership.status != ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE
            ):
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    "portal account access is required",
                )
            active_principal_count = repository.count_active_account_principals(
                account_id=normalized_account_id
            )
            active_site_count = repository.count_active_account_sites(
                account_id=normalized_account_id
            )
            principal_bound_site_count = repository.count_active_principal_bound_sites(
                account_id=normalized_account_id,
                principal_id=normalized_principal_id,
            )
            return {
                "active_principal_count": active_principal_count,
                "active_site_count": active_site_count,
                "principal_bound_site_count": principal_bound_site_count,
                "is_exclusive": (
                    active_principal_count == 1
                    and active_site_count > 0
                    and principal_bound_site_count == active_site_count
                ),
            }

    def get_portal_current_subscription(
        self,
        *,
        account_id: str,
    ) -> dict[str, object] | None:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            normalized_account_id = str(account_id or "").strip()
            reconciled = cast(Any, self)._reconcile_account_subscription_state_in_session(
                repository=repository,
                account_id=normalized_account_id,
                now=self.now_factory(),
            )
            if reconciled is not None:
                session.commit()
            subscription = repository.get_runtime_subscription(normalized_account_id)
            if subscription is None:
                return None
            return cast(Any, self)._serialize_subscription(subscription)

    def get_portal_account_credit_events(
        self,
        account_id: str,
        *,
        window: str = "period",
        site_id: str | None = None,
        feature: str | None = None,
        range_start_at: datetime | None = None,
        range_end_at: datetime | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, object]:
        normalized_window = str(window or "period").strip().lower()
        window_durations = {
            "24h": timedelta(hours=24),
            "7d": timedelta(days=7),
            "30d": timedelta(days=30),
        }
        if normalized_window not in {"period", *window_durations}:
            raise CommercialValidationError(
                "service.portal_credit_events_window_invalid",
                "credit event window must be one of 24h, 7d, 30d, or period",
            )
        normalized_feature = str(feature or "").strip().lower()
        allowed_features = {
            "",
            "content_generation",
            "topic_research",
            "web_search",
            "site_knowledge",
            "image_assistance",
            "audio_generation",
        }
        if normalized_feature not in allowed_features:
            raise CommercialValidationError(
                "service.portal_credit_events_feature_invalid",
                "credit event feature is not supported",
            )
        normalized_site_id = str(site_id or "").strip()
        normalized_limit = min(50, max(1, int(limit or 20)))
        normalized_offset = max(0, int(offset or 0))
        now = self.now_factory()
        service = cast(Any, self)

        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            if repository.get_account(account_id) is None:
                raise CommercialNotFoundError(
                    "service.account_not_found",
                    f"account '{account_id}' was not found",
                )
            subscriptions = repository.list_subscriptions(account_id=account_id, limit=None)
            primary_subscription = service._select_primary_subscription(subscriptions)
            period_start_at, period_end_at = service._resolve_period(primary_subscription, now)
            query_start_at = (
                now - window_durations[normalized_window]
                if normalized_window in window_durations
                else period_start_at
            )
            query_end_at = now if normalized_window in window_durations else min(period_end_at, now)
            if (range_start_at is None) != (range_end_at is None):
                raise CommercialValidationError(
                    "service.portal_credit_events_range_invalid",
                    "credit event start_at and end_at must be provided together",
                )
            if range_start_at is not None and range_end_at is not None:
                if range_start_at >= range_end_at:
                    raise CommercialValidationError(
                        "service.portal_credit_events_range_invalid",
                        "credit event start_at must be earlier than end_at",
                    )
                query_start_at = max(query_start_at, range_start_at)
                query_end_at = min(query_end_at, range_end_at)
            group_rows, total, consumed_ai_credits = repository.list_portal_credit_event_groups(
                account_id=account_id,
                subscription_id=(
                    primary_subscription.subscription_id
                    if normalized_window == "period" and primary_subscription
                    else None
                ),
                event_types=[CREDIT_LEDGER_EVENT_CONSUME],
                since=query_start_at,
                until=query_end_at,
                site_id=normalized_site_id,
                feature=normalized_feature,
                limit=normalized_limit,
                offset=normalized_offset,
            )
            run_ids = [str(row.get("run_id") or "") for row in group_rows if row.get("run_id")]
            ledger_entry_ids = [
                str(row.get("group_id") or "") for row in group_rows if not row.get("run_id")
            ]
            entries = repository.list_credit_ledger_entries_for_event_groups(
                account_id=account_id,
                run_ids=run_ids,
                ledger_entry_ids=ledger_entry_ids,
            )
            components_by_group: dict[str, defaultdict[str, float]] = defaultdict(
                lambda: defaultdict(float)
            )
            for entry in entries:
                if str(getattr(entry, "event_type", "") or "") != CREDIT_LEDGER_EVENT_CONSUME:
                    continue
                group_id = str(
                    getattr(entry, "run_id", "") or getattr(entry, "ledger_entry_id", "")
                )
                source_type = str(getattr(entry, "source_type", "") or "").lower()
                component_key = (
                    "request"
                    if source_type == "runs"
                    else "model_processing"
                    if source_type in {"tokens", "tokens_total", "provider_calls_other"}
                    else "web_search"
                    if source_type == "web_search" or source_type.startswith("zhihu")
                    else "site_knowledge"
                    if source_type in {"vector_documents", "vector_chunks"}
                    else "image"
                    if "image" in source_type
                    else "audio"
                    if "audio" in source_type
                    else "other"
                )
                components_by_group[group_id][component_key] += abs(
                    float(getattr(entry, "ai_credit_delta", 0.0) or 0.0)
                )

        feature_copy = {
            "content_generation": (
                "Content writing",
                "The site used AI to draft, revise, or organize content.",
            ),
            "topic_research": (
                "Topic research",
                "The site used AI to look up public topics or hot-list information.",
            ),
            "web_search": ("Web search", "The site used AI to search public web information."),
            "site_knowledge": (
                "Site knowledge",
                "The site used AI to search or update its site knowledge.",
            ),
            "image_assistance": (
                "Image assistance",
                "The site used AI to recommend, generate, or process images.",
            ),
            "audio_generation": (
                "Audio generation",
                "The site used AI to generate or process audio.",
            ),
        }
        events: list[dict[str, object]] = []
        for row in group_rows:
            group_id = str(row.get("group_id") or "")
            run_id = str(row.get("run_id") or "")
            feature_key = str(row.get("feature_key") or "content_generation")
            feature_label, feature_detail = feature_copy[feature_key]
            net_delta = round(float(row.get("net_ai_credit_delta") or 0.0), 6)
            components = components_by_group[group_id]
            events.append(
                {
                    "event_id": f"run:{group_id}" if run_id else f"entry:{group_id}",
                    "support_reference": group_id,
                    "site_id": str(row.get("site_id") or ""),
                    "feature_key": feature_key,
                    "feature_label": feature_label,
                    "feature_detail": feature_detail,
                    "created_at": self._serialize_datetime(row.get("created_at")),
                    "net_ai_credit_delta": net_delta,
                    "consumed_ai_credits": round(max(0.0, -net_delta), 6),
                    "direction": "consumed" if net_delta < 0 else "added",
                    "component_count": int(row.get("component_count") or 0),
                    "components": [
                        {"key": key, "ai_credits": round(value, 6)}
                        for key, value in sorted(components.items())
                    ],
                }
            )
        return {
            "contract_version": "portal-credit-events-v1",
            "account_id": account_id,
            "generated_at": self._serialize_datetime(now),
            "period_start_at": self._serialize_datetime(period_start_at),
            "period_end_at": self._serialize_datetime(period_end_at),
            "filters": {
                "window": normalized_window,
                "site_id": normalized_site_id,
                "feature": normalized_feature,
                "start_at": self._serialize_datetime(query_start_at),
                "end_at": self._serialize_datetime(query_end_at),
            },
            "summary": {
                "event_count": total,
                "consumed_ai_credits": consumed_ai_credits,
            },
            "pagination": {
                "limit": normalized_limit,
                "offset": normalized_offset,
                "total": total,
                "has_more": normalized_offset + len(events) < total,
            },
            "items": events,
        }

    def get_portal_account_credit_event_buckets(
        self,
        account_id: str,
        *,
        bucket: str = "30m",
        window: str = "7d",
        site_id: str | None = None,
        feature: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, object]:
        bucket_seconds_by_key = {"10m": 600, "30m": 1800, "60m": 3600}
        normalized_bucket = str(bucket or "30m").strip().lower()
        if normalized_bucket not in bucket_seconds_by_key:
            raise CommercialValidationError(
                "service.portal_credit_event_bucket_invalid",
                "credit event bucket must be one of 10m, 30m, or 60m",
            )
        normalized_window = str(window or "7d").strip().lower()
        window_durations = {
            "24h": timedelta(hours=24),
            "7d": timedelta(days=7),
            "30d": timedelta(days=30),
        }
        if normalized_window not in {"period", *window_durations}:
            raise CommercialValidationError(
                "service.portal_credit_event_bucket_window_invalid",
                "credit event bucket window must be one of 24h, 7d, 30d, or period",
            )
        normalized_feature = str(feature or "").strip().lower()
        allowed_features = {
            "",
            "content_generation",
            "topic_research",
            "web_search",
            "site_knowledge",
            "image_assistance",
            "audio_generation",
        }
        if normalized_feature not in allowed_features:
            raise CommercialValidationError(
                "service.portal_credit_event_bucket_feature_invalid",
                "credit event bucket feature is not supported",
            )
        normalized_site_id = str(site_id or "").strip()
        normalized_limit = min(50, max(1, int(limit or 20)))
        normalized_offset = max(0, int(offset or 0))
        bucket_seconds = bucket_seconds_by_key[normalized_bucket]
        now = self.now_factory()
        service = cast(Any, self)
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            if repository.get_account(account_id) is None:
                raise CommercialNotFoundError(
                    "service.account_not_found",
                    f"account '{account_id}' was not found",
                )
            subscriptions = repository.list_subscriptions(account_id=account_id, limit=None)
            primary_subscription = service._select_primary_subscription(subscriptions)
            period_start_at, period_end_at = service._resolve_period(primary_subscription, now)
            query_start_at = (
                now - window_durations[normalized_window]
                if normalized_window in window_durations
                else period_start_at
            )
            query_end_at = now if normalized_window in window_durations else min(period_end_at, now)
            bucket_rows = repository.summarize_portal_credit_event_buckets(
                account_id=account_id,
                subscription_id=(
                    primary_subscription.subscription_id
                    if normalized_window == "period" and primary_subscription
                    else None
                ),
                event_types=[CREDIT_LEDGER_EVENT_CONSUME],
                since=query_start_at,
                until=query_end_at,
                bucket_seconds=bucket_seconds,
                site_id=normalized_site_id,
                feature=normalized_feature,
            )
        items: list[dict[str, object]] = []
        for row in bucket_rows:
            bucket_index = int(row.get("bucket_index") or 0)
            raw_start_at = datetime.fromtimestamp(bucket_index * bucket_seconds, UTC)
            raw_end_at = raw_start_at + timedelta(seconds=bucket_seconds)
            bucket_start_at = max(raw_start_at, query_start_at)
            bucket_end_at = min(raw_end_at, query_end_at)
            if bucket_start_at >= bucket_end_at:
                continue
            features = cast(list[dict[str, Any]], row.get("features") or [])
            feature_totals = [
                {
                    "feature_key": str(item.get("feature_key") or "content_generation"),
                    "consumed_ai_credits": round(
                        max(0.0, -float(item.get("net_ai_credit_delta") or 0.0)),
                        6,
                    ),
                    "event_count": int(item.get("event_count") or 0),
                }
                for item in features
            ]
            feature_totals.sort(
                key=lambda item: service._coerce_float(item.get("consumed_ai_credits")),
                reverse=True,
            )
            net_delta = round(float(row.get("net_ai_credit_delta") or 0.0), 6)
            items.append(
                {
                    "bucket_id": f"{normalized_bucket}:{bucket_index}",
                    "start_at": self._serialize_datetime(bucket_start_at),
                    "end_at": self._serialize_datetime(bucket_end_at),
                    "consumed_ai_credits": round(max(0.0, -net_delta), 6),
                    "event_count": int(row.get("event_count") or 0),
                    "site_count": int(row.get("site_count") or 0),
                    "top_feature_key": (
                        str(feature_totals[0].get("feature_key") or "") if feature_totals else ""
                    ),
                    "feature_totals": feature_totals,
                }
            )
        total = len(items)
        consumed_ai_credits = round(
            sum(service._coerce_float(item.get("consumed_ai_credits")) for item in items),
            6,
        )
        paged_items = items[normalized_offset : normalized_offset + normalized_limit]
        return {
            "contract_version": "portal-credit-event-buckets-v1",
            "account_id": account_id,
            "generated_at": self._serialize_datetime(now),
            "period_start_at": self._serialize_datetime(period_start_at),
            "period_end_at": self._serialize_datetime(period_end_at),
            "bucket": normalized_bucket,
            "bucket_seconds": bucket_seconds,
            "timezone": "UTC",
            "filters": {
                "window": normalized_window,
                "site_id": normalized_site_id,
                "feature": normalized_feature,
            },
            "summary": {
                "bucket_count": total,
                "consumed_ai_credits": consumed_ai_credits,
            },
            "pagination": {
                "limit": normalized_limit,
                "offset": normalized_offset,
                "total": total,
                "has_more": normalized_offset + len(paged_items) < total,
            },
            "items": paged_items,
        }

    def get_portal_account_credit_trend(
        self,
        account_id: str,
        *,
        window: str = "24h",
        site_id: str | None = None,
    ) -> dict[str, object]:
        normalized_window = str(window or "24h").strip().lower()
        window_config = {
            "1h": (timedelta(hours=1), timedelta(minutes=5)),
            "24h": (timedelta(hours=24), timedelta(hours=1)),
            "7d": (timedelta(days=7), timedelta(days=1)),
            "30d": (timedelta(days=30), timedelta(days=1)),
        }.get(normalized_window)
        if window_config is None:
            raise CommercialValidationError(
                "service.portal_credit_trend_window_invalid",
                "credit trend window must be one of 1h, 24h, 7d, or 30d",
            )
        duration, bucket_size = window_config
        end_at = self.now_factory()
        start_at = end_at - duration
        bucket_count = max(1, int(duration / bucket_size))
        buckets = [
            (
                start_at + bucket_size * index,
                start_at + bucket_size * (index + 1),
            )
            for index in range(bucket_count)
        ]
        normalized_site_id = str(site_id or "").strip()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            if repository.get_account(account_id) is None:
                raise CommercialNotFoundError(
                    "service.account_not_found",
                    f"account '{account_id}' was not found",
                )
            summaries = repository.summarize_credit_consumption_buckets(
                account_id=account_id,
                buckets=buckets,
                site_ids=[normalized_site_id] if normalized_site_id else None,
            )
        points = [
            {
                "start_at": self._serialize_datetime(bucket_start),
                "end_at": self._serialize_datetime(bucket_end),
                "ai_credits": float(summaries.get(index, {}).get("ai_credits", 0.0)),
                "entry_count": int(summaries.get(index, {}).get("entry_count", 0)),
            }
            for index, (bucket_start, bucket_end) in enumerate(buckets)
        ]
        total_ai_credits = 0.0
        entry_count = 0
        for summary in summaries.values():
            total_ai_credits += float(summary.get("ai_credits", 0.0))
            entry_count += int(summary.get("entry_count", 0))
        return {
            "contract_version": "portal-credit-trend-v1",
            "account_id": account_id,
            "generated_at": self._serialize_datetime(end_at),
            "site_id": normalized_site_id,
            "window": normalized_window,
            "bucket_seconds": int(bucket_size.total_seconds()),
            "start_at": self._serialize_datetime(start_at),
            "end_at": self._serialize_datetime(end_at),
            "total_ai_credits": round(total_ai_credits, 6),
            "entry_count": entry_count,
            "points": points,
        }

    def issue_portal_oauth_state(
        self,
        *,
        provider: str,
        return_to: str,
        client_scope_id: str,
        ttl_seconds: int,
        nonce: str = "",
        intent: str = "login",
    ) -> dict[str, object]:
        normalized_provider = _normalize_identity_provider(provider)
        safe_return_to = _sanitize_portal_return_to(return_to)
        normalized_intent = _normalize_portal_oauth_intent(intent)
        normalized_nonce = str(nonce or "").strip()
        state = secrets.token_urlsafe(32)
        now = self.now_factory()
        expires_at = now + timedelta(seconds=max(60, int(ttl_seconds or 0)))
        metadata_json: dict[str, object] = {
            "source": "portal_oauth_start",
            "intent": normalized_intent,
        }
        if normalized_nonce:
            metadata_json["nonce_hash"] = _hash_provider_subject(
                normalized_provider,
                f"nonce:{normalized_nonce}",
            )
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            repository.create_portal_oauth_state(
                state_id=f"poas_{uuid4().hex}",
                provider=normalized_provider,
                state_hash=_hash_provider_subject(normalized_provider, state),
                return_to=safe_return_to,
                client_scope_id=client_scope_id,
                expires_at=expires_at,
                metadata_json=metadata_json,
            )
            session.commit()
        return {
            "provider": normalized_provider,
            "state": state,
            "return_to": safe_return_to,
            "intent": normalized_intent,
            "expires_at": self._serialize_datetime(expires_at),
            "expires_in_seconds": max(60, int(ttl_seconds or 0)),
        }

    def consume_portal_oauth_state(
        self,
        *,
        provider: str,
        state: str,
        nonce: str = "",
    ) -> dict[str, object]:
        normalized_provider = _normalize_identity_provider(provider)
        normalized_state = str(state or "").strip()
        if not normalized_state:
            raise CommercialPermissionError(
                "service.portal_oauth_state_required",
                "portal OAuth state is required",
            )
        now = self.now_factory()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            row = repository.get_portal_oauth_state(
                provider=normalized_provider,
                state_hash=_hash_provider_subject(normalized_provider, normalized_state),
                for_update=True,
            )
            if row is None:
                raise CommercialPermissionError(
                    "service.portal_oauth_state_invalid",
                    "portal OAuth state is invalid",
                )
            if row.status != PORTAL_OAUTH_STATE_STATUS_PENDING or row.consumed_at is not None:
                raise CommercialPermissionError(
                    "service.portal_oauth_state_invalid",
                    "portal OAuth state is invalid",
                )
            metadata = row.metadata_json if isinstance(row.metadata_json, dict) else {}
            nonce_hash = str(metadata.get("nonce_hash") or "").strip()
            if nonce_hash:
                normalized_nonce = str(nonce or "").strip()
                if not normalized_nonce or nonce_hash != _hash_provider_subject(
                    normalized_provider,
                    f"nonce:{normalized_nonce}",
                ):
                    raise CommercialPermissionError(
                        "service.portal_oauth_nonce_invalid",
                        "portal OAuth nonce is invalid",
                    )
            if _as_utc_datetime(row.expires_at) <= now:
                row.status = PORTAL_OAUTH_STATE_STATUS_EXPIRED
                row.consumed_at = now
                session.commit()
                raise CommercialPermissionError(
                    "service.portal_oauth_state_expired",
                    "portal OAuth state has expired",
                )
            row.status = PORTAL_OAUTH_STATE_STATUS_CONSUMED
            row.consumed_at = now
            payload: dict[str, object] = {
                "provider": row.provider,
                "return_to": row.return_to or "/portal",
                "client_scope_id": row.client_scope_id or "",
                "intent": _normalize_portal_oauth_intent(str(metadata.get("intent") or "")),
            }
            session.commit()
            return payload

    def list_portal_identity_provider_bindings(
        self,
        *,
        principal_id: str,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_principal_identity_by_ref(principal_id=principal_id)
            if identity is None or identity.status != PRINCIPAL_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{principal_id}' is not active",
                )
            bindings = repository.list_identity_provider_bindings_for_principal(
                principal_id=identity.principal_id,
                status=IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
            )
            items = [
                _serialize_identity_provider_binding(
                    binding,
                    principal_id=identity.principal_id,
                )
                for binding in bindings
            ]
        return {
            "principal_id": principal_id,
            "identity_type": IDENTITY_TYPE_USER,
            "role": USER_ROLE_OWNER,
            "items": items,
        }

    def bind_portal_identity_provider(
        self,
        *,
        principal_id: str,
        provider: str,
        external_subject: str,
        unionid: str = "",
        metadata_json: dict[str, object] | None = None,
    ) -> dict[str, object]:
        normalized_provider = _normalize_identity_provider(provider)
        subject_hash = _hash_external_identity(normalized_provider, external_subject)
        unionid_hash = (
            _hash_external_identity(normalized_provider, unionid, kind="unionid") if unionid else ""
        )
        now = self.now_factory()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_principal_identity_by_ref(principal_id=principal_id)
            if identity is None or identity.status != PRINCIPAL_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{principal_id}' is not active",
                )
            existing = repository.get_identity_provider_binding(
                provider=normalized_provider,
                external_subject_hash=subject_hash,
            )
            if existing is not None and existing.principal_id != identity.principal_id:
                raise CommercialPermissionError(
                    "service.identity_provider_binding_conflict",
                    "this identity provider account is already bound to another user",
                )
            if unionid_hash:
                union_binding = repository.get_identity_provider_binding_by_unionid(
                    provider=normalized_provider,
                    unionid_hash=unionid_hash,
                )
                if (
                    union_binding is not None
                    and union_binding.principal_id != identity.principal_id
                ):
                    raise CommercialPermissionError(
                        "service.identity_provider_binding_conflict",
                        "this identity provider account is already bound to another user",
                    )
            binding = repository.upsert_identity_provider_binding(
                binding_id=f"pib_{uuid4().hex}",
                principal_id=identity.principal_id,
                provider=normalized_provider,
                external_subject_hash=subject_hash,
                unionid_hash=unionid_hash or None,
                status=IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
                metadata_json={
                    "source": "identity_provider_binding",
                    **dict(metadata_json or {}),
                },
                last_login_at=now,
            )
            session.commit()
            return _serialize_identity_provider_binding(binding, principal_id=principal_id)

    def revoke_portal_identity_provider(
        self,
        *,
        principal_id: str,
        provider: str,
    ) -> dict[str, object]:
        normalized_provider = _normalize_identity_provider(provider)
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_principal_identity_by_ref(principal_id=principal_id)
            if identity is None:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{principal_id}' is not active",
                )
            if not str(identity.email or "").strip():
                raise CommercialValidationError(
                    "service.identity_provider_binding_last_login_method",
                    "set and verify an email login before unbinding the only identity provider",
                )
            bindings = repository.list_identity_provider_bindings_for_principal(
                principal_id=identity.principal_id,
                provider=normalized_provider,
                status=IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
            )
            for binding in bindings:
                binding.status = IDENTITY_PROVIDER_BINDING_STATUS_REVOKED
            if bindings:
                repository.increment_principal_session_version(
                    principal_id=identity.principal_id,
                )
            session.commit()
            return {
                "provider": normalized_provider,
                "principal_id": principal_id,
                "revoked": len(bindings),
            }

    def resolve_portal_identity_provider_login(
        self,
        *,
        provider: str,
        external_subject: str,
        unionid: str = "",
    ) -> dict[str, object]:
        normalized_provider = _normalize_identity_provider(provider)
        subject_hash = _hash_external_identity(normalized_provider, external_subject)
        unionid_hash = (
            _hash_external_identity(normalized_provider, unionid, kind="unionid") if unionid else ""
        )
        now = self.now_factory()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            binding = repository.get_identity_provider_binding(
                provider=normalized_provider,
                external_subject_hash=subject_hash,
            )
            if binding is None and unionid_hash:
                binding = repository.get_identity_provider_binding_by_unionid(
                    provider=normalized_provider,
                    unionid_hash=unionid_hash,
                )
            if binding is None:
                return {
                    "status": "binding_required",
                    "provider": normalized_provider,
                    "identity_type": IDENTITY_TYPE_USER,
                    "role": USER_ROLE_OWNER,
                }
            if binding.status != IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.identity_provider_binding_revoked",
                    "this identity provider binding is not active",
                )
            identity = repository.get_principal_identity(binding.principal_id)
            if identity is None or identity.status != PRINCIPAL_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    "bound user is not active",
                )
            memberships = repository.list_accounts_for_principal(
                principal_id=identity.principal_id,
                membership_statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
            )
            if not memberships:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{identity.principal_id}' is not active for any customer account",
                )
            binding.last_login_at = now
            identity.last_login_at = now
            session.commit()
            return {
                "status": "authenticated",
                "provider": normalized_provider,
                "principal_id": identity.principal_id,
                "session_version": int(identity.session_version or 1),
                "identity_type": IDENTITY_TYPE_USER,
                "role": USER_ROLE_OWNER,
                "binding": _serialize_identity_provider_binding(
                    binding,
                    principal_id=identity.principal_id,
                ),
            }

    def register_portal_identity_provider_login(
        self,
        *,
        provider: str,
        external_subject: str,
        unionid: str = "",
        display_name: str = "",
        avatar_url: str = "",
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        normalized_provider = _normalize_identity_provider(provider)
        subject_hash = _hash_external_identity(normalized_provider, external_subject)
        unionid_hash = (
            _hash_external_identity(normalized_provider, unionid, kind="unionid") if unionid else ""
        )
        normalized_display_name = " ".join(str(display_name or "").split())[:80]
        normalized_avatar_url = str(avatar_url or "").strip()[:1024]
        if normalized_avatar_url and not normalized_avatar_url.startswith("https://"):
            normalized_avatar_url = ""
        now = self.now_factory()

        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            existing = repository.get_identity_provider_binding(
                provider=normalized_provider,
                external_subject_hash=subject_hash,
            )
            if existing is None and unionid_hash:
                existing = repository.get_identity_provider_binding_by_unionid(
                    provider=normalized_provider,
                    unionid_hash=unionid_hash,
                )
            if existing is not None:
                raise CommercialPermissionError(
                    "service.identity_provider_binding_conflict",
                    "this identity provider account is already registered",
                )

            principal_id = _new_principal_id()
            account_id = f"acct_{principal_id.removeprefix('prn_')}"
            profile_metadata = {
                "display_name": normalized_display_name,
                "avatar_url": normalized_avatar_url,
            }
            account = repository.upsert_account(
                account_id=account_id,
                name=normalized_display_name or "QQ 用户",
                status=ACCOUNT_STATUS_ACTIVE,
                metadata_json={
                    "source": "portal_self_registration",
                    "created_via": "qq_login",
                },
            )
            identity = repository.upsert_principal_identity(
                principal_id=principal_id,
                email=None,
                status=PRINCIPAL_STATUS_ACTIVE,
                metadata_json={
                    "source": "portal_self_registration",
                    "identity_type": IDENTITY_TYPE_USER,
                    "provider": normalized_provider,
                    "profile": profile_metadata,
                },
                last_login_at=now,
            )
            repository.upsert_account_user_membership(
                membership_id=f"aum_{uuid4().hex}",
                principal_id=identity.principal_id,
                account_id=account.account_id,
                role=normalize_user_role(USER_ROLE_OWNER),
                status=ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
                allowed_actions_json=resolve_principal_allowed_actions(),
                metadata_json={
                    "source": "portal_self_registration",
                    "created_via": "qq_login",
                },
            )
            binding = repository.upsert_identity_provider_binding(
                binding_id=f"pib_{uuid4().hex}",
                principal_id=identity.principal_id,
                provider=normalized_provider,
                external_subject_hash=subject_hash,
                unionid_hash=unionid_hash or None,
                status=IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
                metadata_json={
                    "source": "portal_qq_self_registration",
                    "profile": profile_metadata,
                },
                last_login_at=now,
            )
            payload: dict[str, object] = {
                "status": "registered",
                "provider": normalized_provider,
                "principal_id": identity.principal_id,
                "session_version": int(identity.session_version or 1),
                "account_id": account.account_id,
                "identity_type": IDENTITY_TYPE_USER,
                "role": USER_ROLE_OWNER,
                "binding": _serialize_identity_provider_binding(
                    binding,
                    principal_id=identity.principal_id,
                ),
                "subscription": None,
                "free_entitlement_state": "pending_addon_connection",
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="portal.registration",
                outcome="succeeded",
                account_id=account.account_id,
                scope_kind="account_membership",
                scope_id=identity.principal_id,
                payload_json={
                    "status": "registered",
                    "provider": normalized_provider,
                    "created_via": "qq_login",
                    "account_id": account.account_id,
                    "principal_id": identity.principal_id,
                },
            )
            session.commit()
        return payload

    def issue_portal_login_code(
        self,
        *,
        email: str,
        ttl_seconds: int,
    ) -> dict[str, object]:
        login = self.resolve_principal_login(email=email)
        normalized_email = str(login.get("email") or "").strip().lower()
        principal_id = str(login.get("principal_id") or "").strip()
        now = self.now_factory()
        expires_at = now + timedelta(seconds=max(60, int(ttl_seconds or 0)))
        code = f"{secrets.randbelow(1_000_000):06d}"
        code_hash = build_secret_hash(code)

        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            repository.expire_pending_portal_login_codes(
                email=normalized_email,
                purpose=PORTAL_LOGIN_CODE_PURPOSE_LOGIN,
                now=now,
            )
            repository.create_portal_login_code(
                code_id=f"plc_{uuid4().hex}",
                email=normalized_email,
                principal_id=principal_id,
                code_hash=code_hash,
                purpose=PORTAL_LOGIN_CODE_PURPOSE_LOGIN,
                expires_at=expires_at,
                metadata_json={"accounts": login.get("accounts") or []},
            )
            session.commit()
        return {
            "email": normalized_email,
            "principal_id": principal_id,
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
        try:
            normalized_email = _normalize_principal_email(email)
        except CommercialPermissionError as error:
            raise CommercialPermissionError(
                "service.portal_email_invalid",
                "a valid portal email is required",
            ) from error
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
                purpose=PORTAL_LOGIN_CODE_PURPOSE_LOGIN,
                active_only=True,
                now=now,
                limit=1,
                for_update=True,
            )
            if not active_codes:
                raise CommercialPermissionError(
                    "service.portal_login_code_invalid",
                    "portal login code is invalid",
                )
            active_code = active_codes[0]
            if not verify_secret_hash(normalized_code, str(active_code.code_hash or "")):
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
            principal_id = str(active_code.principal_id or "").strip()
            identity = repository.get_principal_identity_by_ref(
                principal_id=principal_id,
            )
            memberships = repository.list_accounts_for_principal(
                principal_id=principal_id,
                membership_statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
            )
            if identity is None or not memberships:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{principal_id}' is not active for any customer account",
                )
            identity.last_login_at = now
            session.commit()
        return {
            "email": normalized_email,
            "principal_id": principal_id,
            "session_version": int(getattr(identity, "session_version", 1) or 1),
            "last_login_at": self._serialize_datetime(now),
        }

    def issue_portal_email_change_code(
        self,
        *,
        principal_id: str,
        new_email: str,
        ttl_seconds: int,
    ) -> dict[str, object]:
        normalized_principal_id = str(principal_id or "").strip()
        normalized_new_email = _normalize_principal_email(new_email)
        now = self.now_factory()
        expires_at = now + timedelta(seconds=max(60, int(ttl_seconds or 0)))
        code = f"{secrets.randbelow(1_000_000):06d}"
        code_hash = build_secret_hash(code)

        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_principal_identity_by_ref(
                principal_id=normalized_principal_id,
            )
            if identity is None or identity.status != PRINCIPAL_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{normalized_principal_id}' is not active",
                )
            current_email = str(identity.email or "").strip().lower()
            if current_email and normalized_new_email == current_email:
                raise CommercialValidationError(
                    "service.portal_email_change_same_email",
                    "new email is already the current portal email",
                )
            existing_identity = repository.get_principal_identity_by_email(
                email=normalized_new_email,
            )
            if (
                existing_identity is not None
                and existing_identity.principal_id != normalized_principal_id
            ):
                raise CommercialValidationError(
                    "service.portal_email_change_email_in_use",
                    "new email is already used by another portal user",
                )
            repository.expire_pending_portal_login_codes(
                email=normalized_new_email,
                purpose=PORTAL_LOGIN_CODE_PURPOSE_EMAIL_CHANGE,
                now=now,
            )
            repository.create_portal_login_code(
                code_id=f"plc_{uuid4().hex}",
                email=normalized_new_email,
                principal_id=normalized_principal_id,
                code_hash=code_hash,
                purpose=PORTAL_LOGIN_CODE_PURPOSE_EMAIL_CHANGE,
                expires_at=expires_at,
                metadata_json={
                    "purpose": PORTAL_LOGIN_CODE_PURPOSE_EMAIL_CHANGE,
                    "old_email": current_email,
                    "new_email": normalized_new_email,
                },
            )
            session.commit()
        return {
            "principal_id": normalized_principal_id,
            "old_email": current_email,
            "new_email": normalized_new_email,
            "code": code,
            "expires_at": self._serialize_datetime(expires_at),
            "expires_in_seconds": max(60, int(ttl_seconds or 0)),
        }

    def verify_portal_email_change_code(
        self,
        *,
        principal_id: str,
        new_email: str,
        code: str,
        max_attempts: int,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        normalized_principal_id = str(principal_id or "").strip()
        normalized_new_email = _normalize_principal_email(new_email)
        normalized_code = str(code or "").strip()
        if not normalized_code or not normalized_code.isdigit():
            raise CommercialPermissionError(
                "service.portal_email_change_code_invalid",
                "portal email change code is invalid",
            )

        now = self.now_factory()
        bounded_attempts = max(1, int(max_attempts or 0))
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_principal_identity_by_ref(
                principal_id=normalized_principal_id,
            )
            if identity is None or identity.status != PRINCIPAL_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{normalized_principal_id}' is not active",
                )
            current_email = str(identity.email or "").strip().lower()
            active_codes = repository.list_portal_login_codes(
                email=normalized_new_email,
                principal_id=normalized_principal_id,
                purpose=PORTAL_LOGIN_CODE_PURPOSE_EMAIL_CHANGE,
                active_only=True,
                now=now,
                limit=10,
                for_update=True,
            )
            active_code = None
            active_metadata: dict[str, object] = {}
            for candidate in active_codes:
                metadata = _portal_email_change_code_metadata(candidate.metadata_json)
                if metadata:
                    active_code = candidate
                    active_metadata = metadata
                    break
            if active_code is None:
                raise CommercialPermissionError(
                    "service.portal_email_change_code_invalid",
                    "portal email change code is invalid",
                )
            old_email = str(active_metadata.get("old_email") or current_email).strip().lower()
            if old_email != current_email:
                active_code.status = PORTAL_LOGIN_CODE_STATUS_EXPIRED
                active_code.consumed_at = now
                session.commit()
                raise CommercialPermissionError(
                    "service.portal_email_change_code_invalid",
                    "portal email change code is invalid",
                )
            if not verify_secret_hash(normalized_code, str(active_code.code_hash or "")):
                active_code.attempt_count = int(active_code.attempt_count or 0) + 1
                if active_code.attempt_count >= bounded_attempts:
                    active_code.status = PORTAL_LOGIN_CODE_STATUS_LOCKED
                    active_code.consumed_at = now
                session.commit()
                raise CommercialPermissionError(
                    "service.portal_email_change_code_invalid",
                    "portal email change code is invalid",
                )
            existing_identity = repository.get_principal_identity_by_email(
                email=normalized_new_email,
            )
            if (
                existing_identity is not None
                and existing_identity.principal_id != normalized_principal_id
            ):
                active_code.status = PORTAL_LOGIN_CODE_STATUS_EXPIRED
                active_code.consumed_at = now
                session.commit()
                raise CommercialValidationError(
                    "service.portal_email_change_email_in_use",
                    "new email is already used by another portal user",
                )
            active_code.status = PORTAL_LOGIN_CODE_STATUS_CONSUMED
            active_code.consumed_at = now
            identity.email = normalized_new_email
            identity = (
                repository.increment_principal_session_version(
                    principal_id=normalized_principal_id,
                )
                or identity
            )
            payload: dict[str, object] = {
                "principal_id": normalized_principal_id,
                "old_email": current_email,
                "new_email": normalized_new_email,
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="principal.email_change",
                outcome="succeeded",
                scope_kind="principal",
                scope_id=normalized_principal_id,
                payload_json=payload,
            )
            session.commit()
        return payload

    def revoke_portal_sessions(self, *, principal_id: str) -> dict[str, object]:
        normalized_principal_id = str(principal_id or "").strip()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_principal_identity_by_ref(
                principal_id=normalized_principal_id,
            )
            if identity is None or identity.status != PRINCIPAL_STATUS_ACTIVE:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    "principal is not active",
                )
            updated = repository.increment_principal_session_version(
                principal_id=normalized_principal_id,
            )
            session.commit()
        return {
            "principal_id": normalized_principal_id,
            "session_version": int(getattr(updated, "session_version", 1) or 1),
        }

    def cleanup_expired_portal_auth_evidence(
        self,
        *,
        retention_days: int,
        now: datetime | None = None,
    ) -> dict[str, int]:
        current = now or self.now_factory()
        before = current - timedelta(days=max(1, int(retention_days or 0)))
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            result = repository.purge_expired_portal_auth_evidence(before=before)
            session.commit()
        return result

    def issue_portal_registration_code(
        self,
        *,
        email: str,
        ttl_seconds: int,
    ) -> dict[str, object]:
        normalized_email = _normalize_principal_email(email)
        principal_id = _new_principal_id()
        account_id = f"acct_{principal_id.removeprefix('prn_')}"
        now = self.now_factory()
        expires_at = now + timedelta(seconds=max(60, int(ttl_seconds or 0)))
        code = f"{secrets.randbelow(1_000_000):06d}"
        code_hash = build_secret_hash(code)

        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            existing_identity = repository.get_principal_identity_by_email(email=normalized_email)
            if existing_identity is not None:
                principal_id = str(existing_identity.principal_id or "").strip() or principal_id
                if _principal_registration_access_is_blocked(
                    repository,
                    principal_id=principal_id,
                    principal_status=str(existing_identity.status or ""),
                ):
                    raise CommercialPermissionError(
                        "service.principal_access_required",
                        "portal registration is unavailable for this principal",
                    )
                account_id = f"acct_{principal_id.removeprefix('prn_')}"
            repository.expire_pending_portal_login_codes(
                email=normalized_email,
                purpose=PORTAL_LOGIN_CODE_PURPOSE_REGISTRATION,
                now=now,
            )
            repository.create_portal_login_code(
                code_id=f"plc_{uuid4().hex}",
                email=normalized_email,
                principal_id=principal_id,
                code_hash=code_hash,
                purpose=PORTAL_LOGIN_CODE_PURPOSE_REGISTRATION,
                expires_at=expires_at,
                metadata_json={
                    "purpose": PORTAL_LOGIN_CODE_PURPOSE_REGISTRATION,
                    "source": "portal_self_registration",
                    "account_id": account_id,
                },
            )
            session.commit()
        return {
            "email": normalized_email,
            "principal_id": principal_id,
            "account_id": account_id,
            "site_id": "",
            "site_name": "",
            "site_url": "",
            "platform_kind": PLATFORM_KIND_WORDPRESS,
            "code": code,
            "expires_at": self._serialize_datetime(expires_at),
            "expires_in_seconds": max(60, int(ttl_seconds or 0)),
        }

    def verify_portal_registration_code(
        self,
        *,
        email: str,
        code: str,
        max_attempts: int,
        audit_context: ServiceAuditContext | None = None,
        verified_at: datetime | None = None,
    ) -> dict[str, object]:
        normalized_email = _normalize_principal_email(email)
        normalized_code = str(code or "").strip()
        if not normalized_code or not normalized_code.isdigit():
            raise CommercialPermissionError(
                "service.portal_registration_code_invalid",
                "portal registration code is invalid",
            )
        now = verified_at or self.now_factory()
        bounded_attempts = max(1, int(max_attempts or 0))
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            active_codes = repository.list_portal_login_codes(
                email=normalized_email,
                purpose=PORTAL_LOGIN_CODE_PURPOSE_REGISTRATION,
                active_only=True,
                now=now,
                limit=None,
                for_update=True,
            )
            active_code = None
            registration_metadata: dict[str, object] = {}
            for candidate in active_codes:
                registration_metadata = _portal_registration_code_metadata(candidate.metadata_json)
                if registration_metadata:
                    active_code = candidate
                    break
            if active_code is None:
                raise CommercialPermissionError(
                    "service.portal_registration_code_invalid",
                    "portal registration code is invalid",
                )
            if not verify_secret_hash(normalized_code, str(active_code.code_hash or "")):
                active_code.attempt_count = int(active_code.attempt_count or 0) + 1
                if active_code.attempt_count >= bounded_attempts:
                    active_code.status = PORTAL_LOGIN_CODE_STATUS_LOCKED
                    active_code.consumed_at = now
                session.commit()
                raise CommercialPermissionError(
                    "service.portal_registration_code_invalid",
                    "portal registration code is invalid",
                )
            active_code.status = PORTAL_LOGIN_CODE_STATUS_CONSUMED
            active_code.consumed_at = now
            principal_id = str(active_code.principal_id or "").strip()
            identity = repository.get_principal_identity_by_email(email=normalized_email)
            if identity is not None:
                principal_id = str(identity.principal_id or "").strip()
                if _principal_registration_access_is_blocked(
                    repository,
                    principal_id=principal_id,
                    principal_status=str(identity.status or ""),
                ):
                    session.commit()
                    raise CommercialPermissionError(
                        "service.principal_access_required",
                        "portal registration is unavailable for this principal",
                    )
                memberships = repository.list_accounts_for_principal(
                    principal_id=principal_id,
                    membership_statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
                )
                if memberships:
                    identity.last_login_at = now
                    session.commit()
                    return {
                        "status": "existing_user",
                        "email": normalized_email,
                        "principal_id": principal_id,
                        "session_version": int(getattr(identity, "session_version", 1) or 1),
                        "site_id": "",
                        "last_login_at": self._serialize_datetime(now),
                        "next": {"portal_path": "/portal"},
                    }

            account_id = str(registration_metadata.get("account_id") or "").strip()
            if not principal_id:
                principal_id = _new_principal_id()
            if not account_id:
                account_id = f"acct_{principal_id.removeprefix('prn_')}"
            account = repository.upsert_account(
                account_id=account_id,
                name=normalized_email,
                status=ACCOUNT_STATUS_ACTIVE,
                metadata_json={
                    "source": "portal_self_registration",
                    "registration_email": normalized_email,
                    "created_via": "portal_register",
                },
            )
            identity = repository.upsert_principal_identity(
                principal_id=principal_id,
                email=normalized_email,
                status=PRINCIPAL_STATUS_ACTIVE,
                metadata_json={
                    "source": "portal_self_registration",
                    "identity_type": IDENTITY_TYPE_USER,
                },
                last_login_at=now,
            )
            repository.upsert_account_user_membership(
                membership_id=f"aum_{uuid4().hex}",
                principal_id=identity.principal_id,
                account_id=account.account_id,
                role=normalize_user_role(USER_ROLE_OWNER),
                status=ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
                allowed_actions_json=resolve_principal_allowed_actions(),
                metadata_json={"source": "portal_self_registration"},
            )
            service = cast(Any, self)
            payload: dict[str, object] = {
                "status": "registered",
                "email": normalized_email,
                "principal_id": identity.principal_id,
                "session_version": int(identity.session_version or 1),
                "account": service._serialize_account(account),
                "account_id": account.account_id,
                "site": None,
                "site_id": "",
                "subscription": None,
                "free_entitlement_state": "pending_addon_connection",
                "identity_type": IDENTITY_TYPE_USER,
                "role": USER_ROLE_OWNER,
                "allowed_actions": resolve_principal_allowed_actions(),
                "next": {
                    "portal_path": "/portal",
                    "qq_bind_path": "/portal/account",
                    "connection_path": "/portal",
                },
            }
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="portal.registration",
                outcome="succeeded",
                account_id=account.account_id,
                site_id="",
                scope_kind="account_membership",
                scope_id=identity.principal_id,
                payload_json={
                    **payload,
                    "email": normalized_email,
                    "registration_code_id": str(active_code.code_id or ""),
                },
            )
            session.commit()
        return payload

    def list_portal_accounts(
        self,
        *,
        principal_id: str,
    ) -> dict[str, object]:
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            memberships = repository.list_accounts_for_principal(
                principal_id=principal_id,
                membership_statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
            )
            sites_by_account: defaultdict[str, list[Site]] = defaultdict(list)
            for site, _identity, _membership in repository.list_sites_for_principal(
                principal_id=principal_id,
                membership_statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
            ):
                if site.account_id:
                    sites_by_account[site.account_id].append(site)
            account_items: list[dict[str, object]] = []
            for account, _identity, membership in memberships:
                account_id = str(getattr(account, "account_id", "") or "")
                account_items.append(
                    {
                        "account_id": account_id,
                        "name": str(getattr(account, "name", "") or ""),
                        "status": str(getattr(account, "status", "") or ""),
                        "principal_id": principal_id,
                        "identity_type": IDENTITY_TYPE_USER,
                        "allowed_actions": _resolve_membership_allowed_actions(
                            getattr(membership, "allowed_actions_json", None)
                        ),
                        "role": str(getattr(membership, "role", "") or USER_ROLE_OWNER),
                        "membership_id": str(getattr(membership, "membership_id", "") or ""),
                        "membership_status": str(getattr(membership, "status", "") or ""),
                        "site_count": len(sites_by_account.get(account_id, [])),
                        "sites": [
                            cast(Any, self)._serialize_site(site)
                            for site in sites_by_account.get(account_id, [])
                        ],
                    }
                )
            return {
                "principal_id": principal_id,
                "items": account_items,
            }

    def upsert_account_member_access(
        self,
        *,
        account_id: str,
        email: str,
        status: str = PRINCIPAL_STATUS_ACTIVE,
        site_id: str = "",
        metadata_json: dict[str, object] | None = None,
        audit_context: ServiceAuditContext | None = None,
    ) -> dict[str, object]:
        normalized_email = _normalize_principal_email(email)
        normalized_status = str(status or PRINCIPAL_STATUS_ACTIVE).strip().lower()
        normalized_site_id = str(site_id or "").strip()
        if normalized_status not in {PRINCIPAL_STATUS_ACTIVE, PRINCIPAL_STATUS_DISABLED}:
            raise CommercialValidationError(
                "service.account_membership_status_invalid",
                "account membership status must be active or disabled",
            )
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            account = repository.get_account_for_update(account_id)
            if account is None:
                raise CommercialPermissionError(
                    "service.account_not_found",
                    f"account '{account_id}' was not found",
                )
            existing_identity = repository.get_principal_identity_by_email(
                email=normalized_email,
                for_update=True,
            )
            if existing_identity is None:
                if normalized_status == PRINCIPAL_STATUS_DISABLED:
                    raise CommercialNotFoundError(
                        "service.account_membership_not_found",
                        f"account membership for '{normalized_email}' was not found",
                    )
                principal_id = _new_principal_id()
                identity = repository.upsert_principal_identity(
                    principal_id=principal_id,
                    email=normalized_email,
                    status=PRINCIPAL_STATUS_ACTIVE,
                    metadata_json={
                        "source": "account_membership",
                        "identity_type": IDENTITY_TYPE_USER,
                    },
                )
            else:
                identity = existing_identity
                principal_id = str(identity.principal_id)
            existing_membership_row = repository.get_account_user_membership(
                principal_id=principal_id,
                account_id=account_id,
            )
            existing_membership = (
                existing_membership_row[2]
                if existing_membership_row is not None
                else None
            )
            if normalized_status == PRINCIPAL_STATUS_ACTIVE:
                if str(identity.status or "") != PRINCIPAL_STATUS_ACTIVE:
                    raise CommercialPermissionError(
                        "service.principal_access_required",
                        f"principal '{principal_id}' is not active",
                    )
                assert_single_account_membership_available(
                    repository,
                    principal_id=principal_id,
                    account_id=account_id,
                )
            elif existing_membership_row is None:
                raise CommercialNotFoundError(
                    "service.account_membership_not_found",
                    f"account membership for '{normalized_email}' was not found",
                )
            existing_membership_metadata = (
                dict(existing_membership.metadata_json or {})
                if existing_membership is not None
                else {}
            )
            requested_membership_metadata = dict(metadata_json or {})
            membership = repository.upsert_account_user_membership(
                membership_id=f"aum_{uuid4().hex}",
                principal_id=identity.principal_id,
                account_id=account_id,
                role=normalize_user_role(USER_ROLE_OWNER),
                status=(
                    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE
                    if normalized_status == PRINCIPAL_STATUS_ACTIVE
                    else ACCOUNT_USER_MEMBERSHIP_STATUS_REVOKED
                ),
                allowed_actions_json=(
                    list(existing_membership.allowed_actions_json or [])
                    if existing_membership is not None
                    else resolve_principal_allowed_actions()
                ),
                metadata_json={
                    **existing_membership_metadata,
                    **requested_membership_metadata,
                    "source": str(
                        requested_membership_metadata.get("source")
                        or existing_membership_metadata.get("source")
                        or "account_membership"
                    ),
                },
            )
            if normalized_site_id and normalized_status == PRINCIPAL_STATUS_ACTIVE:
                site = repository.get_site_for_update(normalized_site_id)
                if site is None or str(site.account_id or "") != account_id:
                    raise CommercialNotFoundError(
                        "service.site_not_found",
                        f"site '{normalized_site_id}' was not found for account '{account_id}'",
                    )
                service = cast(Any, self)
                service._ensure_principal_site_binding_in_session(
                    repository=repository,
                    site=site,
                    principal_id=str(identity.principal_id),
                    account_id=account_id,
                    now=self.now_factory(),
                    source="account_membership",
                )
            payload: dict[str, object] = {
                "principal_id": identity.principal_id,
                "email": identity.email,
                "status": identity.status,
                "session_version": int(identity.session_version or 1),
                "account_id": account_id,
                "membership_id": membership.membership_id,
                "membership_status": membership.status,
            }
            if normalized_site_id:
                payload["site_id"] = normalized_site_id
            self._record_service_audit_in_session(
                repository=repository,
                audit_context=audit_context,
                event_kind="account_membership.upsert",
                outcome="succeeded",
                account_id=account_id,
                scope_kind="account_membership",
                scope_id=f"{account_id}:{principal_id}",
                payload_json=payload,
            )
            session.commit()
        return payload

    def resolve_principal_login(self, *, email: str) -> dict[str, object]:
        normalized_email = _normalize_principal_email(email)
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_principal_identity_by_email(email=normalized_email)
            principal_id = str(identity.principal_id) if identity is not None else ""
            memberships = (
                repository.list_accounts_for_principal(
                    principal_id=principal_id,
                    membership_statuses=[ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE],
                )
                if principal_id
                else []
            )
        if identity is None or not memberships:
            raise CommercialPermissionError(
                "service.principal_email_not_found",
                f"no customer account membership was found for '{normalized_email}'",
            )
        portal_accounts = self.list_portal_accounts(principal_id=principal_id)
        portal_account_items = portal_accounts.get("items")
        if not isinstance(portal_account_items, list):
            portal_account_items = []
        return {
            "email": normalized_email,
            "principal_id": principal_id,
            "session_version": int(getattr(identity, "session_version", 1) or 1),
            "sites": [],
            "accounts": [item for item in portal_account_items if isinstance(item, dict)],
        }

    def get_portal_principal_profile(self, *, principal_id: str) -> dict[str, object]:
        normalized_principal_id = str(principal_id or "").strip()
        with get_session(self.database_url) as session:
            repository = CommercialRepository(session)
            identity = repository.get_principal_identity_by_ref(
                principal_id=normalized_principal_id,
            )
            if identity is None:
                raise CommercialPermissionError(
                    "service.principal_access_required",
                    f"principal '{normalized_principal_id}' is not active",
                )
            return {
                "principal_id": normalized_principal_id,
                "email": str(identity.email or "").strip().lower(),
                "status": str(identity.status or ""),
                "session_version": int(identity.session_version or 1),
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
