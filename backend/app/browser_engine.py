import asyncio
import concurrent.futures
from typing import Any
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page, Playwright, TimeoutError as PlaywrightTimeoutError
from .safety import SafetyPolicy

class BrowserEngineError(RuntimeError):
    pass

class BrowserSession:
    def __init__(self):
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None

    def _sync_init(self) -> None:
        if self._page is not None and not self._page.is_closed():
            return
        try:
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            self._context = self._browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800}
            )
            self._page = self._context.new_page()
        except Exception as exc:
            self._sync_cleanup()
            raise BrowserEngineError(f"Failed to launch browser: {type(exc).__name__}: {exc}") from exc

    def _sync_cleanup(self) -> None:
        if self._page and not self._page.is_closed():
            try:
                self._page.close()
            except Exception:
                pass
        self._page = None
        if self._context:
            try:
                self._context.close()
            except Exception:
                pass
        self._context = None
        if self._browser:
            try:
                self._browser.close()
            except Exception:
                pass
        self._browser = None
        if self._playwright:
            try:
                self._playwright.stop()
            except Exception:
                pass
        self._playwright = None

    def _ensure_page_sync(self) -> Page:
        if self._page is None or self._page.is_closed():
            self._sync_init()
        if self._page is None:
            raise BrowserEngineError("Browser page unavailable.")
        return self._page

    def _sync_navigate(self, url: str) -> dict[str, Any]:
        is_safe, reason = SafetyPolicy.is_url_safe(url)
        if not is_safe:
            raise BrowserEngineError(f"Navigation blocked by safety policy: {reason}")

        page = self._ensure_page_sync()
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=30000)
            final_url = page.url
            redirect_safe, redirect_reason = SafetyPolicy.is_url_safe(final_url)
            if not redirect_safe:
                page.goto("about:blank")
                raise BrowserEngineError(f"Post-redirect safety check failed: {redirect_reason}")

            title = (page.title() or "").strip() or "(no title)"
            status_code = response.status if response else 200
            return {
                "url": final_url,
                "title": title,
                "http_status": status_code,
                "success": True,
            }
        except PlaywrightTimeoutError as exc:
            raise BrowserEngineError(f"Navigation timed out after 30 seconds for {url}") from exc
        except Exception as exc:
            raise BrowserEngineError(f"Navigation error: {type(exc).__name__}: {exc}") from exc

    def _sync_get_state(self) -> dict[str, Any]:
        page = self._ensure_page_sync()
        current_url = page.url
        title = (page.title() or "").strip() or "(no title)"

        headings = page.locator("h1, h2, h3").evaluate_all(
            """els => els
                .filter(el => el.getClientRects().length > 0)
                .map(el => (el.innerText || el.textContent || '').trim())
                .filter(Boolean)
                .slice(0, 25)"""
        )

        links_data = page.locator("a[href]").evaluate_all(
            """els => els
                .filter(el => el.getClientRects().length > 0)
                .map(el => ({
                    text: (el.innerText || el.textContent || '').trim(),
                    href: el.href
                }))
                .filter(item => item.text && item.href)
                .slice(0, 100)"""
        )

        buttons_data = page.locator("button, input[type=button], input[type=submit], a.btn, a.button").evaluate_all(
            """els => els
                .filter(el => el.getClientRects().length > 0)
                .map(el => ({
                    target_id: el.id ? `#${el.id}` : `button:has-text("${(el.innerText || el.value || '').trim().replace(/"/g, '')}")`,
                    text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim(),
                    type: (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase()
                }))
                .filter(item => item.text)
                .slice(0, 25)"""
        )

        fields_data = page.locator("input, select, textarea").evaluate_all(
            """els => els
                .filter(el => {
                    if (el.getClientRects().length === 0) return false;
                    const type = (el.getAttribute('type') || '').toLowerCase();
                    return !['hidden', 'password'].includes(type);
                })
                .map(el => {
                    const id = el.id;
                    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
                    return {
                        selector: id ? `#${id}` : (el.name ? `[name="${el.name}"]` : el.tagName.toLowerCase()),
                        name: el.name || '',
                        id: el.id || '',
                        label: (label?.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '').trim(),
                        type: (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase(),
                        placeholder: el.getAttribute('placeholder') || ''
                    };
                })
                .filter(item => item.label || item.selector)
                .slice(0, 25)"""
        )

        visible_text = page.evaluate(
            """() => {
                const body = document.body;
                if (!body) return '';
                return (body.innerText || '').slice(0, 3000);
            }"""
        )

        safe_links = []
        for item in links_data:
            href = item.get("href", "")
            if href:
                is_safe, _ = SafetyPolicy.is_url_safe(href)
                if is_safe:
                    safe_links.append({
                        "text": " ".join(item.get("text", "").split())[:120],
                        "url": href
                    })
            if len(safe_links) >= 30:
                break

        return {
            "url": current_url,
            "title": title,
            "headings": [" ".join(h.split())[:120] for h in headings[:25] if h.strip()],
            "links": safe_links,
            "buttons": buttons_data[:25],
            "fields": fields_data[:25],
            "visible_text_snippet": " ".join(visible_text.split())[:800],
        }

    def _sync_execute_action(
        self,
        action_type: str,
        target_selector: str,
        value: str | None = None,
        target_text: str = ""
    ) -> dict[str, Any]:
        safety_eval = SafetyPolicy.evaluate_action(
            action_type=action_type,
            target_selector=target_selector,
            target_text=target_text,
            value=value
        )

        if not safety_eval.allowed:
            return {
                "success": False,
                "action": action_type,
                "target": target_selector,
                "requires_approval": safety_eval.requires_approval,
                "error": safety_eval.reason,
                "verified": False,
            }

        page = self._ensure_page_sync()
        try:
            action = action_type.lower().strip()
            if action == "click":
                locator = page.locator(target_selector).first
                if locator.count() == 0:
                    return {
                        "success": False,
                        "action": action_type,
                        "target": target_selector,
                        "error": f"Element not found for selector: {target_selector}",
                        "verified": False,
                    }
                locator.scroll_into_view_if_needed(timeout=5000)
                pre_url = page.url
                locator.click(timeout=10000)
                page.wait_for_timeout(1000)
                post_url = page.url
                return {
                    "success": True,
                    "action": "click",
                    "target": target_selector,
                    "pre_url": pre_url,
                    "post_url": post_url,
                    "verified": True,
                    "message": "Click executed and page state settled."
                }

            elif action == "fill":
                if value is None:
                    value = ""
                locator = page.locator(target_selector).first
                if locator.count() == 0:
                    return {
                        "success": False,
                        "action": action_type,
                        "target": target_selector,
                        "error": f"Form field not found for selector: {target_selector}",
                        "verified": False,
                    }
                locator.scroll_into_view_if_needed(timeout=5000)
                locator.fill(value, timeout=10000)
                entered_value = locator.input_value()
                verified = (entered_value == value)
                return {
                    "success": True,
                    "action": "fill",
                    "target": target_selector,
                    "entered_value": SafetyPolicy.sanitize_field_value(target_selector, value),
                    "verified": verified,
                    "message": "Value filled into target field successfully." if verified else "Field filled but value mismatch during verification."
                }

            elif action == "select":
                locator = page.locator(target_selector).first
                if locator.count() == 0:
                    return {
                        "success": False,
                        "action": action_type,
                        "target": target_selector,
                        "error": f"Select dropdown not found: {target_selector}",
                        "verified": False
                    }
                locator.select_option(value=value)
                return {
                    "success": True,
                    "action": "select",
                    "target": target_selector,
                    "value": value,
                    "verified": True,
                    "message": "Dropdown option selected."
                }

            elif action == "scroll":
                page.evaluate("window.scrollBy(0, 500)")
                return {
                    "success": True,
                    "action": "scroll",
                    "verified": True,
                    "message": "Scrolled down 500 pixels."
                }

            elif action == "navigate":
                nav_result = self._sync_navigate(target_selector)
                return {
                    "success": True,
                    "action": "navigate",
                    "target": target_selector,
                    "post_url": nav_result["url"],
                    "verified": True,
                    "message": f"Successfully navigated to {nav_result['url']}"
                }

            return {
                "success": False,
                "action": action_type,
                "target": target_selector,
                "error": f"Unhandled action type {action_type}",
                "verified": False
            }

        except PlaywrightTimeoutError as exc:
            return {
                "success": False,
                "action": action_type,
                "target": target_selector,
                "error": f"Action timed out: {exc}",
                "verified": False
            }
        except Exception as exc:
            return {
                "success": False,
                "action": action_type,
                "target": target_selector,
                "error": f"Action execution failed: {type(exc).__name__}: {exc}",
                "verified": False
            }

    async def initialize(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._executor, self._sync_init)

    async def close(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._executor, self._sync_cleanup)
        self._executor.shutdown(wait=False)

    async def navigate(self, url: str) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._sync_navigate, url)

    async def get_state(self) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._sync_get_state)

    async def execute_action(
        self,
        action_type: str,
        target_selector: str,
        value: str | None = None,
        target_text: str = ""
    ) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor,
            self._sync_execute_action,
            action_type,
            target_selector,
            value,
            target_text
        )

browser_service = BrowserSession()
