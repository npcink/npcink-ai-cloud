"""Dormant storage only: caller owns scope locks, commit and rollback.

Order: accounts -> principals -> memberships -> factors -> SIDs -> recovery
IDs -> challenge IDs -> primary proofs, sorted within each class. These
primitives do not verify codes, enable factors or issue authenticated sessions.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import PortalAuthChallenge, PortalRecoveryCode, PortalTotpFactor


class PortalTotpRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def lock_factor(self, *, principal_id: str) -> PortalTotpFactor | None:
        return self.session.scalar(
            select(PortalTotpFactor)
            .where(PortalTotpFactor.principal_id == principal_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    def create_disabled_factor(
        self, *, principal_id: str, factor_version: int, now: datetime
    ) -> PortalTotpFactor:
        """Unique insert after caller's principal lock; never overwrite an existing factor."""
        row = PortalTotpFactor(
            principal_id=principal_id,
            factor_version=factor_version,
            state="disabled",
            recovery_generation=0,
            created_at=now,
            updated_at=now,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def lock_recovery_owned(self, *, principal_id: str, code_id: str) -> PortalRecoveryCode | None:
        return self.session.scalar(
            select(PortalRecoveryCode)
            .where(
                PortalRecoveryCode.principal_id == principal_id,
                PortalRecoveryCode.code_id == code_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    def lock_challenge_owned(
        self, *, principal_id: str, challenge_id: str
    ) -> PortalAuthChallenge | None:
        return self.session.scalar(
            select(PortalAuthChallenge)
            .where(
                PortalAuthChallenge.principal_id == principal_id,
                PortalAuthChallenge.challenge_id == challenge_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
