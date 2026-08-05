from __future__ import annotations

from datetime import datetime

from app.adapters.repositories.commercial_identity_queries import CommercialIdentityQueries
from app.adapters.repositories.commercial_portal_auth_repository import (
    CommercialPortalAuthRepository,
)
from app.core.models import (
    IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
    IDENTITY_PROVIDER_BINDING_STATUS_REVOKED,
    PRINCIPAL_STATUS_ACTIVE,
    IdentityProviderBinding,
    Principal,
)


class CommercialIdentityRepository(
    CommercialIdentityQueries,
    CommercialPortalAuthRepository,
):
    def revoke_identity_provider_bindings(
        self,
        *,
        principal_id: str,
        provider: str | None = None,
    ) -> int:
        bindings = self.list_identity_provider_bindings(
            principal_ids=[principal_id],
            provider=provider,
            statuses=[IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE],
        )
        for binding in bindings:
            binding.status = IDENTITY_PROVIDER_BINDING_STATUS_REVOKED
        self.session.flush()
        return len(bindings)

    def upsert_identity_provider_binding(
        self,
        *,
        binding_id: str,
        principal_id: str,
        provider: str,
        external_subject_hash: str,
        unionid_hash: str | None,
        status: str = IDENTITY_PROVIDER_BINDING_STATUS_ACTIVE,
        metadata_json: dict[str, object] | None = None,
        last_login_at: datetime | None = None,
    ) -> IdentityProviderBinding:
        binding = self.get_identity_provider_binding(
            provider=provider,
            external_subject_hash=external_subject_hash,
        )
        if binding is not None and binding.principal_id != principal_id:
            raise ValueError("identity provider binding principal_id is immutable")
        union_binding = (
            self.get_identity_provider_binding_by_unionid(
                provider=provider,
                unionid_hash=unionid_hash,
            )
            if unionid_hash
            else None
        )
        if union_binding is not None and union_binding.principal_id != principal_id:
            raise ValueError("identity provider binding principal_id is immutable")
        if binding is None:
            binding = IdentityProviderBinding(
                binding_id=binding_id,
                principal_id=principal_id,
                provider=provider,
                external_subject_hash=external_subject_hash,
                unionid_hash=unionid_hash or None,
                status=status,
                metadata_json=metadata_json,
                last_login_at=last_login_at,
            )
            self.session.add(binding)
        else:
            binding.unionid_hash = unionid_hash or None
            binding.status = status
            binding.metadata_json = metadata_json
            if last_login_at is not None:
                binding.last_login_at = last_login_at
        self.session.flush()
        return binding

    def upsert_principal_identity(
        self,
        *,
        principal_id: str,
        email: str | None,
        status: str = PRINCIPAL_STATUS_ACTIVE,
        metadata_json: dict[str, object] | None = None,
        last_login_at: datetime | None = None,
    ) -> Principal:
        identity = self.get_principal_identity_by_ref(principal_id=principal_id)
        if identity is None and email:
            identity = self.get_principal_identity_by_email(email=email)
        if identity is None:
            identity = Principal(
                principal_id=principal_id,
                email=email,
                status=status,
                metadata_json=metadata_json,
                last_login_at=last_login_at,
            )
            self.session.add(identity)
        else:
            identity.email = email
            identity.status = status
            identity.metadata_json = metadata_json
            if last_login_at is not None:
                identity.last_login_at = last_login_at
        self.session.flush()
        return identity

    def increment_principal_session_version(self, *, principal_id: str) -> Principal | None:
        identity = self.get_principal_identity_by_ref(principal_id=principal_id)
        if identity is None:
            return None
        identity.session_version = int(identity.session_version or 0) + 1
        self.session.flush()
        return identity
