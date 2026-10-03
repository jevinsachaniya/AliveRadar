from pathlib import Path

from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


def api_path(path: str) -> bool:
    return any(
        path == prefix or path.startswith(f"{prefix}/") for prefix in ("/api", "/health", "/ready")
    )


class WebsiteFiles(StaticFiles):
    """Serve the compiled website without turning API or missing asset errors into HTML."""

    async def get_response(self, path: str, scope):
        path = path.replace("\\", "/")
        parts = Path(path).parts
        if api_path(f"/{path}") or any(part.startswith(".") for part in parts):
            raise HTTPException(404)
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            # Browser routes have no file extension. A missing JS/CSS/image must remain a 404.
            if Path(path).suffix or parts and parts[0] in {"assets", "brand"}:
                raise
            response = await super().get_response("index.html", scope)
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
    app.mount("/", WebsiteFiles(directory=root, html=True), name="website")
