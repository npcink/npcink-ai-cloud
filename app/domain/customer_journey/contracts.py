from __future__ import annotations

CUSTOMER_JOURNEY_CONTRACT_VERSION = "customer_journey_event.v1"

ALLOWED_SURFACES = frozenset({"portal", "wordpress_editor"})
ALLOWED_JOURNEYS = frozenset(
    {
        "login",
        "site_connect",
        "title_generation",
        "summary_generation",
        "rewrite",
        "save",
        "support",
    }
)
ALLOWED_STEPS = frozenset(
    {
        "started",
        "succeeded",
        "failed",
        "abandoned",
        "retried",
        "accepted",
        "rejected",
        "closed",
    }
)
ALLOWED_ERROR_CATEGORIES = frozenset(
    {"", "auth", "network", "provider", "validation", "storage", "security", "unknown"}
)
ALLOWED_BROWSER_FAMILIES = frozenset({"", "chromium", "firefox", "safari", "other"})
ALLOWED_VIEWPORT_CLASSES = frozenset({"", "desktop", "mobile"})

GENERATION_JOURNEYS = frozenset({"title_generation", "summary_generation", "rewrite"})


class CustomerJourneyContractViolation(ValueError):
    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
