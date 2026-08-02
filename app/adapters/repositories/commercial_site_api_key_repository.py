from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import SiteApiKey


class CommercialSiteApiKeyRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_site_key(self, key_id: str) -> SiteApiKey | None:
        return self.session.get(SiteApiKey, key_id)

    def list_site_keys(
        self,
        site_id: str,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[SiteApiKey]:
        statement = (
            select(SiteApiKey)
            .where(SiteApiKey.site_id == site_id)
            .order_by(SiteApiKey.created_at.desc(), SiteApiKey.key_id.desc())
        )
        if offset > 0:
            statement = statement.offset(offset)
        if limit is not None and limit > 0:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def count_site_keys(self, site_id: str) -> int:
        statement = select(func.count(SiteApiKey.key_id)).where(SiteApiKey.site_id == site_id)
        count = self.session.scalar(statement)
        return int(count or 0)

    def count_site_keys_by_site(
        self,
        *,
        site_ids: list[str] | None = None,
        statuses: list[str] | None = None,
    ) -> dict[str, int]:
        statement = select(SiteApiKey.site_id, func.count(SiteApiKey.key_id)).group_by(
            SiteApiKey.site_id
        )
        if site_ids is not None:
            if not site_ids:
                return {}
            statement = statement.where(SiteApiKey.site_id.in_(site_ids))
        if statuses:
            statement = statement.where(SiteApiKey.status.in_(statuses))
        return {
            str(site_id or ""): int(count or 0)
            for site_id, count in self.session.execute(statement)
        }

    def count_site_keys_total(self, *, statuses: list[str] | None = None) -> int:
        statement = select(func.count(SiteApiKey.key_id))
        if statuses:
            statement = statement.where(SiteApiKey.status.in_(statuses))
        return int(self.session.scalar(statement) or 0)

    def upsert_site_key(
        self,
        *,
        key_id: str,
        site_id: str,
        secret_hash: str,
        signing_secret_ciphertext: str,
        label: str,
        scopes_json: list[str] | None,
        metadata_json: dict[str, object] | None,
        status: str,
        rotated_from_key_id: str | None,
        replaced_by_key_id: str | None,
        expires_at: datetime | None,
        revoked_at: datetime | None,
    ) -> SiteApiKey:
        api_key = self.get_site_key(key_id)
        if api_key is None:
            api_key = SiteApiKey(
                key_id=key_id,
                site_id=site_id,
                secret_hash=secret_hash,
                signing_secret_ciphertext=signing_secret_ciphertext,
                label=label or None,
                scopes_json=scopes_json,
                metadata_json=metadata_json,
                status=status,
                rotated_from_key_id=rotated_from_key_id,
                replaced_by_key_id=replaced_by_key_id,
                expires_at=expires_at,
                revoked_at=revoked_at,
            )
            self.session.add(api_key)
        else:
            api_key.site_id = site_id
            api_key.secret_hash = secret_hash
            api_key.signing_secret_ciphertext = signing_secret_ciphertext
            api_key.label = label or None
            api_key.scopes_json = scopes_json
            api_key.metadata_json = metadata_json
            api_key.status = status
            api_key.rotated_from_key_id = rotated_from_key_id
            api_key.replaced_by_key_id = replaced_by_key_id
            api_key.expires_at = expires_at
            api_key.revoked_at = revoked_at
        self.session.flush()
        return api_key
