import os
from typing import Literal
from urllib.parse import urlparse
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from .ai_provider import get_ai_provider, PlanDecision

load_dotenv()

ALLOWED_HOSTS = {"scholarship.up.gov.in", "127.0.0.1", "localhost"}

class AgentPlan(BaseModel):
    action: Literal["navigate", "click", "fill", "answer", "ask_user"]
    rationale: str = Field(max_length=400)
    target_url: str | None = None
    target_selector: str | None = None
    value: str | None = None
    response: str = Field(max_length=600)
    provider: str = "deterministic"

class PlannerError(RuntimeError):
    pass

def _is_allowed_url(url: str) -> bool:
    parsed = urlparse(url)
    return (
        parsed.scheme in ("https", "http")
        and parsed.hostname in ALLOWED_HOSTS
        and parsed.port in (None, 80, 443, 8000)
        and parsed.username is None
        and parsed.password is None
    )

def plan_next_action(task: str, observation: dict) -> dict:
    task = task.strip()
    if not task or len(task) > 1000:
        raise PlannerError("Task must be between 1 and 1000 characters.")

    provider, _ = get_ai_provider()
    try:
        decision: PlanDecision = provider.plan(task, observation)
        plan_dict = decision.model_dump()
        return plan_dict
    except Exception as exc:
        from .ai_provider import DeterministicProvider
        det = DeterministicProvider()
        fallback_decision = det.plan(task, observation)
        return fallback_decision.model_dump()
