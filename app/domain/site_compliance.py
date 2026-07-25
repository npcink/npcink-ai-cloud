from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.db import get_session
from app.core.models import ProviderConnection, ServiceSetting
from app.domain.runtime.models import RUNTIME_MAX_RETENTION_TTL
from app.domain.service_settings import (
    SERVICE_SETTING_PAYMENT_ALIPAY,
    SERVICE_SETTING_PORTAL_EMAIL,
    SERVICE_SETTING_PORTAL_PUBLIC,
    SERVICE_SETTING_QQ_LOGIN,
    SERVICE_SETTING_QQ_OPEN_CALLBACK_PATH,
)

SITE_COMPLIANCE_SETTING_ID = "site_compliance"
SITE_COMPLIANCE_SETTING_KIND = "public_compliance"
SITE_COMPLIANCE_SCHEMA_VERSION = "site_compliance.v1"
SITE_COMPLIANCE_HISTORY_LIMIT = 20
SITE_COMPLIANCE_THIRD_PARTY_LIMIT = 100

_FORBIDDEN_KEY_PARTS = (
    "secret",
    "password",
    "credential",
    "access_token",
    "api_key",
    "apikey",
    "private_key",
)


class SiteComplianceAdminError(ValueError):
    def __init__(self, error_code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code


@dataclass(slots=True)
class SiteComplianceAdminService:
    database_url: str
    settings: Settings

    def get_workspace(self) -> dict[str, Any]:
        stored = self._load_config()
        candidates = self._build_third_party_candidates()
        draft = _dict(stored.get("draft"))
        if not draft:
            draft = {
                "version_id": f"cmp_draft_{uuid4().hex}",
                "updated_at": "",
                "payload": self._default_payload(candidates),
                "validation": {},
            }
        payload = self._normalize_payload(
            _dict(draft.get("payload")),
            candidates=candidates,
        )
        validation = self._validate_payload(payload, candidates=candidates)
        draft = {
            **draft,
            "payload": payload,
            "validation": validation,
        }
        published = _dict(stored.get("published"))
        return {
            "surface": "admin_site_compliance",
            "schema_version": SITE_COMPLIANCE_SCHEMA_VERSION,
            "draft": draft,
            "published": published or None,
            "history": _dict_list(stored.get("history"))[:SITE_COMPLIANCE_HISTORY_LIMIT],
            "third_party_candidates": candidates,
            "qq_review": self._build_qq_review(
                validation=validation,
                published=published,
            ),
            "boundary": _boundary(),
        }

    def save_draft(self, payload: dict[str, Any], *, actor_ref: str = "") -> dict[str, Any]:
        self._reject_forbidden_keys(payload)
        candidates = self._build_third_party_candidates()
        normalized = self._normalize_payload(payload, candidates=candidates)
        validation = self._validate_payload(normalized, candidates=candidates)
        now = datetime.now(UTC)
        stored = self._load_config()
        previous_draft = _dict(stored.get("draft"))
        draft = {
            "version_id": _string(previous_draft.get("version_id"))
            or f"cmp_draft_{uuid4().hex}",
            "updated_at": now.isoformat(),
            "updated_by": actor_ref,
            "payload": normalized,
            "validation": validation,
        }
        stored["schema_version"] = SITE_COMPLIANCE_SCHEMA_VERSION
        stored["draft"] = draft
        stored.setdefault("history", [])
        self._save_config(stored, ready=not validation["blockers"])
        return {
            "draft": draft,
            "published": _dict(stored.get("published")) or None,
            "third_party_candidates": candidates,
            "qq_review": self._build_qq_review(
                validation=validation,
                published=_dict(stored.get("published")),
            ),
            "boundary": _boundary(),
        }

    def publish(self, *, actor_ref: str = "") -> dict[str, Any]:
        stored = self._load_config()
        draft = _dict(stored.get("draft"))
        if not draft:
            raise SiteComplianceAdminError(
                "site_compliance.draft_required",
                "save a compliance draft before publishing",
                status_code=409,
            )
        candidates = self._build_third_party_candidates()
        payload = self._normalize_payload(
            _dict(draft.get("payload")),
            candidates=candidates,
        )
        validation = self._validate_payload(payload, candidates=candidates)
        if validation["blockers"]:
            raise SiteComplianceAdminError(
                "site_compliance.publish_blocked",
                "resolve the blocking compliance fields before publishing",
                status_code=409,
            )
        now = datetime.now(UTC)
        previous = _dict(stored.get("published"))
        history = _dict_list(stored.get("history"))
        if previous:
            history.insert(
                0,
                {
                    **previous,
                    "status": "superseded",
                    "superseded_at": now.isoformat(),
                },
            )
        version_number = max(
            1,
            _int(stored.get("next_version_number"), default=1),
        )
        published = {
            "version_id": f"cmp_v{version_number}_{uuid4().hex[:12]}",
            "version_number": version_number,
            "status": "published",
            "effective_at": now.isoformat(),
            "published_at": now.isoformat(),
            "published_by": actor_ref,
            "payload": payload,
            "validation": validation,
        }
        stored.update(
            {
                "schema_version": SITE_COMPLIANCE_SCHEMA_VERSION,
                "published": published,
                "history": history[:SITE_COMPLIANCE_HISTORY_LIMIT],
                "next_version_number": version_number + 1,
                "draft": {
                    **draft,
                    "updated_at": now.isoformat(),
                    "payload": payload,
                    "validation": validation,
                },
            }
        )
        self._save_config(stored, ready=True)
        return {
            "published": published,
            "draft": stored["draft"],
            "history": stored["history"],
            "qq_review": self._build_qq_review(
                validation=validation,
                published=published,
            ),
            "boundary": _boundary(),
        }

    def get_public_projection(self) -> dict[str, Any]:
        published = _dict(self._load_config().get("published"))
        if not published:
            return {
                "surface": "public_site_compliance",
                "published": False,
                "version_id": "",
                "effective_at": "",
                "payload": {},
                "boundary": _public_boundary(),
            }
        payload = self._normalize_payload(
            _dict(published.get("payload")),
            candidates=[],
        )
        return {
            "surface": "public_site_compliance",
            "published": True,
            "version_id": _string(published.get("version_id")),
            "effective_at": _string(published.get("effective_at")),
            "payload": _public_payload(payload),
            "boundary": _public_boundary(),
        }

    def _default_payload(self, candidates: list[dict[str, Any]]) -> dict[str, Any]:
        email_setting = self._load_setting(SERVICE_SETTING_PORTAL_EMAIL)
        email_config = _dict(email_setting.config_json) if email_setting else {}
        support_email = _string(email_config.get("reply_to")) or _string(
            email_config.get("from_email")
        )
        return {
            "schema_version": SITE_COMPLIANCE_SCHEMA_VERSION,
            "brand_name": "Npcink AI Cloud",
            "operator": {
                "entity_name": "",
                "entity_type": "",
                "public_name": "Npcink AI Cloud",
                "registration_or_filing": "",
                "service_region": "中国",
            },
            "contact": {
                "support_email": support_email,
                "support_channel": "登录服务中心提交工单",
                "service_hours": "",
            },
            "refund": {
                "auto_renewal": False,
                "refund_window_days": 14,
                "processing_business_days": 0,
                "refund_channel": "原支付渠道退回",
                "request_path": "登录服务中心提交工单并提供订单号",
                "conditions": (
                    "根据付款时展示的规则、适用法律及实际服务使用情况处理。"
                ),
            },
            "retention": [
                {
                    "record_id": "ai_runtime_results",
                    "label": "AI 运行结果",
                    "public_description": (
                        "按每次运行的存储模式和执行合同保存；需要限期保存时最长为 "
                        f"{RUNTIME_MAX_RETENTION_TTL // 86400} 天。"
                    ),
                    "enforcement": "runtime_contract",
                    "confirmed": True,
                    "source": "RUNTIME_MAX_RETENTION_TTL",
                },
                {
                    "record_id": "plugin_observability",
                    "label": "插件观测事件",
                    "public_description": (
                        "当前自动清理窗口为 "
                        f"{self.settings.plugin_observability_retention_days} 天。"
                    ),
                    "enforcement": "automated_cleanup",
                    "confirmed": True,
                    "source": "plugin_observability_retention_days",
                },
                {
                    "record_id": "audit_evidence",
                    "label": "安全与审计证据",
                    "public_description": (
                        f"当前对外权益说明使用 {self.settings.audit_retention_days_default} 天"
                        "默认窗口；实际清理期限仍需运营确认。"
                    ),
                    "enforcement": "projection_only",
                    "confirmed": False,
                    "source": "audit_retention_days_default",
                },
                {
                    "record_id": "account_payment_support",
                    "label": "账号、支付与支持记录",
                    "public_description": (
                        "按服务运营、安全、账务、争议处理及适用法律所需期限保存。"
                    ),
                    "enforcement": "policy_only",
                    "confirmed": False,
                    "source": "current_public_copy",
                },
            ],
            "third_parties": [
                _candidate_to_disclosure(item)
                for item in candidates
                if bool(item.get("in_use"))
            ],
            "review": {
                "operator_confirmed": False,
                "legal_review_status": "pending",
                "review_note": "",
            },
        }

    def _normalize_payload(
        self,
        payload: dict[str, Any],
        *,
        candidates: list[dict[str, Any]],
    ) -> dict[str, Any]:
        default = self._default_payload(candidates)
        operator = {**_dict(default["operator"]), **_dict(payload.get("operator"))}
        contact = {**_dict(default["contact"]), **_dict(payload.get("contact"))}
        refund = {**_dict(default["refund"]), **_dict(payload.get("refund"))}
        review = {**_dict(default["review"]), **_dict(payload.get("review"))}
        retention = _normalize_retention(
            payload.get("retention") if "retention" in payload else default["retention"]
        )
        third_parties = _normalize_third_parties(
            payload.get("third_parties")
            if "third_parties" in payload
            else default["third_parties"]
        )
        return {
            "schema_version": SITE_COMPLIANCE_SCHEMA_VERSION,
            "brand_name": _bounded_string(
                payload.get("brand_name") or default["brand_name"],
                191,
            ),
            "operator": {
                "entity_name": _bounded_string(operator.get("entity_name"), 191),
                "entity_type": _bounded_string(operator.get("entity_type"), 64),
                "public_name": _bounded_string(operator.get("public_name"), 191),
                "registration_or_filing": _bounded_string(
                    operator.get("registration_or_filing"),
                    191,
                ),
                "service_region": _bounded_string(operator.get("service_region"), 191),
            },
            "contact": {
                "support_email": _bounded_string(contact.get("support_email"), 191),
                "support_channel": _bounded_string(contact.get("support_channel"), 500),
                "service_hours": _bounded_string(contact.get("service_hours"), 191),
            },
            "refund": {
                "auto_renewal": bool(refund.get("auto_renewal", False)),
                "refund_window_days": max(
                    0,
                    min(365, _int(refund.get("refund_window_days"), default=14)),
                ),
                "processing_business_days": max(
                    0,
                    min(
                        90,
                        _int(refund.get("processing_business_days"), default=0),
                    ),
                ),
                "refund_channel": _bounded_string(refund.get("refund_channel"), 191),
                "request_path": _bounded_string(refund.get("request_path"), 500),
                "conditions": _bounded_string(refund.get("conditions"), 2000),
            },
            "retention": retention,
            "third_parties": third_parties,
            "review": {
                "operator_confirmed": bool(review.get("operator_confirmed", False)),
                "legal_review_status": (
                    _bounded_string(review.get("legal_review_status"), 32) or "pending"
                ),
                "review_note": _bounded_string(review.get("review_note"), 2000),
            },
        }

    def _validate_payload(
        self,
        payload: dict[str, Any],
        *,
        candidates: list[dict[str, Any]],
    ) -> dict[str, Any]:
        blockers: list[dict[str, str]] = []
        warnings: list[dict[str, str]] = []

        def block(code: str, message: str, field: str) -> None:
            blockers.append({"code": code, "message": message, "field": field})

        def warn(code: str, message: str, field: str) -> None:
            warnings.append({"code": code, "message": message, "field": field})

        operator = _dict(payload.get("operator"))
        contact = _dict(payload.get("contact"))
        refund = _dict(payload.get("refund"))
        review = _dict(payload.get("review"))
        if not _string(operator.get("entity_name")):
            block("operator_entity_required", "请填写真实运营主体名称。", "operator.entity_name")
        if not _string(operator.get("entity_type")):
            block("operator_type_required", "请选择运营主体类型。", "operator.entity_type")
        support_email = _string(contact.get("support_email"))
        support_channel = _string(contact.get("support_channel"))
        if not support_email and not support_channel:
            block(
                "public_contact_required",
                "至少填写一个对外支持邮箱或支持渠道。",
                "contact",
            )
        if support_email and ("@" not in support_email or support_email.startswith("@")):
            block(
                "support_email_invalid",
                "支持邮箱格式无效。",
                "contact.support_email",
            )
        if _int(refund.get("processing_business_days"), default=0) <= 0:
            block(
                "refund_processing_days_required",
                "请确认退款处理所需的工作日。",
                "refund.processing_business_days",
            )
        if not bool(review.get("operator_confirmed")):
            block(
                "operator_confirmation_required",
                "发布前需要运营者确认资料准确。",
                "review.operator_confirmed",
            )

        represented_ids = {
            _string(item.get("service_id"))
            for item in _dict_list(payload.get("third_parties"))
        }
        for candidate in candidates:
            candidate_id = _string(candidate.get("service_id"))
            if bool(candidate.get("in_use")) and candidate_id not in represented_ids:
                block(
                    "third_party_classification_required",
                    f"已启用服务“{candidate.get('service_name')}”尚未完成第三方分类。",
                    "third_parties",
                )
        for item in _dict_list(payload.get("third_parties")):
            if not bool(item.get("disclosed", True)):
                continue
            if not _string(item.get("service_name")) or not _string(item.get("purpose")):
                block(
                    "third_party_detail_required",
                    "第三方披露需要服务名称和处理目的。",
                    "third_parties",
                )
                break
            if not _string(item.get("operator_name")):
                block(
                    "third_party_operator_required",
                    f"请确认“{item.get('service_name')}”的法律运营主体。",
                    "third_parties",
                )
            privacy_url = _string(item.get("privacy_url"))
            if not privacy_url:
                block(
                    "third_party_privacy_url_required",
                    f"请填写“{item.get('service_name')}”的隐私政策地址。",
                    "third_parties",
                )
            elif not _is_https_url(privacy_url):
                block(
                    "third_party_privacy_url_invalid",
                    f"“{item.get('service_name')}”的隐私政策地址必须使用公开 HTTPS 地址。",
                    "third_parties",
                )
            if not _string(item.get("processing_region")):
                block(
                    "third_party_processing_region_required",
                    f"请确认“{item.get('service_name')}”的数据处理地区。",
                    "third_parties",
                )

        for item in _dict_list(payload.get("retention")):
            if not bool(item.get("confirmed")):
                block(
                    "retention_enforcement_confirmation_required",
                    f"请确认“{item.get('label')}”的实际保留与清理期限。",
                    "retention",
                )
        if not _string(operator.get("registration_or_filing")):
            warn(
                "registration_or_filing_missing",
                "尚未填写备案号或登记信息。",
                "operator.registration_or_filing",
            )
        if not _string(contact.get("service_hours")):
            warn(
                "service_hours_missing",
                "尚未填写客服服务时间。",
                "contact.service_hours",
            )
        if _string(review.get("legal_review_status")) != "approved":
            warn(
                "legal_review_pending",
                "隐私、条款和退款文案仍需正式法律审核。",
                "review.legal_review_status",
            )
        return {
            "ready_to_publish": not blockers,
            "blockers": blockers,
            "warnings": warnings,
            "checked_at": datetime.now(UTC).isoformat(),
        }

    def _build_third_party_candidates(self) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        qq = self._load_setting(SERVICE_SETTING_QQ_LOGIN)
        email = self._load_setting(SERVICE_SETTING_PORTAL_EMAIL)
        payment = self._load_setting(SERVICE_SETTING_PAYMENT_ALIPAY)
        if qq is not None:
            candidates.append(
                {
                    "service_id": "qq_connect",
                    "service_name": "QQ互联",
                    "category": "identity",
                    "purpose": "完成 QQ 登录、账号绑定与身份认证",
                    "data_categories": "QQ账号标识、昵称和头像等授权资料",
                    "in_use": bool(qq.enabled and qq.status == "ready"),
                    "default_disclosed": True,
                    "source": "service_settings",
                }
            )
        if email is not None:
            candidates.append(
                {
                    "service_id": "portal_email",
                    "service_name": "邮件发送服务",
                    "category": "email_delivery",
                    "purpose": "发送登录验证码、账号通知和服务消息",
                    "data_categories": "邮箱地址和通知内容",
                    "in_use": bool(email.enabled and email.status == "ready"),
                    "default_disclosed": True,
                    "source": "service_settings",
                }
            )
        if payment is not None:
            candidates.append(
                {
                    "service_id": "alipay",
                    "service_name": "支付宝",
                    "category": "payment",
                    "purpose": "创建订单、确认支付和处理退款",
                    "data_categories": "订单号、金额、支付状态和退款状态",
                    "in_use": bool(payment.enabled and payment.status == "ready"),
                    "default_disclosed": True,
                    "source": "service_settings",
                }
            )
        with get_session(self.database_url) as session:
            remaining = max(0, SITE_COMPLIANCE_THIRD_PARTY_LIMIT - len(candidates))
            provider_rows = list(
                session.scalars(
                    select(ProviderConnection)
                    .where(ProviderConnection.enabled.is_(True))
                    .order_by(ProviderConnection.connection_id.asc())
                    .limit(remaining)
                )
            )
        for row in provider_rows:
            candidates.append(
                {
                    "service_id": f"provider_{row.connection_id}",
                    "service_name": row.display_name or row.connection_id,
                    "category": row.provider_type or "hosted_runtime_provider",
                    "purpose": _provider_purpose(row.provider_type),
                    "data_categories": _provider_data_categories(row.provider_type),
                    "in_use": True,
                    "default_disclosed": _is_public_network_url(row.base_url),
                    "source": "provider_connections",
                }
            )
        return candidates

    def _build_qq_review(
        self,
        *,
        validation: dict[str, Any],
        published: dict[str, Any],
    ) -> dict[str, Any]:
        public_setting = self._load_setting(SERVICE_SETTING_PORTAL_PUBLIC)
        qq_setting = self._load_setting(SERVICE_SETTING_QQ_LOGIN)
        public_config = _dict(public_setting.config_json) if public_setting else {}
        qq_config = _dict(qq_setting.config_json) if qq_setting else {}
        public_base_url = _string(public_config.get("public_base_url"))
        redirect_uri = _string(qq_config.get("redirect_uri"))
        if not redirect_uri and public_base_url:
            redirect_uri = f"{public_base_url}{SERVICE_SETTING_QQ_OPEN_CALLBACK_PATH}"
        https_ready = public_base_url.startswith("https://")
        legal_review_ready = not any(
            _string(item.get("code")) == "legal_review_pending"
            for item in _dict_list(validation.get("warnings"))
        )
        items = [
            _review_item("public_https", "公开域名使用 HTTPS", https_ready, public_base_url),
            _review_item(
                "qq_credentials",
                "QQ App ID 与 App Secret 已配置",
                bool(qq_setting and qq_setting.enabled and qq_setting.status == "ready"),
                "Secret 不回显",
            ),
            _review_item(
                "qq_callback",
                "QQ 回调地址与公开域名一致",
                bool(
                    redirect_uri
                    and public_base_url
                    and redirect_uri
                    == f"{public_base_url}{SERVICE_SETTING_QQ_OPEN_CALLBACK_PATH}"
                ),
                redirect_uri,
            ),
            _review_item(
                "public_legal_pages",
                "隐私政策与服务条款已有已发布资料",
                bool(published),
                "/privacy · /terms",
            ),
            _review_item(
                "compliance_ready",
                "运营资料满足发布门槛",
                not bool(validation.get("blockers")),
                f"{len(_dict_list(validation.get('blockers')))} 个阻塞项",
            ),
            _review_item(
                "legal_review",
                "隐私、条款与退款文案已完成正式审核",
                legal_review_ready,
                "后台网站合规资料",
            ),
            _review_item(
                "qq_branding",
                "登录页使用标准 QQ 登录标识",
                True,
                "/portal/login",
            ),
        ]
        return {
            "status": "ready" if all(bool(item["ready"]) for item in items) else "blocked",
            "items": items,
            "manual_external_steps": [
                "在 QQ互联 控制台提交真实主体资质。",
                "在 QQ互联 控制台填写审核域名与回调地址。",
                "使用审核环境完成一次真实 QQ 授权登录并保留脱敏截图。",
            ],
            "credential_value_exposure": "none",
        }

    def _load_config(self) -> dict[str, Any]:
        row = self._load_setting(SITE_COMPLIANCE_SETTING_ID)
        return deepcopy(_dict(row.config_json)) if row is not None else {}

    def _load_setting(self, setting_id: str) -> ServiceSetting | None:
        with get_session(self.database_url) as session:
            return session.get(ServiceSetting, setting_id)

    def _save_config(self, config: dict[str, Any], *, ready: bool) -> None:
        now = datetime.now(UTC)
        with get_session(self.database_url) as session:
            row = session.get(ServiceSetting, SITE_COMPLIANCE_SETTING_ID)
            if row is None:
                row = ServiceSetting(
                    setting_id=SITE_COMPLIANCE_SETTING_ID,
                    setting_kind=SITE_COMPLIANCE_SETTING_KIND,
                    enabled=True,
                    config_json={},
                    secret_ciphertext_json={},
                    status="missing_config",
                    metadata_json={
                        "surface": "admin_site_compliance",
                        "credential_value_exposure": "none",
                    },
                )
                session.add(row)
            row.setting_kind = SITE_COMPLIANCE_SETTING_KIND
            row.enabled = True
            row.config_json = config
            row.secret_ciphertext_json = {}
            row.status = "ready" if ready else "missing_config"
            row.last_error_code = None
            row.last_error_message = None
            row.updated_at = now
            session.commit()

    def _reject_forbidden_keys(self, payload: object, *, path: str = "payload") -> None:
        if isinstance(payload, dict):
            for raw_key, value in payload.items():
                key = str(raw_key).lower()
                if any(part in key for part in _FORBIDDEN_KEY_PARTS):
                    raise SiteComplianceAdminError(
                        "site_compliance.secret_field_forbidden",
                        f"credential-like field is forbidden at {path}.{raw_key}",
                    )
                self._reject_forbidden_keys(value, path=f"{path}.{raw_key}")
        elif isinstance(payload, list):
            for index, value in enumerate(payload):
                self._reject_forbidden_keys(value, path=f"{path}[{index}]")


def _normalize_retention(value: object) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in _dict_list(value)[:20]:
        record_id = _bounded_string(item.get("record_id"), 64)
        label = _bounded_string(item.get("label"), 191)
        description = _bounded_string(item.get("public_description"), 2000)
        if not record_id or not label or not description:
            continue
        rows.append(
            {
                "record_id": record_id,
                "label": label,
                "public_description": description,
                "enforcement": _bounded_string(item.get("enforcement"), 64),
                "confirmed": bool(item.get("confirmed")),
                "source": _bounded_string(item.get("source"), 191),
            }
        )
    return rows


def _normalize_third_parties(value: object) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in _dict_list(value)[:SITE_COMPLIANCE_THIRD_PARTY_LIMIT]:
        service_id = _bounded_string(item.get("service_id"), 64)
        if not service_id or service_id in seen:
            continue
        seen.add(service_id)
        rows.append(
            {
                "service_id": service_id,
                "service_name": _bounded_string(item.get("service_name"), 191),
                "operator_name": _bounded_string(item.get("operator_name"), 191),
                "category": _bounded_string(item.get("category"), 64),
                "purpose": _bounded_string(item.get("purpose"), 1000),
                "data_categories": _bounded_string(item.get("data_categories"), 1000),
                "privacy_url": _bounded_string(item.get("privacy_url"), 1000),
                "processing_region": _bounded_string(item.get("processing_region"), 191),
                "disclosed": bool(item.get("disclosed", True)),
            }
        )
    return rows


def _candidate_to_disclosure(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "service_id": _string(candidate.get("service_id")),
        "service_name": _string(candidate.get("service_name")),
        "operator_name": "",
        "category": _string(candidate.get("category")),
        "purpose": _string(candidate.get("purpose")),
        "data_categories": _string(candidate.get("data_categories")),
        "privacy_url": "",
        "processing_region": "",
        "disclosed": bool(candidate.get("default_disclosed", True)),
    }


def _public_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": SITE_COMPLIANCE_SCHEMA_VERSION,
        "brand_name": _string(payload.get("brand_name")),
        "operator": _dict(payload.get("operator")),
        "contact": _dict(payload.get("contact")),
        "refund": _dict(payload.get("refund")),
        "retention": [
            {
                "record_id": _string(item.get("record_id")),
                "label": _string(item.get("label")),
                "public_description": _string(item.get("public_description")),
            }
            for item in _dict_list(payload.get("retention"))
        ],
        "third_parties": [
            {
                "service_id": _string(item.get("service_id")),
                "service_name": _string(item.get("service_name")),
                "operator_name": _string(item.get("operator_name")),
                "category": _string(item.get("category")),
                "purpose": _string(item.get("purpose")),
                "data_categories": _string(item.get("data_categories")),
                "privacy_url": _string(item.get("privacy_url")),
                "processing_region": _string(item.get("processing_region")),
            }
            for item in _dict_list(payload.get("third_parties"))
            if bool(item.get("disclosed", True))
        ],
    }


def _provider_purpose(provider_type: str) -> str:
    normalized = _string(provider_type).lower()
    if "search" in normalized:
        return "根据用户请求检索公开网页信息"
    if "image" in normalized:
        return "根据用户请求检索或生成图片候选"
    if "embedding" in normalized or "vector" in normalized or "rerank" in normalized:
        return "为站点知识检索生成向量、存储索引或重排候选"
    return "根据用户请求执行托管 AI 处理"


def _provider_data_categories(provider_type: str) -> str:
    normalized = _string(provider_type).lower()
    if "search" in normalized or "image" in normalized:
        return "搜索词、公开网页地址及完成请求所需的上下文"
    if "embedding" in normalized or "vector" in normalized or "rerank" in normalized:
        return "完成站点知识检索所需的文本片段和向量"
    return "完成该次 AI 操作所需的内容、指令和运行参数"


def _review_item(code: str, label: str, ready: bool, detail: str) -> dict[str, Any]:
    return {
        "code": code,
        "label": label,
        "ready": ready,
        "detail": detail,
    }


def _boundary() -> dict[str, Any]:
    return {
        "surface": "cloud_public_compliance_detail",
        "cloud_owns": [
            "cloud_operator_public_identity",
            "cloud_public_contact",
            "cloud_refund_disclosure",
            "cloud_retention_disclosure",
            "cloud_third_party_disclosure",
        ],
        "wordpress_control_plane": False,
        "wordpress_write_owner": False,
        "legal_advice_automation": False,
        "credential_value_exposure": "none",
    }


def _public_boundary() -> dict[str, Any]:
    return {
        "surface": "public_read_only",
        "draft_exposure": "none",
        "credential_value_exposure": "none",
        "wordpress_control_plane": False,
    }


def _dict(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _dict_list(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _string(value: object) -> str:
    return str(value or "").strip()


def _bounded_string(value: object, limit: int) -> str:
    return _string(value)[:limit]


def _is_https_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return parsed.scheme == "https" and bool(parsed.hostname)


def _is_public_network_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    hostname = str(parsed.hostname or "").strip().lower()
    if parsed.scheme not in {"http", "https"} or not hostname:
        return False
    if (
        hostname == "localhost"
        or hostname == "host.docker.internal"
        or hostname.endswith(".localhost")
        or hostname.endswith(".local")
        or hostname.endswith(".internal")
    ):
        return False
    try:
        return ip_address(hostname).is_global
    except ValueError:
        return True
def _int(value: object, *, default: int) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return default
    return default
