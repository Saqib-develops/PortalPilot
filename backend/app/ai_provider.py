import json
import os
from typing import Any, Literal
from urllib.parse import urlparse
from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

class PlanDecision(BaseModel):
    action: Literal["navigate", "click", "fill", "answer", "ask_user"]
    target_selector: str | None = None
    target_url: str | None = None
    value: str | None = None
    rationale: str = Field(max_length=400)
    response: str = Field(max_length=600)
    provider: Literal["gemma", "gemini", "deterministic"]

class AIProviderInterface:
    def plan(self, task: str, observation: dict[str, Any]) -> PlanDecision:
        raise NotImplementedError

    def chat(self, message: str, context: dict[str, Any]) -> str:
        raise NotImplementedError

class DeterministicProvider(AIProviderInterface):
    def plan(self, task: str, observation: dict[str, Any]) -> PlanDecision:
        task_lower = task.lower().strip()
        links = observation.get("links", [])
        buttons = observation.get("buttons", [])
        fields = observation.get("fields", [])
        title = observation.get("title", "Portal")

        for link in links:
            text = (link.get("text") or "").lower()
            url = link.get("url") or ""
            if any(term in text for term in ["registration", "register", "apply", "student", "apply online"]) and any(term in task_lower for term in ["register", "registration", "apply", "application", "form", "sign up", "admission"]):
                return PlanDecision(
                    action="navigate",
                    target_url=url,
                    rationale=f"Deterministic rule matched keyword in portal link: '{link.get('text')}'.",
                    response=f"Found the '{link.get('text')}' link on {title}. Opening it now.",
                    provider="deterministic"
                )
            if any(term in text for term in ["instruction", "guideline", "rule", "faq", "help"]) and any(term in task_lower for term in ["instruction", "guideline", "rule", "document", "requirement", "help"]):
                return PlanDecision(
                    action="navigate",
                    target_url=url,
                    rationale=f"Deterministic rule matched instruction/guideline link: '{link.get('text')}'.",
                    response=f"Found candidate page '{link.get('text')}' for guidelines and requirements.",
                    provider="deterministic"
                )
            if any(term in text for term in ["status", "track", "check status"]) and any(term in task_lower for term in ["status", "check", "track"]):
                return PlanDecision(
                    action="navigate",
                    target_url=url,
                    rationale=f"Deterministic rule matched status tracking link: '{link.get('text')}'.",
                    response=f"Found scholarship status portal link: '{link.get('text')}'.",
                    provider="deterministic"
                )

        if fields:
            matching_fields = [f for f in fields if any(term in (f.get("label") or "").lower() for term in task_lower.split())]
            if matching_fields:
                chosen = matching_fields[0]
                return PlanDecision(
                    action="ask_user",
                    target_selector=chosen.get("selector"),
                    rationale=f"Identified visible form field matching task: '{chosen.get('label')}'.",
                    response=f"The field '{chosen.get('label')}' is present on this page. Please provide the verified value you wish to enter.",
                    provider="deterministic"
                )

        if links:
            first_link = links[0]
            return PlanDecision(
                action="answer",
                rationale="Deterministic inspection scanned visible links and headers.",
                response=f"Observed {len(links)} links and {len(buttons)} interactive buttons on '{title}'. Available entry point: {first_link.get('text')}.",
                provider="deterministic"
            )

        return PlanDecision(
            action="ask_user",
            rationale="No relevant elements automatically matched the task query.",
            response=f"Currently on '{title}'. Please clarify whether you wish to register, check status, or view scholarship guidelines.",
            provider="deterministic"
        )

    def chat(self, message: str, context: dict[str, Any]) -> str:
        page_title = context.get("title", "Portal page")
        url = context.get("url", "")
        matches = context.get("query_matches", [])
        if matches:
            findings = "; ".join(
                " ".join(str(match.get("text", "")).split())[:180]
                for match in matches[:4]
                if match.get("text")
            )
            return f"[Page crawl] Relevant content found on '{page_title}': {findings}"
        return f"[Deterministic Guide] Currently observing '{page_title}' at {url}. You can ask about student registration, guidelines, or form fields."

class GenAIProvider(AIProviderInterface):
    def __init__(self, api_key: str, model_name: str | None = None):
        from google import genai
        self.api_key = api_key
        self.model_name = model_name or os.getenv("GEMMA_MODEL", "gemma-4-26b-a4b-it")
        self.client = genai.Client(api_key=self.api_key)

    def plan(self, task: str, observation: dict[str, Any]) -> PlanDecision:
        page_context = {
            "url": observation.get("url"),
            "title": observation.get("title"),
            "headings": observation.get("headings", [])[:20],
            "links": observation.get("links", [])[:25],
            "buttons": observation.get("buttons", [])[:20],
            "fields": observation.get("fields", [])[:20],
            "visible_text_snippet": observation.get("visible_text_snippet", "")[:600],
        }

        prompt = f"""
You are PortalPilot AI Assistant for navigating government portals.
User Objective:
{task}

Observed Page Context:
{json.dumps(page_context, ensure_ascii=False)}

Select exactly one action:
- navigate: specify target_url which MUST match one of the observed link URLs.
- click: specify target_selector matching a button or interactive target.
- fill: specify target_selector for input and value to enter.
- answer: provide answer based strictly on observed content.
- ask_user: ask the user for necessary missing details or confirmation.

Rules:
- Never hallucinate URLs.
- Never automate OTP, password, captcha, or final submission.
- Return valid JSON matching the schema.
- Keep rationale and response concise.
"""
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.1,
                "max_output_tokens": 1024,
            }
        )

        raw_text = ""
        if response.text:
            raw_text = response.text.strip()
        elif response.candidates:
            for candidate in response.candidates:
                if candidate.content and candidate.content.parts:
                    for part in candidate.content.parts:
                        if not getattr(part, "thought", False) and part.text:
                            raw_text = part.text.strip()
                            break

        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3].strip()

        data = json.loads(raw_text)
        provider_label = "gemma" if "gemma" in self.model_name.lower() else "gemini"
        data["provider"] = provider_label

        if data.get("action") == "navigate":
            target_url = data.get("target_url")
            observed_urls = {item.get("url") for item in page_context["links"] if isinstance(item, dict)}
            if not target_url or target_url not in observed_urls:
                raise ValueError("AI proposed destination not found in observed links.")

        return PlanDecision.model_validate(data)

    def chat(self, message: str, context: dict[str, Any]) -> str:
        prompt = f"""
You are PortalPilot Assistant helping a user with a government portal.
Current page: {context.get('title')} ({context.get('url')})
Observed text: {context.get('visible_text_snippet', '')}
Query-matched page content: {json.dumps(context.get('query_matches', [])[:10], ensure_ascii=False)}

User question: {message}

Answer concisely, politely, and strictly grounded in observed facts or standard portal guidance.
Never invent procedures.
"""
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={"temperature": 0.2, "max_output_tokens": 1024}
            )
            text = (response.text or "").strip()
            if not text and response.candidates:
                for candidate in response.candidates:
                    if candidate.content and candidate.content.parts:
                        for part in candidate.content.parts:
                            if not getattr(part, "thought", False) and part.text:
                                text = part.text.strip()
                                break
            if text:
                return text
        except Exception:
            pass
        return DeterministicProvider().chat(message, context)

def get_ai_provider() -> tuple[AIProviderInterface, str]:
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMMA_MODEL", "gemma-4-26b-a4b-it")
    if api_key and api_key.strip():
        try:
            return GenAIProvider(api_key=api_key.strip(), model_name=model_name), model_name
        except Exception:
            return DeterministicProvider(), "deterministic-fallback"
    return DeterministicProvider(), "deterministic-mode"
