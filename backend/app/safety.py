from urllib.parse import urlparse
from pydantic import BaseModel
from .registry import registry

class SafetyCheckResult(BaseModel):
    allowed: bool
    requires_approval: bool
    reason: str

class SafetyPolicy:
    DANGEROUS_SCHEMES = {"javascript", "file", "data", "vbscript", "about"}
    SENSITIVE_FIELD_KEYWORDS = [
        "password",
        "otp",
        "captcha",
        "cvv",
        "pin",
        "secret",
        "token",
        "card_number",
        "aadhaar",
        "ssn"
    ]
    SUBMISSION_KEYWORDS = [
        "submit",
        "final submit",
        "pay",
        "payment",
        "confirm submission",
        "apply now",
        "delete",
        "lock application"
    ]

    @classmethod
    def is_url_safe(cls, url: str) -> tuple[bool, str]:
        if not url:
            return False, "URL cannot be empty."
        parsed = urlparse(url)
        scheme = parsed.scheme.lower()
        if scheme in cls.DANGEROUS_SCHEMES:
            return False, f"Dangerous scheme '{scheme}' is strictly forbidden."
        if scheme not in ("http", "https"):
            return False, f"Unsupported URL scheme '{scheme}'."
        hostname = (parsed.hostname or "").lower()
        allowed_hosts = registry.get_all_allowed_hosts()
        if scheme == "http" and hostname not in ("localhost", "127.0.0.1"):
            return False, "Insecure HTTP is only permitted for local demonstration fixtures."
        if hostname not in allowed_hosts:
            return False, f"Domain '{hostname}' is not in the registered allowed portals list."
        return True, "URL is safe and allowlisted."

    @classmethod
    def evaluate_action(
        cls,
        action_type: str,
        target_selector: str,
        target_text: str = "",
        value: str | None = None
    ) -> SafetyCheckResult:
        normalized_action = action_type.lower().strip()
        text_lower = (target_text or "").lower()
        selector_lower = (target_selector or "").lower()

        for keyword in cls.SUBMISSION_KEYWORDS:
            if keyword in text_lower or keyword in selector_lower:
                return SafetyCheckResult(
                    allowed=False,
                    requires_approval=True,
                    reason=f"Action resembles final submission or irreversible operation ('{keyword}'). Explicit human approval and control is required."
                )

        if normalized_action == "fill":
            for keyword in cls.SENSITIVE_FIELD_KEYWORDS:
                if keyword in text_lower or keyword in selector_lower:
                    return SafetyCheckResult(
                        allowed=False,
                        requires_approval=True,
                        reason=f"Input field targets sensitive credential or identifier ('{keyword}'). Autonomous entry is prohibited."
                    )

        if normalized_action in ("click", "navigate", "fill", "select", "read", "scroll"):
            return SafetyCheckResult(
                allowed=True,
                requires_approval=False,
                reason="Action conforms to safe browsing policy."
            )

        return SafetyCheckResult(
            allowed=False,
            requires_approval=False,
            reason=f"Unsupported action type '{action_type}'."
        )

    @classmethod
    def sanitize_field_value(cls, field_name: str, value: str) -> str:
        name_lower = field_name.lower()
        for keyword in cls.SENSITIVE_FIELD_KEYWORDS:
            if keyword in name_lower:
                return "[REDACTED_SENSITIVE_VALUE]"
        return value
