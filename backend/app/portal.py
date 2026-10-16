import os
import subprocess
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

PORTAL_URL = "https://scholarship.up.gov.in/"
ALLOWED_HOSTS = {"scholarship.up.gov.in", "127.0.0.1", "localhost"}
MAX_ITEMS = 25
MAX_TEXT_LENGTH = 200

class PortalInspectionError(RuntimeError):
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

def _clean_text(value: str, limit: int = MAX_TEXT_LENGTH) -> str:
    return " ".join(value.split())[:limit]

def _install_playwright_browser() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        details = (result.stderr or result.stdout or "Unknown installation error.").strip()
        raise PortalInspectionError(f"Playwright Chromium installation failed: {details}")

def _ensure_playwright_ready() -> None:
    try:
        with sync_playwright() as p:
            executable = p.chromium.executable_path
            if not os.path.exists(executable):
                _install_playwright_browser()
    except PortalInspectionError:
        raise
    except Exception as exc:
        message = str(exc)
        if "Executable doesn't exist" in message:
            _install_playwright_browser()
            return
        raise PortalInspectionError(f"Browser check failed: {type(exc).__name__}: {exc}") from exc

def _observe_page(page) -> dict[str, object]:
    headings = page.locator("h1, h2, h3").evaluate_all(
        """els => els
            .filter(el => el.getClientRects().length > 0)
            .map(el => (el.innerText || el.textContent || '').trim())
            .filter(Boolean)
            .slice(0, 25)"""
    )

    links = page.locator("a[href]").evaluate_all(
        """els => els
            .filter(el => el.getClientRects().length > 0)
            .map(el => ({
                text: (el.innerText || el.textContent || '').trim(),
                href: el.href
            }))
            .filter(item => item.text && item.href)
            .slice(0, 100)"""
    )

    buttons = page.locator("button, input[type=button], input[type=submit]").evaluate_all(
        """els => els
            .filter(el => el.getClientRects().length > 0)
            .map(el => ({
                text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim(),
                type: el.getAttribute('type') || el.tagName.toLowerCase()
            }))
            .filter(item => item.text)
            .slice(0, 25)"""
    )

    fields = page.locator("input, select, textarea").evaluate_all(
        """els => els
            .filter(el =>
                el.getClientRects().length > 0 &&
                !['hidden', 'password', 'submit', 'button', 'reset'].includes(
                    (el.getAttribute('type') || '').toLowerCase()
                )
            )
            .map(el => {
                const id = el.id;
                const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
                return {
                    label: (
                        label?.innerText ||
                        el.getAttribute('aria-label') ||
                        el.getAttribute('placeholder') ||
                        ''
                    ).trim(),
                    type: (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase()
                };
            })
            .filter(item => item.label)
            .slice(0, 25)"""
    )

    safe_links = []
    for item in links:
        href = item.get("href", "")
        if isinstance(href, str) and _is_allowed_url(href):
            safe_links.append({
                "text": _clean_text(str(item.get("text", ""))),
                "url": href,
            })
        if len(safe_links) >= MAX_ITEMS:
            break

    return {
        "headings": [_clean_text(str(t)) for t in headings[:MAX_ITEMS] if str(t).strip()],
        "links": safe_links,
        "buttons": [
            {
                "text": _clean_text(str(item.get("text", ""))),
                "type": _clean_text(str(item.get("type", "")), 30),
            }
            for item in buttons[:MAX_ITEMS]
        ],
        "fields": [
            {
                "label": _clean_text(str(item.get("label", ""))),
                "type": _clean_text(str(item.get("type", "")), 30),
            }
            for item in fields[:MAX_ITEMS]
        ],
    }

def inspect_up_scholarship() -> dict[str, str]:
    try:
        _ensure_playwright_ready()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(PORTAL_URL, wait_until="domcontentloaded", timeout=30000)
                if not _is_allowed_url(page.url):
                    raise PortalInspectionError("Portal redirected outside allowed domain.")
                return {
                    "url": page.url,
                    "title": page.title().strip() or "(title unavailable)",
                }
            finally:
                browser.close()
    except PortalInspectionError:
        raise
    except PlaywrightTimeoutError as exc:
        raise PortalInspectionError("Portal did not load within 30 seconds.") from exc
    except Exception as exc:
        raise PortalInspectionError(f"Inspection failed: {type(exc).__name__}: {exc}") from exc

def observe_up_scholarship() -> dict[str, object]:
    try:
        _ensure_playwright_ready()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(PORTAL_URL, wait_until="domcontentloaded", timeout=30000)
                if not _is_allowed_url(page.url):
                    raise PortalInspectionError("Portal redirected outside allowed domain.")
                observation = _observe_page(page)
                return {
                    "url": page.url,
                    "title": page.title().strip() or "(title unavailable)",
                    **observation,
                }
            finally:
                browser.close()
    except PortalInspectionError:
        raise
    except PlaywrightTimeoutError as exc:
        raise PortalInspectionError("Portal did not load within 30 seconds.") from exc
    except Exception as exc:
        raise PortalInspectionError(f"Observation failed: {type(exc).__name__}: {exc}") from exc
