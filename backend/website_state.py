from urllib.parse import urlsplit


def website_origin(url: str) -> str:
    parts = urlsplit(url)
    host = (parts.hostname or "").encode("idna").decode("ascii").lower()
    if ":" in host:
        host = f"[{host}]"
    port = parts.port
    suffix = f":{port}" if port and port != (443 if parts.scheme == "https" else 80) else ""
    return f"{parts.scheme.lower()}://{host}{suffix}"


def overall_status(pages) -> str | None:
    active = [page for page in pages if page.is_active]
    if not active:
        return None
    down = sum(page.current_status == "DOWN" for page in active)
    if down == len(active):
        return "DOWN"
    if down:
        return "DEGRADED"
    if all(page.current_status == "UP" for page in active):
        return "UP"
    return None
