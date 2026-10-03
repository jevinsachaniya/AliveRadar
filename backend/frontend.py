from pathlib import Path

from fastapi import FastAPI
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.middleware.gzip import GZipMiddleware
from starlette.responses import RedirectResponse
from starlette.staticfiles import StaticFiles

from backend.seo import SeoPages


def api_path(path: str) -> bool:
    return any(
        path == prefix or path.startswith(f"{prefix}/") for prefix in ("/api", "/health", "/ready")
    )


class WebsiteFiles(StaticFiles):
    """Serve the compiled website without turning API or missing asset errors into HTML."""

    def __init__(self, directory):
        super().__init__(directory=directory, html=False)
        self.seo = SeoPages(Path(directory))

    async def get_response(self, path: str, scope):
        path = path.replace("\\", "/")
        parts = Path(path).parts
        if api_path(f"/{path}") or any(part.startswith(".") for part in parts):
            raise HTTPException(404)
        if scope["method"] not in {"GET", "HEAD"}:
            raise HTTPException(405)
        route = "/" if path in {"", "."} else f"/{path.lstrip('/')}"
        if route == "/index.html":
            return RedirectResponse("/", status_code=308)
        metadata = self.seo.metadata(route)
        if not metadata.get("notFound"):
            requested = scope["path"]
            if requested != "/" and requested.endswith("/"):
                query = scope.get("query_string", b"").decode("latin-1")
                return RedirectResponse(route + (f"?{query}" if query else ""), status_code=308)
            return self.seo.response(route, Headers(scope=scope))
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            # Missing assets stay JSON 404s; unknown browser routes get a real HTML 404.
            if Path(path).suffix or parts and parts[0] in {"assets", "brand"}:
                raise
            return self.seo.response(route, Headers(scope=scope))
        if response.headers.get("content-type", "").startswith("text/html"):
            response.headers["cache-control"] = "no-cache"
        elif path.startswith("assets/"):
            response.headers["cache-control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["cache-control"] = "public, max-age=3600"
        return response


def mount_website(app: FastAPI, directory: str):
    root = Path(directory).resolve()
    if not (root / "index.html").is_file():
        raise RuntimeError(
            "WEB_DIST_DIR has no index.html. Build the frontend before starting the API."
        )
    # Mount last: API, documentation and health routes must retain precedence.
    app.mount("/", GZipMiddleware(WebsiteFiles(directory=root), minimum_size=1024), name="website")
