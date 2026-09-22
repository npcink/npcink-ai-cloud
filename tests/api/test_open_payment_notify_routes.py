"""Route-level HTTP replay matrix for POST /open/payments/alipay/notify.

The domain state machine is covered by tests/domain/test_payment_service.py and
tests/domain/test_payment_gateways.py. This file proves the public notify
endpoint contract at the HTTP layer: signed Alipay form callbacks move a pending
credit-pack payment order to paid exactly once, reject tampered or unknown
requests without state changes, honor the pending-order expiry boundary, stay
inert when the browser return page arrives before the notify, and never apply a
refund deduction twice.

All RSA keys and signatures are generated inside the tests; no credentials are
real, and no network call leaves the process (the real Alipay refund API is
stubbed with the same in-test key used by tests/domain/test_payment_gateways.py).
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.main import create_app
from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    PAYMENT_ORDER_STATUS_CANCELED,
    PAYMENT_ORDER_STATUS_PAID,
    PAYMENT_ORDER_STATUS_PENDING,
    PAYMENT_ORDER_STATUS_REFUNDED,
    PAYMENT_REFUND_STATUS_SUCCEEDED,
    SUBSCRIPTION_STATUS_ACTIVE,
    AccountSubscription,
    CreditLedgerEntry,
    PaidCreditGrant,
    PaymentEvent,
    PaymentOrder,
    PaymentRefund,
)
from app.core.services import CloudServices
from app.domain.commercial.service import CommercialService
from tests.conftest import (
    TEST_ADMIN_SESSION_SECRET,
    TEST_INTERNAL_AUTH_TOKEN,
    TEST_PORTAL_JWT_SECRET,
    build_internal_headers,
)

NOTIFY_PATH = "/open/payments/alipay/notify"
RETURN_PATH = "/open/payments/alipay/return"
ALIPAY_APP_ID = "2026000000000101"
ACCOUNT_ID = "acct_open_notify_matrix"
PLAN_ID = "plan_open_notify_matrix"
PLAN_VERSION_ID = "plan_open_notify_matrix_v1"
PACK_AMOUNT_TEXT = "99.00"
PACK_AI_CREDITS = 10000.0
ALIPAY_GATEWAY_TZ = ZoneInfo("Asia/Shanghai")


def _sqlite_url(tmp_path: Path) -> str:
    return f"sqlite+pysqlite:///{tmp_path / 'open-payment-notify-routes.sqlite3'}"


def _settings(database_url: str) -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        redis_url="redis://localhost:6379/0",
        internal_auth_token=TEST_INTERNAL_AUTH_TOKEN,
        admin_session_secret=TEST_ADMIN_SESSION_SECRET,
        portal_jwt_secret=TEST_PORTAL_JWT_SECRET,
        openai_api_key="",
        anthropic_api_key="",
        web_search_provider="disabled",
        site_knowledge_embedding_provider="deterministic",
        debug_local_origin_allowlist="http://127.0.0.1:8010,http://localhost:8010,http://testserver",
    )


def _alipay_test_keys() -> tuple[rsa.RSAPrivateKey, str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return private_key, private_pem, public_pem


def _sign_alipay_payload(private_key: rsa.RSAPrivateKey, payload: dict[str, str]) -> str:
    canonical = "&".join(
        f"{key}={value}"
        for key, value in sorted(payload.items())
        if key not in {"sign", "sign_type"} and value
    )
    signature = private_key.sign(
        canonical.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("ascii")


def _shanghai_timestamp(moment: datetime) -> str:
    return moment.astimezone(ALIPAY_GATEWAY_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _now_shanghai_text(*, offset_minutes: float = 0.0) -> str:
    return _shanghai_timestamp(datetime.now(UTC) + timedelta(minutes=offset_minutes))


def _configure_alipay(client: TestClient, private_pem: str, public_pem: str) -> None:
    public_response = client.patch(
        "/internal/service/admin/service-settings/portal-public",
        json={"public_base_url": "http://testserver"},
        headers=build_internal_headers(idempotency_key="notify-matrix-portal-public-001"),
    )
    assert public_response.status_code == 200, public_response.text
    alipay_response = client.patch(
        "/internal/service/admin/service-settings/alipay-payment",
        json={
            "enabled": True,
            "app_id": ALIPAY_APP_ID,
            "notify_url": "http://testserver/open/payments/alipay/notify",
            "return_url": "http://testserver/open/payments/alipay/return",
            "private_key": private_pem,
            "public_key": public_pem,
        },
        headers=build_internal_headers(idempotency_key="notify-matrix-alipay-settings-001"),
    )
    assert alipay_response.status_code == 200, alipay_response.text


def _build_client(
    tmp_path: Path,
    private_pem: str,
    public_pem: str,
) -> tuple[str, TestClient]:
    database_url = _sqlite_url(tmp_path)
    init_schema(database_url)
    settings = _settings(database_url)
    service = CommercialService(database_url, settings=settings)
    service.upsert_account(account_id=ACCOUNT_ID, name="Open notify matrix account")
    service.upsert_plan(plan_id=PLAN_ID, name="Open Notify Matrix Pro")
    service.publish_plan_version(
        plan_id=PLAN_ID,
        plan_version_id=PLAN_VERSION_ID,
        version_label="v1",
        currency="CNY",
    )
    client = TestClient(create_app(CloudServices(settings=settings)))
    client.headers.update({"origin": "http://testserver", "referer": "http://testserver/"})
    _configure_alipay(client, private_pem, public_pem)
    return database_url, client


def _seed_paid_base_subscription(client: TestClient, *, idem_prefix: str) -> None:
    order_response = client.post(
        "/internal/service/payments/orders",
        headers=build_internal_headers(idempotency_key=f"{idem_prefix}-base-order"),
        json={
            "account_id": ACCOUNT_ID,
            "plan_id": PLAN_ID,
            "plan_version_id": PLAN_VERSION_ID,
            "amount": 199.0,
            "currency": "CNY",
            "provider": "alipay",
            "subject": "Notify matrix base plan order",
        },
    )
    assert order_response.status_code == 200, order_response.text
    base_order = order_response.json()["data"]
    paid_response = client.post(
        f"/internal/service/payments/orders/{base_order['order_id']}/mark-paid",
        headers=build_internal_headers(idempotency_key=f"{idem_prefix}-base-paid"),
        json={
            "provider_trade_no": "202609220000000001",
            "provider_event_id": f"{idem_prefix}-base-paid-event",
            "amount": 199.0,
        },
    )
    assert paid_response.status_code == 200, paid_response.text
    assert paid_response.json()["data"]["subscription"]["status"] == SUBSCRIPTION_STATUS_ACTIVE


def _create_credit_pack_order(client: TestClient, *, idem_prefix: str) -> dict[str, Any]:
    response = client.post(
        "/internal/service/payments/credit-pack-orders",
        headers=build_internal_headers(idempotency_key=f"{idem_prefix}-pack-order"),
        json={"account_id": ACCOUNT_ID, "pack_id": "pack_small", "provider": "alipay"},
    )
    assert response.status_code == 200, response.text
    order = response.json()["data"]
    assert order["status"] == PAYMENT_ORDER_STATUS_PENDING
    assert order["purchase_kind"] == "credit_pack"
    return order


def _signed_payment_notify(
    private_key: rsa.RSAPrivateKey,
    *,
    external_order_no: str,
    notify_id: str,
    total_amount: str = PACK_AMOUNT_TEXT,
    trade_status: str = "TRADE_SUCCESS",
    gmt_payment: str | None = None,
    extra_fields: dict[str, str] | None = None,
) -> dict[str, str]:
    payload: dict[str, str] = {
        "app_id": ALIPAY_APP_ID,
        "out_trade_no": external_order_no,
        "trade_no": "202609220000000101",
        "notify_id": notify_id,
        "total_amount": total_amount,
        "trade_status": trade_status,
        "gmt_payment": gmt_payment or _now_shanghai_text(),
        "sign_type": "RSA2",
    }
    payload.update(extra_fields or {})
    payload["sign"] = _sign_alipay_payload(private_key, payload)
    return payload


def _paid_credit_pack_order(
    client: TestClient,
    private_key: rsa.RSAPrivateKey,
    *,
    order: dict[str, Any],
    notify_id: str,
) -> None:
    notify = _signed_payment_notify(
        private_key,
        external_order_no=str(order["external_order_no"]),
        notify_id=notify_id,
    )
    response = client.post(NOTIFY_PATH, data=notify)
    assert response.status_code == 200, response.text
    assert response.text == "success"


def _credit_pack_state(database_url: str, order_id: str) -> dict[str, Any]:
    with get_session(database_url) as session:
        order = session.get(PaymentOrder, order_id)
        assert order is not None
        refund_ids = [
            str(row.refund_id)
            for row in session.scalars(
                select(PaymentRefund).where(PaymentRefund.order_id == order_id)
            )
        ]
        purchase_entries = list(
            session.scalars(
                select(CreditLedgerEntry).where(
                    CreditLedgerEntry.source_type == "credit_pack_purchase",
                    CreditLedgerEntry.source_id == order_id,
                )
            )
        )
        adjustment_entries = list(
            session.scalars(
                select(CreditLedgerEntry).where(
                    CreditLedgerEntry.source_type == "credit_pack_refund",
                    CreditLedgerEntry.source_id.in_(refund_ids),
                )
            )
        )
        grant = session.scalar(
            select(PaidCreditGrant).where(PaidCreditGrant.payment_order_id == order_id)
        )
        subscription = (
            session.get(AccountSubscription, order.subscription_id)
            if order.subscription_id
            else None
        )
        return {
            "status": order.status,
            "provider_trade_no": order.provider_trade_no or "",
            "paid_at": order.paid_at,
            "canceled_at": order.canceled_at,
            "metadata": dict(order.metadata_json or {}),
            "purchase_entry_count": len(purchase_entries),
            "purchase_delta": round(
                sum(float(entry.ai_credit_delta or 0.0) for entry in purchase_entries), 6
            ),
            "adjustment_entry_count": len(adjustment_entries),
            "adjustment_delta": round(
                sum(float(entry.ai_credit_delta or 0.0) for entry in adjustment_entries), 6
            ),
            "payment_event_count": len(
                list(
                    session.scalars(
                        select(PaymentEvent).where(PaymentEvent.order_id == order_id)
                    )
                )
            ),
            "succeeded_refund_count": sum(
                1 for row in session.scalars(
                    select(PaymentRefund).where(PaymentRefund.order_id == order_id)
                )
                if row.status == PAYMENT_REFUND_STATUS_SUCCEEDED
            ),
            "grant_original": None if grant is None else grant.original_ai_credits,
            "grant_remaining": None if grant is None else grant.remaining_ai_credits,
            "grant_refunded": None if grant is None else grant.refunded_ai_credits,
            "subscription_status": None if subscription is None else subscription.status,
        }


def _payment_event_by_provider_event_id(
    database_url: str,
    provider_event_id: str,
) -> PaymentEvent | None:
    with get_session(database_url) as session:
        return session.scalar(
            select(PaymentEvent).where(PaymentEvent.provider_event_id == provider_event_id)
        )


def _install_alipay_refund_http_stub(
    monkeypatch: pytest.MonkeyPatch,
    private_key: rsa.RSAPrivateKey,
) -> None:
    class _Response:
        def __init__(self, payload: dict[str, Any]) -> None:
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return self._payload

    def _post(url: str, *, data: dict[str, str], timeout: float) -> _Response:
        biz_content = json.loads(data["biz_content"])
        refund_payload = {
            "code": "10000",
            "msg": "Success",
            "trade_no": "202609220000000199",
            "out_trade_no": str(biz_content.get("out_trade_no") or ""),
            "refund_fee": str(biz_content.get("refund_amount") or ""),
            "fund_change": "Y",
        }
        signed_content = json.dumps(
            refund_payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        signature = private_key.sign(
            signed_content.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return _Response(
            {
                "alipay_trade_refund_response": refund_payload,
                "sign": base64.b64encode(signature).decode("ascii"),
            }
        )

    monkeypatch.setattr("app.domain.commercial.payment_gateways.httpx.post", _post)


def _request_refund(
    client: TestClient,
    *,
    order_id: str,
    amount: float,
    idem_key: str,
) -> dict[str, Any]:
    response = client.post(
        f"/internal/service/payments/orders/{order_id}/refunds",
        headers=build_internal_headers(idempotency_key=idem_key),
        json={"amount": amount, "reason": "notify matrix refund"},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_signed_success_notify_marks_credit_pack_order_paid_and_grants_credits(
    tmp_path: Path,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-success")
    order = _create_credit_pack_order(client, idem_prefix="notify-success")
    order_id = str(order["order_id"])
    external_order_no = str(order["external_order_no"])

    notify = _signed_payment_notify(
        private_key,
        external_order_no=external_order_no,
        notify_id="notify-matrix-success-001",
    )
    response = client.post(NOTIFY_PATH, data=notify)

    assert response.status_code == 200, response.text
    assert response.text == "success"
    assert response.headers["content-type"].startswith("text/plain")
    state = _credit_pack_state(database_url, order_id)
    assert state["status"] == PAYMENT_ORDER_STATUS_PAID
    assert state["provider_trade_no"] == "202609220000000101"
    assert state["paid_at"] is not None
    assert state["purchase_entry_count"] == 1
    assert state["purchase_delta"] == PACK_AI_CREDITS
    assert state["adjustment_entry_count"] == 0
    assert state["payment_event_count"] == 1
    assert state["grant_original"] == PACK_AI_CREDITS
    assert state["grant_remaining"] == PACK_AI_CREDITS
    assert state["grant_refunded"] == 0.0
    assert state["subscription_status"] == SUBSCRIPTION_STATUS_ACTIVE
    with get_session(database_url) as session:
        event = session.scalar(
            select(PaymentEvent).where(PaymentEvent.order_id == order_id)
        )
        assert event is not None
        assert event.event_kind == "payment.succeeded"
        assert event.provider_event_id == "notify-matrix-success-001"
    dispose_engine(database_url)


def test_duplicate_success_notify_replays_idempotently_without_double_grant(
    tmp_path: Path,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-replay")
    order = _create_credit_pack_order(client, idem_prefix="notify-replay")
    order_id = str(order["order_id"])
    notify = _signed_payment_notify(
        private_key,
        external_order_no=str(order["external_order_no"]),
        notify_id="notify-matrix-replay-001",
    )

    first_response = client.post(NOTIFY_PATH, data=notify)
    second_response = client.post(NOTIFY_PATH, data=notify)

    assert first_response.status_code == 200
    assert first_response.text == "success"
    assert second_response.status_code == 200
    assert second_response.text == "success"
    after_replay = _credit_pack_state(database_url, order_id)
    assert after_replay["status"] == PAYMENT_ORDER_STATUS_PAID
    assert after_replay["purchase_entry_count"] == 1
    assert after_replay["purchase_delta"] == PACK_AI_CREDITS
    assert after_replay["grant_remaining"] == PACK_AI_CREDITS
    assert after_replay["payment_event_count"] == 1

    # Alipay can also deliver a distinct TRADE_FINISHED notification for the
    # same trade after TRADE_SUCCESS; it must still not grant twice.
    finished = _signed_payment_notify(
        private_key,
        external_order_no=str(order["external_order_no"]),
        notify_id="notify-matrix-replay-002-finished",
        trade_status="TRADE_FINISHED",
    )
    finished_response = client.post(NOTIFY_PATH, data=finished)
    assert finished_response.status_code == 200
    assert finished_response.text == "success"
    after_finished = _credit_pack_state(database_url, order_id)
    assert after_finished["status"] == PAYMENT_ORDER_STATUS_PAID
    assert after_finished["purchase_entry_count"] == 1
    assert after_finished["purchase_delta"] == PACK_AI_CREDITS
    assert after_finished["grant_remaining"] == PACK_AI_CREDITS
    assert after_finished["payment_event_count"] == 2
    dispose_engine(database_url)


def test_signed_notify_with_mismatched_total_amount_is_rejected_without_state_change(
    tmp_path: Path,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-tamper")
    order = _create_credit_pack_order(client, idem_prefix="notify-tamper")
    order_id = str(order["order_id"])

    tampered = _signed_payment_notify(
        private_key,
        external_order_no=str(order["external_order_no"]),
        notify_id="notify-matrix-tampered-amount-001",
        total_amount="0.01",
    )
    response = client.post(NOTIFY_PATH, data=tampered)

    assert response.status_code == 400
    assert response.text == "fail"
    state = _credit_pack_state(database_url, order_id)
    assert state["status"] == PAYMENT_ORDER_STATUS_PENDING
    assert state["purchase_entry_count"] == 0
    assert state["adjustment_entry_count"] == 0
    assert state["payment_event_count"] == 0
    assert state["grant_original"] is None
    dispose_engine(database_url)


def test_signed_notify_for_unknown_external_order_no_is_rejected_without_state_change(
    tmp_path: Path,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-unknown")
    order = _create_credit_pack_order(client, idem_prefix="notify-unknown")
    order_id = str(order["order_id"])

    unknown = _signed_payment_notify(
        private_key,
        external_order_no="pay_does_not_exist_000000000001",
        notify_id="notify-matrix-unknown-order-001",
    )
    response = client.post(NOTIFY_PATH, data=unknown)

    assert response.status_code == 400
    assert response.text == "fail"
    assert _payment_event_by_provider_event_id(
        database_url,
        "notify-matrix-unknown-order-001",
    ) is None
    state = _credit_pack_state(database_url, order_id)
    assert state["status"] == PAYMENT_ORDER_STATUS_PENDING
    assert state["purchase_entry_count"] == 0
    assert state["payment_event_count"] == 0
    assert state["grant_original"] is None
    dispose_engine(database_url)


def test_notify_with_forged_or_missing_signature_is_rejected_without_state_change(
    tmp_path: Path,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-forged")
    order = _create_credit_pack_order(client, idem_prefix="notify-forged")
    order_id = str(order["order_id"])

    forged_key, _, _ = _alipay_test_keys()
    forged = _signed_payment_notify(
        private_key,
        external_order_no=str(order["external_order_no"]),
        notify_id="notify-matrix-forged-signature-001",
    )
    forged["sign"] = _sign_alipay_payload(forged_key, forged)
    forged_response = client.post(NOTIFY_PATH, data=forged)

    unsigned = _signed_payment_notify(
        private_key,
        external_order_no=str(order["external_order_no"]),
        notify_id="notify-matrix-missing-signature-001",
    )
    unsigned.pop("sign")
    unsigned_response = client.post(NOTIFY_PATH, data=unsigned)

    assert forged_response.status_code == 400
    assert forged_response.text == "fail"
    assert unsigned_response.status_code == 400
    assert unsigned_response.text == "fail"
    state = _credit_pack_state(database_url, order_id)
    assert state["status"] == PAYMENT_ORDER_STATUS_PENDING
    assert state["purchase_entry_count"] == 0
    assert state["payment_event_count"] == 0
    assert state["grant_original"] is None
    assert _payment_event_by_provider_event_id(
        database_url,
        "notify-matrix-forged-signature-001",
    ) is None
    assert _payment_event_by_provider_event_id(
        database_url,
        "notify-matrix-missing-signature-001",
    ) is None
    dispose_engine(database_url)


def test_late_notify_rejection_and_timely_reconciliation_match_domain_expiry(
    tmp_path: Path,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-expiry")
    order = _create_credit_pack_order(client, idem_prefix="notify-expiry")
    order_id = str(order["order_id"])

    # A provider paid_at beyond the 30-minute pending TTL cancels the order and
    # fails the notify, mirroring the domain expiry semantics.
    late = _signed_payment_notify(
        private_key,
        external_order_no=str(order["external_order_no"]),
        notify_id="notify-matrix-late-001",
        gmt_payment=_now_shanghai_text(offset_minutes=45),
    )
    late_response = client.post(NOTIFY_PATH, data=late)
    assert late_response.status_code == 400
    assert late_response.text == "fail"
    late_state = _credit_pack_state(database_url, order_id)
    assert late_state["status"] == PAYMENT_ORDER_STATUS_CANCELED
    assert late_state["metadata"]["cancellation_reason"] == "unpaid_order_expired"
    assert late_state["purchase_entry_count"] == 0
    assert late_state["payment_event_count"] == 0
    assert late_state["grant_original"] is None
    assert late_state["subscription_status"] == SUBSCRIPTION_STATUS_ACTIVE

    # A notify whose provider paid_at stays inside the TTL reconciles an order
    # that the expiry sweep already canceled, matching
    # tests/domain/test_payment_service.py.
    reconciled_order = _create_credit_pack_order(client, idem_prefix="notify-expiry-2")
    reconciled_order_id = str(reconciled_order["order_id"])
    backdated_created_at = datetime.now(UTC) - timedelta(minutes=31)
    with get_session(database_url) as session:
        payment_order = session.get(PaymentOrder, reconciled_order_id)
        assert payment_order is not None
        payment_order.created_at = backdated_created_at
        session.commit()
    sweep_service = CommercialService(database_url, settings=_settings(database_url))
    sweep_service.expire_pending_payment_orders()
    swept_state = _credit_pack_state(database_url, reconciled_order_id)
    assert swept_state["status"] == PAYMENT_ORDER_STATUS_CANCELED
    assert swept_state["metadata"]["cancellation_reason"] == "unpaid_order_expired"

    timely = _signed_payment_notify(
        private_key,
        external_order_no=str(reconciled_order["external_order_no"]),
        notify_id="notify-matrix-timely-reconciliation-001",
        gmt_payment=_shanghai_timestamp(backdated_created_at + timedelta(minutes=29)),
    )
    timely_response = client.post(NOTIFY_PATH, data=timely)
    assert timely_response.status_code == 200
    assert timely_response.text == "success"
    restored_state = _credit_pack_state(database_url, reconciled_order_id)
    assert restored_state["status"] == PAYMENT_ORDER_STATUS_PAID
    assert restored_state["metadata"]["late_payment_reconciliation"]["provider_paid_at"]
    assert restored_state["purchase_entry_count"] == 1
    assert restored_state["purchase_delta"] == PACK_AI_CREDITS
    assert restored_state["grant_remaining"] == PACK_AI_CREDITS
    dispose_engine(database_url)


def test_browser_return_before_notify_keeps_order_unpaid_until_notify_arrives(
    tmp_path: Path,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-return")
    order = _create_credit_pack_order(client, idem_prefix="notify-return")
    order_id = str(order["order_id"])
    external_order_no = str(order["external_order_no"])

    return_response = client.get(
        RETURN_PATH,
        params={"out_trade_no": external_order_no, "trade_status": "TRADE_SUCCESS"},
        follow_redirects=False,
    )
    assert return_response.status_code == 303
    assert return_response.headers["location"] == (
        f"/portal/billing?payment_return=alipay&out_trade_no={external_order_no}"
        "&trade_status=TRADE_SUCCESS"
    )
    after_return = _credit_pack_state(database_url, order_id)
    assert after_return["status"] == PAYMENT_ORDER_STATUS_PENDING
    assert after_return["purchase_entry_count"] == 0
    assert after_return["payment_event_count"] == 0
    assert after_return["grant_original"] is None

    _paid_credit_pack_order(
        client,
        private_key,
        order=order,
        notify_id="notify-matrix-after-return-001",
    )
    final_state = _credit_pack_state(database_url, order_id)
    assert final_state["status"] == PAYMENT_ORDER_STATUS_PAID
    assert final_state["purchase_entry_count"] == 1
    assert final_state["purchase_delta"] == PACK_AI_CREDITS
    assert final_state["grant_remaining"] == PACK_AI_CREDITS
    assert final_state["payment_event_count"] == 1
    dispose_engine(database_url)


def test_refund_confirmation_replay_deducts_paid_credits_only_once(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-refund-replay")
    order = _create_credit_pack_order(client, idem_prefix="notify-refund-replay")
    order_id = str(order["order_id"])
    _paid_credit_pack_order(
        client,
        private_key,
        order=order,
        notify_id="notify-matrix-refund-replay-paid-001",
    )

    _install_alipay_refund_http_stub(monkeypatch, private_key)
    refund = _request_refund(
        client,
        order_id=order_id,
        amount=99.0,
        idem_key="notify-matrix-refund-replay-request",
    )
    assert refund["status"] == PAYMENT_REFUND_STATUS_SUCCEEDED
    refunded_state = _credit_pack_state(database_url, order_id)
    assert refunded_state["status"] == PAYMENT_ORDER_STATUS_REFUNDED
    assert refunded_state["adjustment_entry_count"] == 1
    assert refunded_state["adjustment_delta"] == -PACK_AI_CREDITS
    assert refunded_state["grant_refunded"] == PACK_AI_CREDITS
    assert refunded_state["grant_remaining"] == 0.0

    # Replaying the refund confirmation through the route that owns refund
    # outcomes must not deduct the credits a second time.
    replay_response = client.post(
        f"/internal/service/payments/refunds/{refund['refund_id']}/mark-succeeded",
        headers=build_internal_headers(idempotency_key="notify-matrix-refund-replay-again"),
        json={
            "provider_refund_no": "20260922REFUND001",
            "provider_event_id": f"alipay:refund:{refund['refund_id']}",
            "raw_event": {"refund_status": "REFUND_SUCCESS"},
        },
    )
    assert replay_response.status_code == 200, replay_response.text
    after_replay = _credit_pack_state(database_url, order_id)
    assert after_replay["adjustment_entry_count"] == 1
    assert after_replay["adjustment_delta"] == -PACK_AI_CREDITS
    assert after_replay["grant_refunded"] == PACK_AI_CREDITS
    assert after_replay["grant_remaining"] == 0.0

    # A refund-shaped re-notification on the public notify endpoint is treated
    # as a payment callback for an already-refunded order: the endpoint answers
    # fail, and no balance or ledger entry changes again.
    refund_notify = _signed_payment_notify(
        private_key,
        external_order_no=str(order["external_order_no"]),
        notify_id="notify-matrix-refund-replay-notify-001",
        extra_fields={"gmt_refund_pay": _now_shanghai_text(), "refund_fee": PACK_AMOUNT_TEXT},
    )
    refund_notify_response = client.post(NOTIFY_PATH, data=refund_notify)
    assert refund_notify_response.status_code == 400
    assert refund_notify_response.text == "fail"
    final_state = _credit_pack_state(database_url, order_id)
    assert final_state["status"] == PAYMENT_ORDER_STATUS_REFUNDED
    assert final_state["adjustment_entry_count"] == 1
    assert final_state["adjustment_delta"] == -PACK_AI_CREDITS
    assert final_state["grant_refunded"] == PACK_AI_CREDITS
    assert final_state["grant_remaining"] == 0.0
    assert final_state["purchase_entry_count"] == 1
    dispose_engine(database_url)


def test_partial_refund_then_full_refund_settle_final_credit_balance(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private_key, private_pem, public_pem = _alipay_test_keys()
    database_url, client = _build_client(tmp_path, private_pem, public_pem)
    _seed_paid_base_subscription(client, idem_prefix="notify-refund-partial")
    order = _create_credit_pack_order(client, idem_prefix="notify-refund-partial")
    order_id = str(order["order_id"])
    _paid_credit_pack_order(
        client,
        private_key,
        order=order,
        notify_id="notify-matrix-refund-partial-paid-001",
    )

    _install_alipay_refund_http_stub(monkeypatch, private_key)
    partial_refund = _request_refund(
        client,
        order_id=order_id,
        amount=29.7,
        idem_key="notify-matrix-refund-partial-request",
    )
    assert partial_refund["status"] == PAYMENT_REFUND_STATUS_SUCCEEDED
    partial_state = _credit_pack_state(database_url, order_id)
    assert partial_state["status"] == PAYMENT_ORDER_STATUS_PAID
    assert partial_state["adjustment_entry_count"] == 1
    assert partial_state["adjustment_delta"] == -3000.0
    assert partial_state["grant_refunded"] == 3000.0
    assert partial_state["grant_remaining"] == 7000.0

    full_refund = _request_refund(
        client,
        order_id=order_id,
        amount=69.3,
        idem_key="notify-matrix-refund-remainder-request",
    )
    assert full_refund["status"] == PAYMENT_REFUND_STATUS_SUCCEEDED
    final_state = _credit_pack_state(database_url, order_id)
    # Current credit-pack refund semantics flip the order to refunded only when
    # one single refund covers the full order amount; split refunds settle the
    # credit balance completely while the order row itself stays paid. The
    # balance and ledger must still be internally consistent.
    assert final_state["status"] == PAYMENT_ORDER_STATUS_PAID
    assert final_state["adjustment_entry_count"] == 2
    assert final_state["adjustment_delta"] == -PACK_AI_CREDITS
    assert final_state["succeeded_refund_count"] == 2
    assert final_state["grant_original"] == PACK_AI_CREDITS
    assert final_state["grant_refunded"] == PACK_AI_CREDITS
    assert final_state["grant_remaining"] == 0.0
    assert final_state["purchase_delta"] == PACK_AI_CREDITS
    assert final_state["subscription_status"] == SUBSCRIPTION_STATUS_ACTIVE
    dispose_engine(database_url)
