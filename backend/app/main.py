from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .portal import inspect_up_scholarship, PortalInspectionError

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

