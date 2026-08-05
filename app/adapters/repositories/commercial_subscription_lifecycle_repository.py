from __future__ import annotations

from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_account_site_repository import (
    CommercialAccountSiteRepository,
)
from app.adapters.repositories.commercial_billing_repository import CommercialBillingRepository
from app.adapters.repositories.commercial_payment_repository import CommercialPaymentRepository
from app.adapters.repositories.commercial_plan_repository import CommercialPlanRepository
from app.adapters.repositories.commercial_service_audit_repository import (
    CommercialServiceAuditRepository,
)
from app.adapters.repositories.commercial_subscription_order_repository import (
    CommercialSubscriptionOrderRepository,
)
from app.adapters.repositories.commercial_subscription_repository import (
    CommercialSubscriptionRepository,
)
from app.adapters.repositories.commercial_trial_entitlement_repository import (
    CommercialTrialEntitlementRepository,
)
from app.adapters.repositories.commercial_usage_repository import CommercialUsageRepository


class CommercialSubscriptionLifecycleRepository(
    CommercialAccountSiteRepository,
    CommercialPlanRepository,
    CommercialSubscriptionRepository,
    CommercialSubscriptionOrderRepository,
    CommercialTrialEntitlementRepository,
    CommercialPaymentRepository,
    CommercialUsageRepository,
    CommercialBillingRepository,
    CommercialServiceAuditRepository,
):
    """Repository owners required by one subscription lifecycle transaction."""

    def __init__(self, session: Session) -> None:
        self.session = session
