from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import IdentityProviderBinding, Principal


class CommercialIdentityQueries:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_principal_identity(self, principal_id: str) -> Principal | None:
        return self.session.get(Principal, principal_id)

    def get_principal_identity_by_ref(
        self,
        *,
        principal_id: str,
    ) -> Principal | None:
        return self.session.scalar(select(Principal).where(Principal.principal_id == principal_id))

    def get_identity_provider_binding(
        self,
        *,
        provider: str,
        external_subject_hash: str,
    ) -> IdentityProviderBinding | None:
        return self.session.scalar(
            select(IdentityProviderBinding).where(
                IdentityProviderBinding.provider == provider,
                IdentityProviderBinding.external_subject_hash == external_subject_hash,
            )
        )

    def get_identity_provider_binding_by_unionid(
        self,
        *,
        provider: str,
        unionid_hash: str,
    ) -> IdentityProviderBinding | None:
        if not unionid_hash:
            return None
        return self.session.scalar(
            select(IdentityProviderBinding)
            .where(
                IdentityProviderBinding.provider == provider,
                IdentityProviderBinding.unionid_hash == unionid_hash,
            )
            .order_by(IdentityProviderBinding.binding_id.asc())
        )

    def list_identity_provider_bindings_for_principal(
        self,
        *,
        principal_id: str,
        provider: str | None = None,
        status: str | None = None,
    ) -> list[IdentityProviderBinding]:
        statement = select(IdentityProviderBinding).where(
            IdentityProviderBinding.principal_id == principal_id,
        )
        if provider:
            statement = statement.where(IdentityProviderBinding.provider == provider)
        if status:
            statement = statement.where(IdentityProviderBinding.status == status)
        statement = statement.order_by(
            IdentityProviderBinding.created_at.desc(),
            IdentityProviderBinding.binding_id.desc(),
        )
        return list(self.session.scalars(statement))

    def list_identity_provider_bindings(
        self,
        *,
        principal_ids: list[str] | None = None,
        provider: str | None = None,
        statuses: list[str] | None = None,
    ) -> list[IdentityProviderBinding]:
        statement = select(IdentityProviderBinding)
        if principal_ids is not None:
            if not principal_ids:
                return []
            statement = statement.where(IdentityProviderBinding.principal_id.in_(principal_ids))
        if provider:
            statement = statement.where(IdentityProviderBinding.provider == provider)
        if statuses is not None:
            if not statuses:
                return []
            statement = statement.where(IdentityProviderBinding.status.in_(statuses))
        statement = statement.order_by(
            IdentityProviderBinding.created_at.desc(),
            IdentityProviderBinding.binding_id.desc(),
        )
        return list(self.session.scalars(statement))

    def count_principals(self, *, status: str | None = None) -> int:
        statement = select(func.count(Principal.principal_id))
        if status:
            statement = statement.where(Principal.status == status)
        return int(self.session.scalar(statement) or 0)

    def list_principals(
        self,
        *,
        status: str | None = None,
        principal_ids: list[str] | None = None,
        limit: int | None = None,
    ) -> list[Principal]:
        statement = select(Principal)
        if status:
            statement = statement.where(Principal.status == status)
        if principal_ids is not None:
            if not principal_ids:
                return []
            statement = statement.where(Principal.principal_id.in_(principal_ids))
        statement = statement.order_by(Principal.created_at.desc(), Principal.principal_id.asc())
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))
