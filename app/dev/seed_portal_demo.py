from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.engine import make_url

from app.core.config import Settings
from app.core.db import get_session
from app.core.models import (
    ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
    AccountSubscription,
    AccountUserMembership,
    BillingSnapshot,
    CreditLedgerEntry,
    PrincipalSiteBinding,
    ProviderCallRecord,
    RunRecord,
    ServiceAuditEvent,
    Site,
    SupportRequest,
    SupportRequestAttachment,
    SupportRequestFeedback,
    SupportRequestMessage,
    UsageMeterEvent,
)
from app.dev.bootstrap_portal_site import bootstrap_portal_site
from app.dev.seed_runtime import seed_site_auth
from app.domain.commercial.audit_context import ServiceAuditContext
from app.domain.commercial.service import CommercialService

FIXTURE_CONTRACT = "portal_demo_fixture.v1"
FIXTURE_SITE_ID = "site_smoke"
FIXTURE_EMAIL = "portal-demo@example.com"
FIXTURE_KEY_ID = "key_default"
FIXTURE_SUBSCRIPTION_ID = "sub_site_smoke"
FIXTURE_RUN_IDS = tuple(f"run_portal_demo_{index:02d}" for index in range(1, 9))
FIXTURE_SUPPORT_IDS = tuple(f"sr_portal_demo_{index:02d}" for index in range(1, 6))
FIXTURE_ACTIVITY_AUDIT_TRACE_IDS = tuple(f"portal_demo_seed_{index:02d}" for index in range(1, 6))
FIXTURE_BILLING_AUDIT_TRACE_ID = "portal_demo_seed_billing"
FIXTURE_AUDIT_TRACE_IDS = (
    *FIXTURE_ACTIVITY_AUDIT_TRACE_IDS,
    FIXTURE_BILLING_AUDIT_TRACE_ID,
)
FIXTURE_METER_DEDUPE_KEYS = tuple(
    f"portal_demo:{index:02d}:{meter_key}"
    for index in range(1, 9)
    for meter_key in ("runs", "tokens_total", "ai_credits")
)
FIXTURE_LEDGER_ENTRY_IDS = tuple(f"cle_portal_demo_{index:02d}" for index in range(1, 9))


def _validate_development_database(settings: Settings) -> None:
    environment = settings.environment.strip().lower()
    if environment not in {"development", "dev", "test"}:
        raise RuntimeError(
            "portal demo fixtures are development-only; "
            f"refusing environment {environment or 'unknown'}"
        )
    database = make_url(settings.database_url)
    if database.get_backend_name() == "sqlite":
        return
    host = str(database.host or "").strip().lower()
    if host not in {"", "localhost", "127.0.0.1", "::1", "postgres"}:
        raise RuntimeError(
            f"portal demo fixtures require a local database; refusing host {host or 'unknown'}"
        )


def _resolve_demo_identity(
    service: CommercialService,
    *,
    email: str,
) -> tuple[str, str]:
    login = service.resolve_principal_login(email=email)
    principal_id = str(login.get("principal_id") or "").strip()
    account_items = login.get("accounts")
    accounts = (
        [item for item in account_items if isinstance(item, dict)]
        if isinstance(account_items, list)
        else []
    )
    if not principal_id or len(accounts) != 1:
        raise RuntimeError("portal demo email must resolve to exactly one active account")
    account_id = str(accounts[0].get("account_id") or "").strip()
    if not account_id:
        raise RuntimeError("portal demo account id is missing")
    return principal_id, account_id


def _assert_site_reassignable(
    settings: Settings,
    *,
    site_id: str,
    account_id: str,
) -> None:
    with get_session(settings.database_url) as session:
        site = session.get(Site, site_id)
        if site is None:
            return
        metadata = site.metadata_json if isinstance(site.metadata_json, dict) else {}
        current_account_id = str(site.account_id or "")
        is_current_fixture = (
            current_account_id == account_id
            and metadata.get("fixture_contract") == FIXTURE_CONTRACT
        )
        if current_account_id == account_id and not is_current_fixture:
            raise RuntimeError(
                "refusing to overwrite a site not managed by the portal demo fixture"
            )
        if not is_current_fixture and metadata.get("source") != "seed_runtime":
            raise RuntimeError("refusing to reassign a site not created by seed_runtime")
        active_members = (
            0
            if is_current_fixture
            else int(
                session.scalar(
                    select(func.count())
                    .select_from(AccountUserMembership)
                    .where(
                        AccountUserMembership.account_id == current_account_id,
                        AccountUserMembership.status == ACCOUNT_USER_MEMBERSHIP_STATUS_ACTIVE,
                    )
                )
                or 0
            )
        )
        active_bindings = (
            0
            if is_current_fixture
            else int(
                session.scalar(
                    select(func.count())
                    .select_from(PrincipalSiteBinding)
                    .where(
                        PrincipalSiteBinding.site_id == site_id,
                        PrincipalSiteBinding.released_at.is_(None),
                    )
                )
                or 0
            )
        )
        non_fixture_runs = int(
            session.scalar(
                select(func.count())
                .select_from(RunRecord)
                .where(
                    RunRecord.site_id == site_id,
                    RunRecord.run_id.notin_(FIXTURE_RUN_IDS),
                )
            )
            or 0
        )
        non_fixture_usage = int(
            session.scalar(
                select(func.count())
                .select_from(UsageMeterEvent)
                .where(
                    UsageMeterEvent.site_id == site_id,
                    UsageMeterEvent.dedupe_key.notin_(FIXTURE_METER_DEDUPE_KEYS),
                )
            )
            or 0
        )
        non_fixture_ledger = int(
            session.scalar(
                select(func.count())
                .select_from(CreditLedgerEntry)
                .where(
                    CreditLedgerEntry.site_id == site_id,
                    CreditLedgerEntry.ledger_entry_id.notin_(FIXTURE_LEDGER_ENTRY_IDS),
                )
            )
            or 0
        )
        non_fixture_support = int(
            session.scalar(
                select(func.count())
                .select_from(SupportRequest)
                .where(
                    SupportRequest.site_id == site_id,
                    SupportRequest.request_id.notin_(FIXTURE_SUPPORT_IDS),
                )
            )
            or 0
        )
        if any(
            (
                active_members,
                active_bindings,
                non_fixture_runs,
                non_fixture_usage,
                non_fixture_ledger,
                non_fixture_support,
            )
        ):
            raise RuntimeError("refusing to reassign a seeded site with non-demo activity")


def _resolve_demo_subscription_id(
    settings: Settings,
    *,
    account_id: str,
) -> str:
    with get_session(settings.database_url) as session:
        subscription_id = session.scalar(
            select(AccountSubscription.subscription_id)
            .where(
                AccountSubscription.account_id == account_id,
                AccountSubscription.status.in_({"active", "trialing"}),
            )
            .order_by(AccountSubscription.updated_at.desc())
            .limit(1)
        )
    return str(subscription_id or FIXTURE_SUBSCRIPTION_ID)


def _ensure_demo_account_site_access(
    settings: Settings,
    *,
    service: CommercialService,
    principal_id: str,
    account_id: str,
    email: str,
) -> None:
    scope = service.resolve_portal_account_principal_scope(
        account_id=account_id,
        principal_id=principal_id,
    )
    if int(str(scope.get("active_principal_count") or 0)) != 1:
        raise RuntimeError("portal demo account must have exactly one active principal")
    with get_session(settings.database_url) as session:
        site_ids = list(
            session.scalars(
                select(Site.site_id).where(
                    Site.account_id == account_id,
                    Site.status == "active",
                )
            )
        )
        bound_site_ids = set(
            session.scalars(
                select(PrincipalSiteBinding.site_id).where(
                    PrincipalSiteBinding.principal_id == principal_id,
                    PrincipalSiteBinding.site_id.in_(site_ids),
                    PrincipalSiteBinding.released_at.is_(None),
                )
            )
        )
    for account_site_id in site_ids:
        if account_site_id in bound_site_ids:
            continue
        service.upsert_account_member_access(
            account_id=account_id,
            email=email,
            status="active",
            site_id=account_site_id,
            metadata_json={
                "source": "portal_demo_fixture",
                "fixture_contract": FIXTURE_CONTRACT,
            },
        )


def _has_active_site_binding(
    settings: Settings,
    *,
    principal_id: str,
    site_id: str,
) -> bool:
    with get_session(settings.database_url) as session:
        return bool(
            session.scalar(
                select(func.count())
                .select_from(PrincipalSiteBinding)
                .where(
                    PrincipalSiteBinding.principal_id == principal_id,
                    PrincipalSiteBinding.site_id == site_id,
                    PrincipalSiteBinding.released_at.is_(None),
                )
            )
        )


def _cleanup_fixture_rows(settings: Settings, *, site_id: str) -> None:
    with get_session(settings.database_url) as session:
        session.execute(
            delete(SupportRequestFeedback).where(
                SupportRequestFeedback.request_id.in_(FIXTURE_SUPPORT_IDS)
            )
        )
        session.execute(
            delete(SupportRequestAttachment).where(
                SupportRequestAttachment.request_id.in_(FIXTURE_SUPPORT_IDS)
            )
        )
        session.execute(
            delete(SupportRequestMessage).where(
                SupportRequestMessage.request_id.in_(FIXTURE_SUPPORT_IDS)
            )
        )
        session.execute(
            delete(SupportRequest).where(SupportRequest.request_id.in_(FIXTURE_SUPPORT_IDS))
        )
        session.execute(
            delete(CreditLedgerEntry).where(
                CreditLedgerEntry.ledger_entry_id.in_(FIXTURE_LEDGER_ENTRY_IDS)
            )
        )
        session.execute(
            delete(UsageMeterEvent).where(UsageMeterEvent.dedupe_key.in_(FIXTURE_METER_DEDUPE_KEYS))
        )
        session.execute(
            delete(ProviderCallRecord).where(ProviderCallRecord.run_id.in_(FIXTURE_RUN_IDS))
        )
        session.execute(delete(RunRecord).where(RunRecord.run_id.in_(FIXTURE_RUN_IDS)))
        session.execute(
            delete(ServiceAuditEvent).where(ServiceAuditEvent.trace_id.in_(FIXTURE_AUDIT_TRACE_IDS))
        )
        session.commit()


def _seed_activity(
    settings: Settings,
    *,
    now: datetime,
    principal_id: str,
    account_id: str,
    subscription_id: str,
    site_id: str,
    email: str,
) -> None:
    run_offsets = (15, 55, 130, 260, 420, 690, 1_020, 3_300)
    credit_quantities = (8.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 13.0)
    statuses = (
        "succeeded",
        "succeeded",
        "succeeded",
        "failed",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
    )
    with get_session(settings.database_url) as session:
        site = session.get(Site, site_id)
        if site is None:
            raise RuntimeError("portal demo site was not provisioned")
        site.name = "Npcink AI 演示站点"
        site.site_url = "https://demo.example.test"
        site.metadata_json = {
            **(site.metadata_json or {}),
            "fixture_contract": FIXTURE_CONTRACT,
            "fixture_scope": "deterministic_synthetic_portal_data",
        }
        subscription = session.get(AccountSubscription, subscription_id)
        if subscription is None or subscription.account_id != account_id:
            raise RuntimeError("portal demo subscription was not provisioned")
        period_anchor = now.replace(hour=0, minute=0, second=0, microsecond=0)
        subscription.current_period_start_at = period_anchor - timedelta(days=30)
        subscription.current_period_end_at = period_anchor + timedelta(days=30)
        subscription.started_at = subscription.started_at or period_anchor - timedelta(days=30)
        subscription.metadata_json = {
            **(subscription.metadata_json or {}),
            "fixture_contract": FIXTURE_CONTRACT,
        }

        for index, (minutes_ago, status, credits) in enumerate(
            zip(run_offsets, statuses, credit_quantities, strict=True),
            start=1,
        ):
            started_at = now - timedelta(minutes=minutes_ago)
            run_id = FIXTURE_RUN_IDS[index - 1]
            finished_at = started_at + timedelta(seconds=2 + index)
            session.add(
                RunRecord(
                    run_id=run_id,
                    site_id=site_id,
                    account_id=account_id,
                    subscription_id=subscription_id,
                    plan_version_id="free_v1",
                    ability_name="npcink-abilities-toolkit/demo-writing-support",
                    ability_family="text",
                    contract_version=FIXTURE_CONTRACT,
                    channel="wordpress",
                    execution_kind="text",
                    execution_tier="cloud",
                    execution_pattern="inline",
                    data_classification="metadata_only",
                    profile_id="hosted-default",
                    status=status,
                    idempotency_key=f"portal-demo-run-{index:02d}",
                    request_fingerprint=f"portal-demo-fingerprint-{index:02d}",
                    trace_id=f"portal_demo_run_{index:02d}",
                    input_json={},
                    policy_json={"fixture_contract": FIXTURE_CONTRACT},
                    result_json={} if status == "succeeded" else None,
                    error_code=None if status == "succeeded" else "provider.timeout",
                    error_message=None,
                    selected_provider_id="openai",
                    selected_model_id="gpt-5.5",
                    selected_instance_id="openai-gpt-5.5",
                    fallback_used=index == 6,
                    started_at=started_at,
                    processing_started_at=started_at + timedelta(milliseconds=150),
                    finished_at=finished_at,
                )
            )
            session.flush()
            session.add(
                ProviderCallRecord(
                    run_id=run_id,
                    provider_id="openai",
                    model_id="gpt-5.5",
                    instance_id="openai-gpt-5.5",
                    region="global",
                    latency_ms=1_100 + index * 170,
                    tokens_in=420 + index * 45,
                    tokens_out=160 + index * 30,
                    cost=round(0.004 + index * 0.0007, 6),
                    retry_count=1 if index == 6 else 0,
                    fallback_used=index == 6,
                    error_code=None if status == "succeeded" else "provider.timeout",
                    created_at=started_at,
                )
            )
            for meter_key, quantity in (
                ("runs", 1.0),
                ("tokens_total", float(580 + index * 75)),
                ("ai_credits", credits),
            ):
                session.add(
                    UsageMeterEvent(
                        account_id=account_id,
                        site_id=site_id,
                        subscription_id=subscription_id,
                        plan_version_id="free_v1",
                        run_id=run_id,
                        event_kind="runtime.run",
                        meter_key=meter_key,
                        quantity=quantity,
                        ability_family="text",
                        channel="wordpress",
                        execution_kind="text",
                        execution_tier="cloud",
                        data_classification="metadata_only",
                        currency="CNY" if meter_key == "ai_credits" else None,
                        dedupe_key=f"portal_demo:{index:02d}:{meter_key}",
                        payload_json={"fixture_contract": FIXTURE_CONTRACT},
                        created_at=started_at,
                    )
                )
            token_quantity = float(580 + index * 75)
            session.add(
                CreditLedgerEntry(
                    ledger_entry_id=FIXTURE_LEDGER_ENTRY_IDS[index - 1],
                    account_id=account_id,
                    site_id=site_id,
                    subscription_id=subscription_id,
                    plan_version_id="free_v1",
                    run_id=run_id,
                    provider_call_id=None,
                    event_type="consume",
                    source_type="tokens_total",
                    source_id=f"portal_demo_credit_{index:02d}",
                    ai_credit_delta=-credits,
                    quantity=token_quantity,
                    unit="tokens",
                    rate=round(credits / token_quantity, 6),
                    rate_unit="ai_credits_per_token",
                    rate_version=FIXTURE_CONTRACT,
                    idempotency_key=f"portal_demo:credit:{index:02d}",
                    metadata_json={
                        "fixture_contract": FIXTURE_CONTRACT,
                        "feature": "content_generation",
                    },
                    created_at=started_at,
                )
            )

        support_specs = (
            ("open", "high", "无法连接演示站点", "连接测试持续超时，请协助检查站点状态。"),
            ("open", "normal", "AI 额度显示疑问", "用量页的剩余额度与预期不一致，请协助确认。"),
            (
                "in_progress",
                "normal",
                "文章生成速度较慢",
                "近期文章生成耗时上升，希望确认是否为暂时波动。",
            ),
            (
                "resolved",
                "normal",
                "站点重连后数据恢复",
                "重连后历史用量已经恢复显示，问题已解决。",
            ),
            ("closed", "low", "咨询套餐能力范围", "已了解 Free 套餐的能力边界，可以关闭工单。"),
        )
        for index, (status, priority, title, description) in enumerate(support_specs, start=1):
            created_at = now - timedelta(days=6 - index, hours=index)
            request_id = FIXTURE_SUPPORT_IDS[index - 1]
            resolved_at = (
                created_at + timedelta(hours=5) if status in {"resolved", "closed"} else None
            )
            closed_at = created_at + timedelta(hours=8) if status == "closed" else None
            session.add(
                SupportRequest(
                    request_id=request_id,
                    account_id=account_id,
                    site_id=site_id,
                    principal_id=principal_id,
                    email=email,
                    topic="technical" if index in {1, 3, 4} else "billing",
                    title=title,
                    description=description,
                    status=status,
                    priority=priority,
                    source_path="/portal/support",
                    context_json={"fixture_contract": FIXTURE_CONTRACT},
                    resolved_at=resolved_at,
                    closed_at=closed_at,
                    created_at=created_at,
                    updated_at=closed_at or resolved_at or created_at,
                )
            )
            session.add(
                SupportRequestMessage(
                    message_id=f"srm_portal_demo_{index:02d}",
                    request_id=request_id,
                    account_id=account_id,
                    site_id=site_id,
                    principal_id=principal_id,
                    email=email,
                    author_kind="customer",
                    visibility="public",
                    body=description,
                    metadata_json={"fixture_contract": FIXTURE_CONTRACT},
                    created_at=created_at,
                )
            )

        audit_specs = (
            ("portal.login", "succeeded", "principal", principal_id),
            ("site.connection.verify", "succeeded", "site", site_id),
            ("runtime.execute", "succeeded", "run", FIXTURE_RUN_IDS[0]),
            ("runtime.execute", "failed", "run", FIXTURE_RUN_IDS[3]),
            ("support_request.created", "succeeded", "support_request", FIXTURE_SUPPORT_IDS[0]),
        )
        for index, (event_kind, outcome, scope_kind, scope_id) in enumerate(
            audit_specs,
            start=1,
        ):
            session.add(
                ServiceAuditEvent(
                    account_id=account_id,
                    site_id=site_id,
                    subscription_id=subscription_id,
                    plan_id="free",
                    plan_version_id="free_v1",
                    scope_kind=scope_kind,
                    scope_id=scope_id,
                    event_kind=event_kind,
                    outcome=outcome,
                    method="POST",
                    path="/portal/demo-fixture",
                    trace_id=FIXTURE_ACTIVITY_AUDIT_TRACE_IDS[index - 1],
                    actor_kind="portal_principal",
                    actor_ref=principal_id,
                    payload_json={"fixture_contract": FIXTURE_CONTRACT},
                    created_at=now - timedelta(hours=index * 3),
                )
            )
        session.commit()


def build_report(settings: Settings, *, site_id: str) -> dict[str, object]:
    with get_session(settings.database_url) as session:
        return {
            "fixture_contract": FIXTURE_CONTRACT,
            "site_id": site_id,
            "runs": int(
                session.scalar(
                    select(func.count())
                    .select_from(RunRecord)
                    .where(RunRecord.run_id.in_(FIXTURE_RUN_IDS))
                )
                or 0
            ),
            "meter_events": int(
                session.scalar(
                    select(func.count())
                    .select_from(UsageMeterEvent)
                    .where(UsageMeterEvent.dedupe_key.in_(FIXTURE_METER_DEDUPE_KEYS))
                )
                or 0
            ),
            "credit_ledger_entries": int(
                session.scalar(
                    select(func.count())
                    .select_from(CreditLedgerEntry)
                    .where(CreditLedgerEntry.ledger_entry_id.in_(FIXTURE_LEDGER_ENTRY_IDS))
                )
                or 0
            ),
            "support_requests": int(
                session.scalar(
                    select(func.count())
                    .select_from(SupportRequest)
                    .where(SupportRequest.request_id.in_(FIXTURE_SUPPORT_IDS))
                )
                or 0
            ),
            "audit_events": int(
                session.scalar(
                    select(func.count())
                    .select_from(ServiceAuditEvent)
                    .where(ServiceAuditEvent.trace_id.in_(FIXTURE_AUDIT_TRACE_IDS))
                )
                or 0
            ),
            "billing_snapshots": int(
                session.scalar(
                    select(func.count())
                    .select_from(BillingSnapshot)
                    .where(BillingSnapshot.site_id == site_id)
                )
                or 0
            ),
        }


def seed_portal_demo(
    settings: Settings,
    *,
    site_id: str = FIXTURE_SITE_ID,
    email: str = FIXTURE_EMAIL,
    secret: str,
    now: datetime | None = None,
) -> dict[str, object]:
    _validate_development_database(settings)
    current_time = (now or datetime.now(UTC)).astimezone(UTC)
    normalized_email = email.strip().lower()
    service = CommercialService(settings.database_url, settings=settings)
    principal_id, account_id = _resolve_demo_identity(service, email=normalized_email)
    _ensure_demo_account_site_access(
        settings,
        service=service,
        principal_id=principal_id,
        account_id=account_id,
        email=normalized_email,
    )
    _assert_site_reassignable(settings, site_id=site_id, account_id=account_id)
    subscription_id = _resolve_demo_subscription_id(settings, account_id=account_id)
    seed_site_auth(
        settings=settings,
        site_id=site_id,
        key_id=FIXTURE_KEY_ID,
        secret=secret,
        site_name="Npcink AI 演示站点",
        scopes=[
            "catalog:read",
            "runtime:resolve",
            "runtime:execute",
            "runtime:read",
            "stats:read",
            "entitlement:read",
        ],
        account_id=account_id,
        subscription_id=subscription_id,
    )
    if not _has_active_site_binding(
        settings,
        principal_id=principal_id,
        site_id=site_id,
    ):
        bootstrap_portal_site(
            settings=settings,
            site_id=site_id,
            principal_email=normalized_email,
            public_base_url="http://127.0.0.1:8010",
            rebuild_billing_snapshot=False,
            issue_key=False,
            key_id="",
            secret="",
            key_label="",
            scopes=[],
        )
    _cleanup_fixture_rows(settings, site_id=site_id)
    _seed_activity(
        settings,
        now=current_time,
        principal_id=principal_id,
        account_id=account_id,
        subscription_id=subscription_id,
        site_id=site_id,
        email=normalized_email,
    )
    service.rebuild_billing_snapshot(
        site_id,
        audit_context=ServiceAuditContext(
            trace_id=FIXTURE_BILLING_AUDIT_TRACE_ID,
            idempotency_key="portal_demo:billing_snapshot",
            method="POST",
            path="/portal/demo-fixture",
            actor_kind="portal_principal",
            actor_ref=principal_id,
        ),
    )
    return {
        "action": "seed",
        "account_id": account_id,
        "principal_id": principal_id,
        "subscription_id": subscription_id,
        **build_report(settings, site_id=site_id),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed deterministic synthetic Portal data for development previews."
    )
    parser.add_argument("--site-id", default=FIXTURE_SITE_ID)
    parser.add_argument("--email", default=FIXTURE_EMAIL)
    parser.add_argument("--secret", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload: dict[str, Any] = seed_portal_demo(
        Settings(),
        site_id=args.site_id,
        email=args.email,
        secret=args.secret,
    )
    print(json.dumps(payload, ensure_ascii=True, sort_keys=True))


if __name__ == "__main__":
    main()
