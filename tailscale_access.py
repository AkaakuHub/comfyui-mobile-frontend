import os
import re
from collections.abc import Awaitable, Callable

from aiohttp import web


def install_access(app: web.Application) -> bool:
    owner = os.environ.get("CUEFORGE_TAILSCALE_OWNER", "").strip().casefold()
    host = os.environ.get("CUEFORGE_TAILSCALE_HOST", "")
    configured = bool(owner and re.fullmatch(r"[a-z0-9-]+\.[a-z0-9-]+\.ts\.net:8443", host))

    @web.middleware
    async def require_access(
        request: web.Request,
        handler: Callable[[web.Request], Awaitable[web.StreamResponse]],
    ) -> web.StreamResponse:
        if not configured:
            raise web.HTTPServiceUnavailable()
        if request.remote != "127.0.0.1" or request.host != host:
            raise web.HTTPForbidden()
        identity = request.headers.getall("Tailscale-User-Login", [])
        if not identity:
            raise web.HTTPUnauthorized()
        if len(identity) != 1 or identity[0].casefold() != owner:
            raise web.HTTPForbidden()
        upgrade = request.headers.get("Upgrade", "").lower() == "websocket"
        origin = request.headers.get("Origin")
        if (upgrade or origin is not None or request.method not in {"GET", "HEAD"}) and origin != f"https://{host}":
            raise web.HTTPForbidden()
        return await handler(request)

    async def protect_response(request: web.Request, response: web.StreamResponse) -> None:
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/mobile/") and response.content_type == "text/html":
            response.headers["Content-Security-Policy"] = (
                f"connect-src 'self' wss://{host}; "
                "img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'none'"
            )

    app.middlewares.insert(0, require_access)
    app.on_response_prepare.append(protect_response)
    return configured
