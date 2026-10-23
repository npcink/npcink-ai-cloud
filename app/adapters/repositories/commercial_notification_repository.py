"""Portal 站内通知 repository（Phase 1 MVP）。

负责 CRUD + 已读标记，供工单回复等触发点写入，portal 路由读取。
这是一个最小实现——字段够用、查询简单、不做复杂去重或聚合。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from sqlalchemy import func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.core.models import PortalNotification


class CommercialNotificationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # --- 写入 ---

    def create_notification(
        self,
        *,
        notification_id: str,
        account_id: str,
        principal_id: str | None,
        event_type: str,
        title: str,
        body: str | None = None,
        link_href: str | None = None,
    ) -> PortalNotification:
        existing = self.session.get(PortalNotification, notification_id)
        if existing is not None:
            if existing.account_id != account_id or existing.principal_id != principal_id:
                raise ValueError("notification identifier belongs to another recipient")
            return existing
        notification = PortalNotification(
            notification_id=notification_id,
            account_id=account_id,
            principal_id=principal_id,
            event_type=event_type,
            title=title,
            body=body,
            link_href=link_href,
            is_read=False,
        )
        self.session.add(notification)
        self.session.flush()
        return notification

    # --- 查询 ---

    def list_account_notifications(
        self,
        *,
        account_id: str,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
    ) -> list[PortalNotification]:
        statement = (
            select(PortalNotification)
            .where(PortalNotification.account_id == account_id)
            .order_by(PortalNotification.created_at.desc())
            .limit(max(1, int(limit)))
            .offset(max(0, int(offset)))
        )
        if unread_only:
            statement = statement.where(PortalNotification.is_read.is_(False))
        return list(self.session.scalars(statement).all())

    def count_account_notifications(
        self,
        *,
        account_id: str,
        unread_only: bool = False,
    ) -> int:
        statement = select(func.count(PortalNotification.notification_id)).where(
            PortalNotification.account_id == account_id
        )
        if unread_only:
            statement = statement.where(PortalNotification.is_read.is_(False))
        return int(self.session.scalar(statement) or 0)

    def get_notification(
        self,
        *,
        notification_id: str,
        account_id: str,
    ) -> PortalNotification | None:
        return self.session.scalar(
            select(PortalNotification).where(
                PortalNotification.notification_id == notification_id,
                PortalNotification.account_id == account_id,
            )
        )

    # --- 更新（已读标记） ---

    def mark_read(
        self,
        *,
        notification_id: str,
        account_id: str,
        now: datetime,
    ) -> int:
        result = cast(
            CursorResult[Any],
            self.session.execute(
                update(PortalNotification)
                .where(PortalNotification.notification_id == notification_id)
                .where(PortalNotification.account_id == account_id)
                .where(PortalNotification.is_read.is_(False))
                .values(is_read=True, read_at=now)
            ),
        )
        return result.rowcount or 0

    def mark_all_read(
        self,
        *,
        account_id: str,
        now: datetime,
    ) -> int:
        result = cast(
            CursorResult[Any],
            self.session.execute(
                update(PortalNotification)
                .where(PortalNotification.account_id == account_id)
                .where(PortalNotification.is_read.is_(False))
                .values(is_read=True, read_at=now)
            ),
        )
        return result.rowcount or 0
