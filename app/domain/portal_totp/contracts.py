"""Internal dormant storage contracts, never a public authentication assertion."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

TotpFactorState = Literal["disabled", "enabled"]
AuthChallengePurpose = Literal["login", "setup", "disable", "recovery_reset"]
SecondFactorMethod = Literal["totp", "recovery_code"]


@dataclass(frozen=True)
class LegacySessionEvidence:
    kind: Literal["legacy"] = "legacy"


@dataclass(frozen=True)
class PrimarySessionEvidence:
    primary_authenticated_at: datetime
    kind: Literal["primary_only"] = "primary_only"


@dataclass(frozen=True)
class MfaSessionEvidence:
    factor_version: int
    primary_authenticated_at: datetime
    second_factor_verified_at: datetime
    second_factor_method: SecondFactorMethod
    kind: Literal["mfa"] = "mfa"


SessionAuthenticationEvidence = LegacySessionEvidence | PrimarySessionEvidence | MfaSessionEvidence
