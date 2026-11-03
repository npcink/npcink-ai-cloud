from __future__ import annotations

from email.message import EmailMessage
from traceback import format_exception

import pytest

from app.adapters.notifications.base import PortalEmailDeliveryError
from app.adapters.notifications.smtp import SmtpPortalEmailSender


class RecordingPortalEmailSender(SmtpPortalEmailSender):
    def __init__(self) -> None:
        super().__init__(
            host="smtp.example.test",
            port=465,
            username="",
            password="",
            use_ssl=True,
            use_starttls=False,
            timeout_seconds=5,
            from_email="auth@example.test",
            from_name="Npcink 服务中心",
        )
        self.delivered: list[EmailMessage] = []

    def _deliver(self, message: EmailMessage) -> None:
        self.delivered.append(message)


def _plain_body(message: EmailMessage) -> str:
    body = message.get_body(preferencelist=("plain",))
    assert body is not None
    return body.get_content()


def _html_body(message: EmailMessage) -> str:
    body = message.get_body(preferencelist=("html",))
    assert body is not None
    return body.get_content()


def test_login_code_email_has_human_subject_and_html_body() -> None:
    sender = RecordingPortalEmailSender()

    sender.send_login_code(
        recipient_email="member@example.com",
        principal_id="prn_member",
        code="123456",
        expires_in_seconds=600,
        project_name="Npcink_AI_Cloud",
        locale="zh-CN",
    )

    message = sender.delivered[0]
    assert message.is_multipart()
    assert message["Subject"] == "Npcink AI Cloud 登录验证码"
    assert "Npcink_AI_Cloud" not in message["Subject"]
    assert "验证码：123456" in _plain_body(message)
    html = _html_body(message)
    assert "你的登录验证码" in html
    assert "123456" in html
    assert "登录邮箱" in html
    assert message["Date"]
    assert message["Message-ID"]
    assert message["Message-ID"].endswith("@example.test>")


def test_registration_code_email_is_distinct_from_login_template() -> None:
    sender = RecordingPortalEmailSender()

    sender.send_registration_code(
        recipient_email="new-user@example.com",
        principal_id="prn_new",
        code="654321",
        expires_in_seconds=300,
        project_name="Npcink_AI_Cloud",
        site_name="Demo Site",
        site_url="https://example.test",
        locale="zh-CN",
    )

    message = sender.delivered[0]
    assert message["Subject"] == "完成 Npcink AI Cloud 注册"
    plain = _plain_body(message)
    assert "完成 Npcink AI Cloud 注册" in plain
    assert "你正在创建 Npcink 服务中心账号" in plain
    assert "登录验证码" not in plain
    html = _html_body(message)
    assert "完成服务中心注册" in html
    assert "Demo Site" in html
    assert "654321" in html


def test_test_email_no_longer_exposes_engineering_template_copy() -> None:
    sender = RecordingPortalEmailSender()

    sender.send_test_email(
        recipient_email="operator@example.com",
        project_name="Npcink_AI_Cloud",
        portal_url="https://cloud.npc.ink/portal/login",
    )

    message = sender.delivered[0]
    assert message["Subject"] == "Npcink AI Cloud 邮件服务测试成功"
    plain = _plain_body(message)
    assert "邮件服务测试成功" in plain
    assert "portal mailer" not in plain
    assert "SMTP test" not in plain
    html = _html_body(message)
    assert "https://cloud.npc.ink/portal/login" in html


@pytest.mark.parametrize(
    ("locale", "subject", "impact", "retention", "not_login"),
    [
        ("zh-CN", "关闭账号验证码", "撤销站点 API 密钥", "不会删除全部数据", "登录验证码"),
        ("zh-TW", "關閉帳號驗證碼", "撤銷站點 API 金鑰", "不會刪除全部資料", "登入驗證碼"),
        ("en", "account closure verification code", "revokes site API keys",
         "does not erase all your data", "sign-in code"),
    ],
)
def test_account_closure_email_explains_purpose_and_retained_records(
    locale, subject, impact, retention, not_login,
) -> None:
    sender = RecordingPortalEmailSender()
    sender.send_account_deletion_code(
        recipient_email="member@example.com",
        principal_id="prn_member",
        code="482913",
        expires_in_seconds=600,
        project_name="Npcink_AI_Cloud",
        locale=locale,
    )
    message = sender.delivered[0]
    assert subject in message["Subject"]
    assert not_login not in message["Subject"]
    for body in (_plain_body(message), _html_body(message)):
        assert "482913" in body
        assert impact in body
        assert retention in body
        assert "10" in body
        assert "member@example.com" in body
        assert not_login not in body
    assert message["Date"] and message["Message-ID"]


def test_account_closure_email_escapes_html_and_keeps_code_out_of_errors(caplog) -> None:
    sender = RecordingPortalEmailSender()
    arguments = dict(
        recipient_email="member@example.com",
        principal_id="prn_member",
        code="482913",
        expires_in_seconds=600,
        project_name="<script>alert(1)</script>",
        locale="en",
    )
    sender.send_account_deletion_code(**arguments)
    html = _html_body(sender.delivered[0])
    assert "<script>" not in html
    assert "&lt;script&gt;" in html

    def fail(message):
        raise RuntimeError("Transport failure with sensitive code 482913")

    sender._deliver = fail
    with pytest.raises(PortalEmailDeliveryError) as caught:
        sender.send_account_deletion_code(**arguments)
    assert "482913" not in str(caught.value)
    assert "482913" not in "".join(format_exception(caught.value))
    assert "482913" not in caplog.text
