import asyncio
import time
import uuid
from typing import Any, Literal
from pydantic import BaseModel, Field

TaskState = Literal[
    "queued",
    "running",
    "waiting_for_approval",
    "completed",
    "failed",
    "cancelled"
]

class PendingAction(BaseModel):
    action_id: str
    action_type: str
    target: str
    target_text: str = ""
    value: str | None = None
    reason: str
    created_at: float = Field(default_factory=time.time)

class StepRecord(BaseModel):
    step_number: int
    action_type: str
    target: str
    result: dict[str, Any]
    verified: bool
    timestamp: float = Field(default_factory=time.time)

class TaskRecord(BaseModel):
    task_id: str
    objective: str
    portal_id: str
    status: TaskState = "queued"
    stage: str = "initialized"
    progress: int = 0
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    steps: list[StepRecord] = Field(default_factory=list)
    pending_action: PendingAction | None = None
    last_verified_state: dict[str, Any] | None = None
    result: str | None = None
    error: str | None = None

class TaskStore:
    def __init__(self):
        self._tasks: dict[str, TaskRecord] = {}
        self._cancellation_events: dict[str, asyncio.Event] = {}
        self._approval_events: dict[str, asyncio.Event] = {}
        self._approval_decisions: dict[str, bool] = {}
        self._lock = asyncio.Lock()

    async def create_task(self, objective: str, portal_id: str = "up-scholarship") -> TaskRecord:
        async with self._lock:
            task_id = str(uuid.uuid4())
            record = TaskRecord(
                task_id=task_id,
                objective=objective.strip(),
                portal_id=portal_id,
                status="queued",
                stage="queued"
            )
            self._tasks[task_id] = record
            self._cancellation_events[task_id] = asyncio.Event()
            self._approval_events[task_id] = asyncio.Event()
            return record

    async def get_task(self, task_id: str) -> TaskRecord | None:
        async with self._lock:
            return self._tasks.get(task_id)

    async def list_tasks(self, limit: int = 20) -> list[TaskRecord]:
        async with self._lock:
            tasks_sorted = sorted(
                self._tasks.values(),
                key=lambda t: t.created_at,
                reverse=True
            )
            return tasks_sorted[:limit]

    async def update_task(
        self,
        task_id: str,
        status: TaskState | None = None,
        stage: str | None = None,
        progress: int | None = None,
        pending_action: PendingAction | None = ...,
        last_verified_state: dict[str, Any] | None = None,
        result: str | None = None,
        error: str | None = None
    ) -> TaskRecord | None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            if status is not None:
                task.status = status
            if stage is not None:
                task.stage = stage
            if progress is not None:
                task.progress = progress
            if pending_action is not ...:
                task.pending_action = pending_action
            if last_verified_state is not None:
                task.last_verified_state = last_verified_state
            if result is not None:
                task.result = result
            if error is not None:
                task.error = error
            task.updated_at = time.time()
            return task

    async def add_step(self, task_id: str, step: StepRecord) -> None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.steps.append(step)
                task.updated_at = time.time()

    async def cancel_task(self, task_id: str) -> bool:
        async with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False
            if task.status in ("completed", "failed", "cancelled"):
                return False
            task.status = "cancelled"
            task.stage = "cancelled_by_user"
            task.error = "Task cancelled by user request."
            task.updated_at = time.time()
            if task_id in self._cancellation_events:
                self._cancellation_events[task_id].set()
            return True

    def is_cancelled(self, task_id: str) -> bool:
        event = self._cancellation_events.get(task_id)
        return event.is_set() if event else False

    async def request_approval(self, task_id: str, action: PendingAction) -> None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = "waiting_for_approval"
                task.stage = "awaiting_user_confirmation"
                task.pending_action = action
                task.updated_at = time.time()
            if task_id in self._approval_events:
                self._approval_events[task_id].clear()
            self._approval_decisions[task_id] = False

    async def approve_action(self, task_id: str, action_id: str) -> bool:
        async with self._lock:
            task = self._tasks.get(task_id)
            if not task or task.status != "waiting_for_approval":
                return False
            if not task.pending_action or task.pending_action.action_id != action_id:
                return False
            self._approval_decisions[task_id] = True
            if task_id in self._approval_events:
                self._approval_events[task_id].set()
            task.status = "running"
            task.stage = "action_approved_executing"
            task.pending_action = None
            task.updated_at = time.time()
            return True

    async def wait_for_approval_decision(self, task_id: str, timeout: float = 60.0) -> bool:
        event = self._approval_events.get(task_id)
        if not event:
            return False
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            return self._approval_decisions.get(task_id, False)
        except asyncio.TimeoutError:
            await self.update_task(
                task_id=task_id,
                status="failed",
                stage="approval_timed_out",
                error="Action approval timed out after 60 seconds."
            )
            return False

task_store = TaskStore()
