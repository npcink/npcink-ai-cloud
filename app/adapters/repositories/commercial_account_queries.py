from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import Account


class CommercialAccountQueries:
    """Read-only account queries shared by commercial repository consumers."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_account(self, account_id: str) -> Account | None:
        return self.session.get(Account, account_id)

    def list_accounts(
        self,
        *,
        status: str | None = None,
        account_ids: list[str] | None = None,
        limit: int | None = None,
    ) -> list[Account]:
        statement = select(Account)
        if status:
            statement = statement.where(Account.status == status)
        if account_ids is not None:
            if not account_ids:
                return []
            statement = statement.where(Account.account_id.in_(account_ids))
        statement = statement.order_by(Account.created_at.desc(), Account.account_id.asc())
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def count_accounts(self, *, status: str | None = None) -> int:
        statement = select(func.count(Account.account_id))
        if status:
            statement = statement.where(Account.status == status)
        return int(self.session.scalar(statement) or 0)
