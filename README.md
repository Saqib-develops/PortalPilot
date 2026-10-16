# PortalPilot

PortalPilot is an open-source AI browser agent designed for Hacktoberfest 2026 by Team CommitKebabs. It assists citizens in navigating complex government portals—starting with the Uttar Pradesh Scholarship Portal—by observing live webpage structures, planning safe next actions with Google GenAI (Gemma / Gemini), validating every operation against strict human-in-the-loop safety boundaries, and verifying post-action state.

## Core Capabilities

- Playwright browser engine managing live page state, headings, links, interactive buttons, and non-sensitive inputs.
- Provider abstraction supporting Gemma 4 (`gemma-4-26b-a4b-it`), Gemini, or deterministic fallback if API keys are absent.
- Configurable portal registry (`portals.json`) with allowlisted domains and entry points.
- Safety policy blocking unauthorized cross-domain redirects, dangerous URL schemes, passwords, OTPs, captchas, and automated final submissions.
- Interactive human handoff requiring explicit human approval before proceeding with sensitive or irreversible operations.
- Full test suite with unit and integration smoke tests.

## Environment Variables

Copy `.env.example` to `.env` or set in `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMMA_MODEL=gemma-4-26b-a4b-it
```

If `GEMINI_API_KEY` is not provided, PortalPilot automatically operates in deterministic mode using rule-based page inspection and portal registry navigation.

## Quickstart

### 1. Backend Setup & Run (Windows PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
playwright install chromium
$env:PYTHONPATH="backend"
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup & Run

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## API Documentation

Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

Key Endpoints:
- `GET /health` or `GET /api/health`: System health and dependency readiness.
- `GET /api/portals`: Registered portals and entry points.
- `POST /api/tasks`: Initiate a natural-language agent task.
- `GET /api/tasks/{task_id}`: Retrieve task lifecycle state, progress, and verified steps.
- `POST /api/tasks/{task_id}/approve`: Approve a pending sensitive action.
- `POST /api/tasks/{task_id}/cancel`: Cancel a task.
- `GET /api/browser/state`: Observe active browser URL, title, visible text, and interactive elements.
- `POST /api/browser/navigate`: Navigate to an allowlisted portal or page.
- `POST /api/browser/action`: Execute a validated safe click, fill, or select.
- `POST /api/assistant/chat`: Conversational guidance grounded in observed portal pages.
- `POST /api/portal/plan`: Observe portal and generate a structured single-step proposal.
- `GET /fixture/demo-portal`: Local offline test fixture modeling UP scholarship forms and safety boundaries.

## Running Tests

Execute the automated test suite with:

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python.exe -m pytest backend/tests/test_backend.py -v
```

## Quick Demonstration Sequence

1. Open `http://localhost:5173` in your browser.
2. Select target portal: **PortalPilot Safe Demo Playground** (or **UP Scholarship Portal**).
3. Switch mode to **Plan Only** and click **Ask PortalPilot to Plan**. Observe that Gemma / deterministic provider inspects the page, extracts links and form fields, and proposes a safe action without mutating page state.
4. Switch mode to **Autonomous Execution** and submit: `Check student registration form`.
5. Observe live task progress, verified steps, and page inspection in the Agent Activity timeline.
6. When attempting sensitive inputs or submission, observe that the agent pauses and presents human approval controls.
7. Click the chat icon in the topbar to test grounded conversational assistance.
