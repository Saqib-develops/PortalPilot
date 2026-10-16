# PortalPilot Starter

A minimal working starter for PortalPilot: a React + Vite + Tailwind UI and a FastAPI backend that inspects the **real UP Scholarship portal** using Playwright.

## Requirements
- Python 3.11+
- Node.js 20+
- Internet access for the first browser navigation

## 1. Start the backend (Windows PowerShell)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8000
```

If PowerShell blocks activation, use `Set-ExecutionPolicy -Scope Process Bypass` in that terminal, then activate again.

Backend endpoints:
- `GET http://localhost:8000/api/health`
- `POST http://localhost:8000/api/portal/inspect`

If Playwright raises a missing-browser error, install Chromium in the backend environment with:

```powershell
cd backend
py -m pip install -r requirements.txt
py -m playwright install chromium
```

## 2. Start the frontend (a second terminal)

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## What works in this starter
- Basic PortalPilot UI with a task box and activity log.
- Health check against FastAPI.
- A real Playwright session that visits the public UP Scholarship homepage and returns the observed page title and URL.
- Domain allowlisting for navigation.

## What is deliberately not implemented yet
- Gemma model calls / agent planning.
- Automated login, OTP, CAPTCHA, form submission, or bypassing site protections.
- General-purpose arbitrary website navigation.

Next milestone: replace the inspect-only action with a structured observe → plan → validate → act → verify loop, then integrate the eligible Gemma API model.
