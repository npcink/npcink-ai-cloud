from __future__ import annotations

from abc import ABC, abstractmethod


class PortalEmailDeliveryError(RuntimeError):
    pass


class PortalEmailSender(ABC):
    @abstractmethod
    def send_test_email(
        self,
        *,
        recipient_email: str,
        project_name: str,
        portal_url: str,
    ) -> None:
        raise NotImplementedError

    @abstractmethod
    def send_login_code(
        self,
        *,
        recipient_email: str,
        site_admin_ref: str,
        code: str,
        expires_in_seconds: int,
        project_name: str,
        locale: str = "zh-CN",
    ) -> None:
        raise NotImplementedError
