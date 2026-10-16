
import os
import subprocess
import sys
from urllib.parse import urlparse

from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

PORTAL_URL = "https://scholarship.up.gov.in/"
ALLOWED_HOSTS = {"scholarship.up.gov.in"}

# Keep observations small enough to send to an AI model.
MAX_ITEMS = 25
MAX_TEXT_LENGTH = 200


class PortalInspectionError(RuntimeError):
    pass


def _is_allowed_url(url: str) -> bool:
    parsed = urlparse(url)
    return (
        parsed.scheme == "https"
        and parsed.hostname in ALLOWED_HOSTS
        and parsed.port in (None, 443)
        and parsed.username is None
        and parsed.password is None
    )


def _clean_text(value: str, limit: int = MAX_TEXT_LENGTH) -> str:
    return " ".join(value.split())[:limit]


def _install_playwright_browser() -> None:
    """Install Chromium if the Playwright browser is missing."""
    result = subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        details = (result.stderr or result.stdout or "Unknown installation error.").strip()
        raise PortalInspectionError(
            "Playwright Chromium is not installed. Automatic installation failed. "
            "Run this command in the backend environment and try again:\n"
            "  python -m playwright install chromium\n\n"
            f"Install output:\n{details}"
        )


def _ensure_playwright_ready() -> None:
    """Checks whether the browser binary is present and installs it if missing."""
    try:
        with sync_playwright() as p:
            executable = p.chromium.executable_path
            if not os.path.exists(executable):
                _install_playwright_browser()
    except PortalInspectionError:
        raise
    except Exception as exc:  # pragma: no cover - platform/browser installation issues
        message = str(exc)
        if "Executable doesn't exist" in message or "Executable doesn't exist at" in message:
            _install_playwright_browser()
            return
        raise PortalInspectionError(
            f"Browser setup check failed: {type(exc).__name__}: {exc}"
        ) from exc


def _observe_page(page) -> dict[str, object]:
    """Extract a bounded, read-only summary of visible page elements."""

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

    # Collect labels and field types only. Never read input values.
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
                const label = id
                    ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
                    : null;
                return {
                    label: (
                        label?.innerText ||
                        el.getAttribute('aria-label') ||
                        el.getAttribute('placeholder') ||
                        ''
                    ).trim(),
                    type: (
                        el.getAttribute('type') ||
                        el.tagName.toLowerCase()
                    ).toLowerCase()
                };
            })
            .filter(item => item.label)
            .slice(0, 25)"""
    )

    # Only return links that stay on the configured portal host.
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
        "headings": [
            _clean_text(str(text))
            for text in headings[:MAX_ITEMS]
            if str(text).strip()
        ],
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


def _open_portal():
    """Open the configured portal and verify its final destination."""
    if not _is_allowed_url(PORTAL_URL):
        raise PortalInspectionError(
            "Configured portal URL is not allowlisted."
        )

    playwright = sync_playwright().start()
    browser = None

    try:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(
            PORTAL_URL,
            wait_until="domcontentloaded",
            timeout=30_000,
        )

        if not _is_allowed_url(page.url):
            raise PortalInspectionError(
                "Portal redirected outside the allowed domain."
            )

        return playwright, browser, page

    except Exception:
        if browser is not None:
            browser.close()
        playwright.stop()
        raise


def inspect_up_scholarship() -> dict[str, str]:
    """Preserve the original title-and-URL inspection."""
    try:
        _ensure_playwright_ready()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(
                    PORTAL_URL,
                    wait_until="domcontentloaded",
                    timeout=30_000,
                )

                if not _is_allowed_url(page.url):
                    raise PortalInspectionError(
                        "Portal redirected outside the allowed domain."
                    )

                return {
                    "url": page.url,
                    "title": page.title().strip() or "(title unavailable)",
                }
            finally:
                browser.close()

    except PortalInspectionError:
        raise
    except PlaywrightTimeoutError as exc:
        raise PortalInspectionError(
            "The portal did not load within 30 seconds."
        ) from exc
    except Exception as exc:
        raise PortalInspectionError(
            f"Browser inspection failed: {type(exc).__name__}: {exc}"
        ) from exc


def observe_up_scholarship() -> dict[str, object]:
    """Inspect visible page structure without interacting with the page."""
    try:
        _ensure_playwright_ready()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(
                    PORTAL_URL,
                    wait_until="domcontentloaded",
                    timeout=30_000,
                )

                if not _is_allowed_url(page.url):
                    raise PortalInspectionError(
                        "Portal redirected outside the allowed domain."
                    )

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
        raise PortalInspectionError(
            "The portal did not load within 30 seconds."
        ) from exc
    except Exception as exc:
        raise PortalInspectionError(
            f"Browser observation failed: {type(exc).__name__}: {exc}"
        ) from exc

