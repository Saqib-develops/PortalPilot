import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from fastapi import FastAPI, HTTPException, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel, Field

from .registry import registry, PortalDefinition
from .browser_engine import browser_service, BrowserEngineError
from .ai_provider import get_ai_provider
from .tasks import task_store, TaskRecord
from .agent_harness import AgentHarness
from .portal import (
    inspect_up_scholarship,
    observe_up_scholarship,
    PortalInspectionError,
)
from .ai_planner import plan_next_action, PlannerError

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await browser_service.close()

app = FastAPI(
    title="PortalPilot API",
    description="A safe browser-agent backend for navigating government portals.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreateTaskRequest(BaseModel):
    objective: str = Field(min_length=1, max_length=1000)
    portal_id: str = "up-scholarship"
    custom_url: str | None = None
    access_confirmed: bool = False

class ApproveActionRequest(BaseModel):
    action_id: str

class NavigateRequest(BaseModel):
    url: str

class LaunchRequest(BaseModel):
    portal_id: str = "up-scholarship"
    custom_url: str | None = None

class HighlightRequest(BaseModel):
    selector: str

class ActionRequest(BaseModel):
    action_type: str
    target_selector: str
    value: str | None = None
    target_text: str = ""

class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    portal_id: str = "up-scholarship"

class CrawlRequest(BaseModel):
    query: str | None = Field(default=None, max_length=1000)

class InspectResponse(BaseModel):
    status: str
    portal_name: str
    url: str
    title: str
    message: str

class ObserveResponse(BaseModel):
    status: str
    portal_name: str
    url: str
    title: str
    headings: list[str]
    links: list[dict[str, str]]
    buttons: list[dict[str, str]]
    fields: list[dict[str, str]]
    message: str

class PlanRequest(BaseModel):
    task: str

@app.get("/health")
@app.get("/api/health")
async def health():
    ai_provider, model_name = get_ai_provider()
    tasks = await task_store.list_tasks(limit=100)
    return {
        "status": "ok",
        "app": "PortalPilot API",
        "version": "0.2.0",
        "dependencies": {
            "browser_engine": "playwright-chromium",
            "ai_provider": model_name,
            "portals_registered": len(registry.list_portals()),
            "active_tasks_count": len([t for t in tasks if t.status in ("queued", "running", "waiting_for_approval")])
        }
    }

@app.get("/static/bubble_widget.js")
async def get_bubble_widget():
    widget_path = Path(__file__).parent / "static" / "bubble_widget.js"
    if not widget_path.exists():
        raise HTTPException(status_code=404, detail="Widget script not found.")
    return FileResponse(widget_path, media_type="application/javascript")

@app.get("/fixture/demo-portal", response_class=HTMLResponse)
async def get_demo_fixture():
    fixture_path = Path(__file__).parent / "static" / "demo_portal.html"
    if not fixture_path.exists():
        raise HTTPException(status_code=404, detail="Demonstration fixture not found.")
    return HTMLResponse(content=fixture_path.read_text(encoding="utf-8"))

@app.get("/api/portals", response_model=list[PortalDefinition])
async def list_portals():
    return registry.list_portals()

@app.post("/api/tasks", response_model=TaskRecord, status_code=201)
async def create_task(request: CreateTaskRequest, background_tasks: BackgroundTasks):
    if not request.access_confirmed:
        raise HTTPException(
            status_code=403,
            detail="Review the portal access notice and confirm before starting the agent.",
        )
    portal = registry.get_portal(request.portal_id)
    if not portal:
        raise HTTPException(status_code=400, detail=f"Unsupported portal_id: '{request.portal_id}'.")
    task = await task_store.create_task(
        objective=request.objective,
        portal_id=request.portal_id,
        custom_url=request.custom_url,
    )
    background_tasks.add_task(AgentHarness.run_task, task.task_id)
    return task

@app.get("/api/tasks/{task_id}", response_model=TaskRecord)
async def get_task(task_id: str):
    task = await task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return task

@app.post("/api/tasks/{task_id}/approve")
async def approve_task_action(task_id: str, request: ApproveActionRequest):
    success = await task_store.approve_action(task_id=task_id, action_id=request.action_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot approve action. Task might not be waiting for approval or action_id does not match pending action."
        )
    return {"status": "success", "message": "Pending action approved and resumed."}

@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    success = await task_store.cancel_task(task_id=task_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel task. Task might not exist or is already completed/cancelled/failed."
        )
    return {"status": "success", "message": "Task cancelled successfully."}

@app.get("/api/browser/state")
async def get_browser_state():
    try:
        state = await browser_service.get_state()
        return {"status": "success", "state": state}
    except BrowserEngineError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

@app.post("/api/browser/navigate")
async def browser_navigate(request: NavigateRequest):
    try:
        result = await browser_service.navigate(request.url)
        return {"status": "success", "result": result}
    except BrowserEngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.post("/api/browser/navigate-url")
async def browser_navigate_custom_url(request: NavigateRequest):
    try:
        result = await browser_service.navigate(request.url)
        return {"status": "success", "url": result["url"], "title": result["title"]}
    except BrowserEngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.post("/api/browser/launch")
async def browser_launch(request: LaunchRequest):
    if request.custom_url:
        url = request.custom_url
    else:
        portal = registry.get_portal(request.portal_id)
        url = portal.url if portal else "https://scholarship.up.gov.in/"
    try:
        result = await browser_service.open_new_tab(url)
        return {"status": "success", "portal_id": request.portal_id, "url": result["url"], "title": result["title"]}
    except BrowserEngineError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

@app.get("/api/browser/screenshot")
async def browser_screenshot():
    try:
        png_data = await browser_service.take_screenshot()
        return Response(content=png_data, media_type="image/png")
    except BrowserEngineError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

@app.post("/api/browser/crawl")
async def browser_crawl(request: CrawlRequest | None = None):
    try:
        crawl_data = await browser_service.crawl_page(query=request.query if request else None)
        return {"status": "success", "crawl": crawl_data}
    except BrowserEngineError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

@app.post("/api/browser/highlight")
async def browser_highlight(request: HighlightRequest):
    success = await browser_service.highlight_element(request.selector)
    return {"status": "success", "highlighted": success, "selector": request.selector}

@app.post("/api/browser/action")
async def browser_execute_action(request: ActionRequest):
    try:
        result = await browser_service.execute_action(
            action_type=request.action_type,
            target_selector=request.target_selector,
            value=request.value,
            target_text=request.target_text
        )
        if not result.get("success") and not result.get("requires_approval"):
            raise HTTPException(status_code=400, detail=result.get("error", "Action execution rejected."))
        return {"status": "success", "result": result}
    except BrowserEngineError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

@app.post("/api/assistant/chat")
async def assistant_chat(request: AssistantChatRequest):
    try:
        state = await browser_service.get_state()
        crawl_data = await browser_service.crawl_page(query=request.message)
        state["query_matches"] = crawl_data.get("query_matches", [])
    except BrowserEngineError:
        portal = registry.get_portal(request.portal_id)
        state = {
            "title": portal.name if portal else "Government Portal",
            "url": portal.url if portal else "",
            "visible_text_snippet": portal.description if portal else "",
            "query_matches": [],
        }
    provider, _ = get_ai_provider()
    answer = provider.chat(request.message, state)
    return {
        "status": "success",
        "message": request.message,
        "response": answer,
        "grounded_page": state.get("title", "Portal"),
        "crawl_matches": state.get("query_matches", []),
    }

@app.post("/api/portal/inspect", response_model=InspectResponse)
def inspect_portal():
    try:
        result = inspect_up_scholarship()
        return InspectResponse(
            status="success",
            portal_name="UP Scholarship",
            url=result["url"],
            title=result["title"],
            message="Inspected live portal homepage without submitting forms.",
        )
    except PortalInspectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

@app.post("/api/portal/observe", response_model=ObserveResponse)
def observe_portal():
    try:
        result = observe_up_scholarship()
        return ObserveResponse(
            status="success",
            portal_name="UP Scholarship",
            url=str(result["url"]),
            title=str(result["title"]),
            headings=result["headings"],
            links=result["links"],
            buttons=result["buttons"],
            fields=result["fields"],
            message="Observed visible page structure safely.",
        )
    except PortalInspectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

@app.post("/api/portal/plan")
def plan_portal_task(request: PlanRequest):
    task = request.task.strip()
    if not task or len(task) > 1000:
        raise HTTPException(
            status_code=422,
            detail="Task must be between 1 and 1000 characters.",
        )
    try:
        observation = observe_up_scholarship()
        plan = plan_next_action(task, observation)
        return {
            "status": "success",
            "task": task,
            "observation": observation,
            "plan": plan,
            "executed": False,
            "message": "AI plan generated. No browser action was executed.",
        }
    except PortalInspectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except PlannerError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
