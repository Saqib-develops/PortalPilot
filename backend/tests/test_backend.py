import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.safety import SafetyPolicy
from app.registry import registry

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "dependencies" in data

def test_api_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"

def test_list_portals():
    response = client.get("/api/portals")
    assert response.status_code == 200
    portals = response.json()
    assert len(portals) >= 1
    ids = [p["id"] for p in portals]
    assert "up-scholarship" in ids

def test_safety_policy_urls():
    safe, _ = SafetyPolicy.is_url_safe("https://scholarship.up.gov.in/")
    assert safe is True

    unsafe_js, _ = SafetyPolicy.is_url_safe("javascript:alert(1)")
    assert unsafe_js is False

    unsafe_domain, _ = SafetyPolicy.is_url_safe("https://malicious-site.com/")
    assert unsafe_domain is False

def test_safety_policy_actions():
    eval_safe = SafetyPolicy.evaluate_action("fill", "#applicant_name", "Student Name", "John Doe")
    assert eval_safe.allowed is True
    assert eval_safe.requires_approval is False

    eval_otp = SafetyPolicy.evaluate_action("fill", "#otp", "OTP Code", "123456")
    assert eval_otp.allowed is False
    assert eval_otp.requires_approval is True

    eval_submit = SafetyPolicy.evaluate_action("click", "#submit_btn", "Final Submit Application")
    assert eval_submit.allowed is False
    assert eval_submit.requires_approval is True

def test_task_lifecycle():
    create_res = client.post("/api/tasks", json={
        "objective": "Find instructions for student registration",
        "portal_id": "up-scholarship"
    })
    assert create_res.status_code == 201
    task_data = create_res.json()
    task_id = task_data["task_id"]
    assert task_data["status"] in ("queued", "running")

    get_res = client.get(f"/api/tasks/{task_id}")
    assert get_res.status_code == 200
    assert get_res.json()["task_id"] == task_id

    cancel_res = client.post(f"/api/tasks/{task_id}/cancel")
    assert cancel_res.status_code in (200, 400)

def test_demo_fixture_endpoint():
    response = client.get("/fixture/demo-portal")
    assert response.status_code == 200
    assert "Uttar Pradesh Scholarship" in response.text

def test_assistant_chat():
    response = client.post("/api/assistant/chat", json={
        "message": "What documents are required?",
        "portal_id": "up-scholarship"
    })
    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert len(data["response"]) > 0
