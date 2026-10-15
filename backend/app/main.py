from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .portal import (
    inspect_up_scholarship,
    observe_up_scholarship,
    PortalInspectionError,
)
from .portal import observe_up_scholarship
from .ai_planner import plan_next_action, PlannerError

app = FastAPI(
    title="PortalPilot API",
    description="A safe browser-agent prototype for navigating supported government portals.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


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


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "PortalPilot API"}



@app.post("/api/portal/inspect", response_model=InspectResponse)
def inspect_portal():
    try:
        result = inspect_up_scholarship()

        return InspectResponse(
            status="success",
            portal_name="UP Scholarship",
            url=result["url"],
            title=result["title"],
            message="Inspected the live portal homepage. No forms were submitted.",
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
            message="Observed visible page structure. No forms were submitted.",
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

