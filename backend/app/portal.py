from urllib.parse import urlparse

from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

PORTAL_URL = "https://scholarship.up.gov.in/"
ALLOWED_HOSTS = {"scholarship.up.gov.in"}


class PortalInspectionError(RuntimeError):
    pass


def _is_allowed_url(url: str) -> bool:
    parsed = urlparse(url)
    return (
        parsed.scheme == "https"
        and parsed.hostname in ALLOWED_HOSTS
    )


def inspect_up_scholarship() -> dict[str, str]:
    if not _is_allowed_url(PORTAL_URL):
        raise PortalInspectionError(
            "Configured portal URL is not allowlisted."
        )

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            try:
                page = browser.new_page()

                page.goto(
                    PORTAL_URL,
                    wait_until="domcontentloaded",
                    timeout=30_000,
                )

                title = page.title().strip() or "(title unavailable)"
                current_url = page.url

                if not _is_allowed_url(current_url):
                    raise PortalInspectionError(
                        "Portal redirected outside the allowed domain."
                    )

                return {
                    "url": current_url,
                    "title": title,
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
