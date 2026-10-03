import base64
import json
import re
from hashlib import sha256
from html import escape
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, Response

from backend.config import settings

PUBLIC_PATHS = ("/", "/overview")
ORIGIN_TOKEN = "__ALIVERADAR_ORIGIN__"
CSP = (
    "default-src 'self'; script-src 'self'{script}; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
)


def indexing_enabled() -> bool:
    cfg = settings()
    return cfg.node_env == "production" and cfg.seo_indexable


def install_seo_routes(app: FastAPI):
    @app.api_route("/robots.txt", methods=["GET", "HEAD"], include_in_schema=False)
    def robots():
        rules = "Allow: /" if indexing_enabled() else "Disallow: /"
        return Response(
            f"User-agent: *\n{rules}\nSitemap: {settings().app_origin}/sitemap.xml\n",
            media_type="text/plain",
            headers={"Cache-Control": "public, max-age=300"},
        )

    @app.api_route("/sitemap.xml", methods=["GET", "HEAD"], include_in_schema=False)
    def sitemap():
        root = Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
        if indexing_enabled():
            for path in PUBLIC_PATHS:
                SubElement(SubElement(root, "url"), "loc").text = settings().app_origin + path
        return Response(
            tostring(root, encoding="utf-8", xml_declaration=True),
            media_type="application/xml",
            headers={"Cache-Control": "public, max-age=300"},
        )


def replace_origin(value, origin):
    if isinstance(value, str):
        return value.replace(ORIGIN_TOKEN, origin)
    if isinstance(value, list):
        return [replace_origin(item, origin) for item in value]
    if isinstance(value, dict):
        return {key: replace_origin(item, origin) for key, item in value.items()}
    return value


class SeoPages:
    def __init__(self, directory: Path):
        manifest = directory / ".seo.json"
        if not manifest.is_file():
            raise RuntimeError(
                "SEO build is missing. Run npm run build before starting the website."
            )
        self.catalog = json.loads(manifest.read_text(encoding="utf-8"))
        self.shell = (directory / "index.html").read_text(encoding="utf-8")
        self.templates = {
            path: (directory / filename).read_text(encoding="utf-8")
            for path, filename in self.catalog["prerender"].items()
        }
        if tuple(self.catalog["publicPages"]) != PUBLIC_PATHS:
            raise RuntimeError("SEO public routes and sitemap configuration differ.")
        for template in [self.shell, *self.templates.values()]:
            if "<!-- seo:start -->" not in template or "<!-- seo:end -->" not in template:
                raise RuntimeError("Frontend SEO template markers are missing. Run npm run build.")

    def metadata(self, path: str):
        page = self.catalog["pages"].get(path)
        if page:
            return page
        for dynamic in self.catalog["dynamicPages"]:
            if re.fullmatch(dynamic["pattern"], path):
                return {
                    "title": f"{dynamic['title']} | AliveRadar",
                    "description": "Website availability and incident information on AliveRadar.",
                    "indexable": False,
                }
        return self.catalog["notFound"]

    def response(self, path: str, request_headers):
        page = self.metadata(path)
        missing = page.get("notFound", False)
        origin = settings().app_origin
        enabled = indexing_enabled()
        indexed = enabled and page["indexable"]
        robots = "index, follow, max-image-preview:large" if indexed else "noindex, follow"
        title, description = escape(page["title"]), escape(page["description"], quote=True)
        image = escape(origin + self.catalog["socialImage"], quote=True)
        canonical = escape(origin + path, quote=True)
        head = [
            f"<title>{title}</title>",
            f'<meta name="description" content="{description}">',
            f'<meta name="robots" content="{robots}">',
            f'<meta name="aliveradar-origin" content="{escape(origin, quote=True)}">',
            f'<meta name="aliveradar-indexable" content="{str(enabled).lower()}">',
            '<meta property="og:type" content="website">',
            '<meta property="og:site_name" content="AliveRadar">',
            '<meta property="og:locale" content="en_US">',
            f'<meta property="og:title" content="{escape(page["title"], quote=True)}">',
            f'<meta property="og:description" content="{description}">',
            f'<meta property="og:image" content="{image}">',
            '<meta property="og:image:alt" content="AliveRadar website monitoring logo">',
            '<meta property="og:image:type" content="image/png">',
            '<meta name="twitter:card" content="summary">',
            f'<meta name="twitter:title" content="{escape(page["title"], quote=True)}">',
            f'<meta name="twitter:description" content="{description}">',
            f'<meta name="twitter:image" content="{image}">',
            '<meta name="twitter:image:alt" content="AliveRadar website monitoring logo">',
        ]
        if not missing:
            head.extend(
                [
                    f'<link rel="canonical" href="{canonical}">',
                    f'<meta property="og:url" content="{canonical}">',
                ]
            )
        schema = self.catalog["schemas"].get(path)
        script_hash = ""
        if schema:
            markup = (
                json.dumps(replace_origin(schema, origin), separators=(",", ":"), ensure_ascii=True)
                .replace("<", "\\u003c")
                .replace(">", "\\u003e")
                .replace("&", "\\u0026")
            )
            head.append(f'<script type="application/ld+json" id="site-schema">{markup}</script>')
            digest = base64.b64encode(sha256(markup.encode()).digest()).decode()
            script_hash = f" 'sha256-{digest}'"
        template = self.templates.get("/not-found" if missing else path, self.shell)
        before, remainder = template.split("<!-- seo:start -->", 1)
        _, after = remainder.split("<!-- seo:end -->", 1)
        content = before + "<!-- seo:start -->" + "\n".join(head) + "<!-- seo:end -->" + after
        etag = f'"{sha256(content.encode()).hexdigest()}"'
        headers = {
            "Cache-Control": "no-cache" if indexed else "private, no-store",
            "X-Robots-Tag": robots,
            "Content-Security-Policy": CSP.format(script=script_hash),
            "ETag": etag,
        }
        if not missing and request_headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=headers)
        return HTMLResponse(content, status_code=404 if missing else 200, headers=headers)
