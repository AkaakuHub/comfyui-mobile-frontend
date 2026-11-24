import asyncio
import os
import re
import time
from collections.abc import Awaitable, Callable

from aiohttp import web


def install_access(app: web.Application) -> bool:
    team = os.environ.get("CF_ACCESS_TEAM_DOMAIN", "")
    audience = os.environ.get("CF_ACCESS_AUD", "")
    owner = os.environ.get("CF_ACCESS_OWNER_EMAIL", "").strip().casefold()
    host = os.environ.get("CF_ACCESS_HOST", "")
    configured = bool(
        re.fullmatch(r"https://[a-z0-9-]+\.cloudflareaccess\.com", team)
        and audience
        and owner
        and re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", host)
    )
    keys = None

    @web.middleware
    async def require_access(
        request: web.Request,
        handler: Callable[[web.Request], Awaitable[web.StreamResponse]],
    ) -> web.StreamResponse:
        nonlocal keys
        if not configured:
            raise web.HTTPServiceUnavailable()
        if request.host != host:
            raise web.HTTPForbidden()
        token = request.headers.get("Cf-Access-Jwt-Assertion")
        if not token:
            raise web.HTTPUnauthorized()
        upgrade = request.headers.get("Upgrade", "").lower() == "websocket"
        origin = request.headers.get("Origin")
        if (upgrade or origin is not None or request.method not in {"GET", "HEAD"}) and origin != f"https://{host}":
            raise web.HTTPForbidden()

        try:
            import jwt
        except ImportError:
            raise web.HTTPServiceUnavailable() from None
        if keys is None:
            keys = jwt.PyJWKClient(f"{team}/cdn-cgi/access/certs", timeout=5)
        try:
            signing_key = await asyncio.to_thread(keys.get_signing_key_from_jwt, token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=team,
                audience=audience,
                options={"require": ["exp", "iat", "sub", "email"]},
            )
        except jwt.PyJWKClientConnectionError:
            raise web.HTTPServiceUnavailable() from None
        except (jwt.PyJWTError, ValueError, TypeError):
            raise web.HTTPUnauthorized() from None
        email = claims["email"]
        if not isinstance(email, str) or email.casefold() != owner:
            raise web.HTTPForbidden()

        transport = request.transport
        if upgrade and transport is not None:
            expiry = asyncio.get_running_loop().call_later(
                max(0, int(claims["exp"]) - time.time()), transport.close
            )
            try:
                return await handler(request)
            finally:
                expiry.cancel()
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
