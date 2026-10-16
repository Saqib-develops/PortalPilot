import asyncio
import uuid
from typing import Any
from .browser_engine import browser_service
from .ai_provider import get_ai_provider, PlanDecision
from .tasks import task_store, StepRecord, PendingAction
from .safety import SafetyPolicy
from .registry import registry

class AgentHarness:
    MAX_STEPS = 5

    @classmethod
    async def run_task(cls, task_id: str) -> None:
        task = await task_store.get_task(task_id)
        if not task:
            return

        portal = registry.get_portal(task.portal_id)
        start_url = portal.url if portal else "https://scholarship.up.gov.in/"

        await task_store.update_task(
            task_id=task_id,
            status="running",
            stage="navigating_to_portal",
            progress=10
        )

        try:
            current_state = await browser_service.get_state()
            if not current_state.get("url") or current_state.get("url") == "about:blank" or not current_state.get("url", "").startswith(start_url[:20]):
                nav_res = await browser_service.navigate(start_url)
                if not nav_res.get("success"):
                    await task_store.update_task(
                        task_id=task_id,
                        status="failed",
                        stage="navigation_failed",
                        error=f"Could not open initial portal URL {start_url}."
                    )
                    return
        except Exception as exc:
            await task_store.update_task(
                task_id=task_id,
                status="failed",
                stage="browser_error",
                error=f"Initial browser navigation failed: {str(exc)}"
            )
            return

        provider, provider_name = get_ai_provider()
        step_count = 0

        while step_count < cls.MAX_STEPS:
            if task_store.is_cancelled(task_id):
                return

            step_count += 1
            progress_pct = min(15 + step_count * 15, 85)

            await task_store.update_task(
                task_id=task_id,
                stage="observing_page",
                progress=progress_pct
            )

            try:
                observation = await browser_service.get_state()
                await task_store.update_task(
                    task_id=task_id,
                    last_verified_state={
                        "url": observation.get("url"),
                        "title": observation.get("title"),
                        "headings": observation.get("headings", [])[:5]
                    }
                )
            except Exception as exc:
                await task_store.update_task(
                    task_id=task_id,
                    status="failed",
                    stage="observation_failed",
                    error=f"Failed to observe current page: {str(exc)}"
                )
                return

            await task_store.update_task(
                task_id=task_id,
                stage="planning_next_action"
            )

            try:
                plan: PlanDecision = provider.plan(task.objective, observation)
            except Exception as exc:
                fallback_provider, _ = get_ai_provider()
                try:
                    from .ai_provider import DeterministicProvider
                    det = DeterministicProvider()
                    plan = det.plan(task.objective, observation)
                except Exception as inner_exc:
                    await task_store.update_task(
                        task_id=task_id,
                        status="failed",
                        stage="planning_failed",
                        error=f"Planning error: {str(exc)} | Fallback error: {str(inner_exc)}"
                    )
                    return

            if plan.action in ("answer", "ask_user"):
                await task_store.add_step(
                    task_id,
                    StepRecord(
                        step_number=step_count,
                        action_type=plan.action,
                        target="assistant_dialogue",
                        result={"response": plan.response, "rationale": plan.rationale, "provider": plan.provider},
                        verified=True
                    )
                )
                await task_store.update_task(
                    task_id=task_id,
                    status="completed",
                    stage="completed",
                    progress=100,
                    result=f"{plan.response} (Rationale: {plan.rationale})"
                )
                return

            target = plan.target_url if plan.action == "navigate" else (plan.target_selector or "")
            safety_eval = SafetyPolicy.evaluate_action(
                action_type=plan.action,
                target_selector=target,
                target_text=plan.response,
                value=plan.value
            )

            if safety_eval.requires_approval:
                pending_id = str(uuid.uuid4())
                pending = PendingAction(
                    action_id=pending_id,
                    action_type=plan.action,
                    target=target,
                    target_text=plan.response,
                    value=plan.value,
                    reason=safety_eval.reason
                )
                await task_store.request_approval(task_id, pending)
                approved = await task_store.wait_for_approval_decision(task_id, timeout=60.0)
                if not approved:
                    return

            if not safety_eval.allowed and not safety_eval.requires_approval:
                await task_store.update_task(
                    task_id=task_id,
                    status="failed",
                    stage="safety_violation",
                    error=f"Action blocked by safety policy: {safety_eval.reason}"
                )
                return

            if task_store.is_cancelled(task_id):
                return

            await task_store.update_task(
                task_id=task_id,
                stage="executing_action",
                progress=progress_pct + 5
            )

            exec_result = await browser_service.execute_action(
                action_type=plan.action,
                target_selector=target,
                value=plan.value,
                target_text=plan.response
            )

            await task_store.add_step(
                task_id,
                StepRecord(
                    step_number=step_count,
                    action_type=plan.action,
                    target=target,
                    result=exec_result,
                    verified=exec_result.get("verified", False)
                )
            )

            if not exec_result.get("success"):
                await task_store.update_task(
                    task_id=task_id,
                    status="failed",
                    stage="action_execution_failed",
                    error=exec_result.get("error", "Action failed without specific error.")
                )
                return

            post_observation = await browser_service.get_state()
            await task_store.update_task(
                task_id=task_id,
                last_verified_state={
                    "url": post_observation.get("url"),
                    "title": post_observation.get("title")
                }
            )

            if plan.action == "navigate":
                await task_store.update_task(
                    task_id=task_id,
                    status="completed",
                    stage="completed",
                    progress=100,
                    result=f"Successfully navigated to {post_observation.get('title')} ({post_observation.get('url')}). {plan.response}"
                )
                return

        await task_store.update_task(
            task_id=task_id,
            status="completed",
            stage="step_limit_reached",
            progress=100,
            result="Completed maximum allocated safe steps for this task."
        )
