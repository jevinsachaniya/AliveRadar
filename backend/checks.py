import asyncio
import socket
import ssl
from datetime import UTC, datetime
from dataclasses import asdict, dataclass
from time import perf_counter
from urllib.parse import urlsplit

import aiohttp

from backend.security import PinnedResolver, safe_destination


SSL_EXPIRY_WARNING_DAYS = 14


@dataclass
class CheckResult:
    result_status: str
    http_status_code: int | None
    response_time_ms: int | None
    error_type: str | None = None
    sanitized_error_message: str | None = None

    def values(self) -> dict:
        return asdict(self)


@dataclass
class NetworkCheckResult:
    dns_status: str = "UNKNOWN"
    dns_address: str | None = None
    dns_error: str | None = None
    dns_checked_at: datetime | None = None
    tls_status: str = "NOT_APPLICABLE"
    tls_expires_at: datetime | None = None
    tls_days_remaining: int | None = None
    tls_error: str | None = None
    tls_checked_at: datetime | None = None

    def values(self) -> dict:
        return asdict(self)


async def tls_certificate_expiry(destination) -> datetime:
    """Validate TLS for the monitored hostname and return its leaf certificate expiry."""
    context = ssl.create_default_context()
    reader, writer = await asyncio.open_connection(
        destination.address,
        destination.port,
        family=destination.family,
        ssl=context,
        server_hostname=destination.hostname,
    )
    try:
        ssl_object = writer.get_extra_info("ssl_object")
        certificate = ssl_object.getpeercert() if ssl_object else None
        not_after = certificate.get("notAfter") if certificate else None
        if not not_after:
            raise ssl.SSLError("Peer certificate did not include an expiry.")
        return datetime.fromtimestamp(ssl.cert_time_to_seconds(not_after), UTC).replace(tzinfo=None)
    finally:
        writer.close()
        await writer.wait_closed()


async def perform_network_check(
    monitor, resolve_destination=safe_destination
) -> tuple[NetworkCheckResult, object | None]:
    """Check DNS reachability and HTTPS certificate health without following page redirects."""
    checked_at = datetime.now(UTC).replace(tzinfo=None)
    try:
        destination = await resolve_destination(monitor.url)
    except (socket.gaierror, aiohttp.ClientConnectorDNSError, OSError, ValueError, TimeoutError):
        return (
            NetworkCheckResult(
                dns_status="FAILED",
                dns_error="The monitored hostname could not be resolved to an allowed public address.",
                dns_checked_at=checked_at,
                tls_status="NOT_APPLICABLE"
                if urlsplit(monitor.url).scheme != "https"
                else "UNKNOWN",
            ),
            None,
        )

    result = NetworkCheckResult(
        dns_status="RESOLVED",
        dns_address=destination.address,
        dns_checked_at=checked_at,
    )
    if urlsplit(monitor.url).scheme != "https":
        return result, destination

    result.tls_checked_at = checked_at
    try:
        async with asyncio.timeout(getattr(monitor, "timeout_ms", 10000) / 1000):
            expires_at = await tls_certificate_expiry(destination)
        remaining = max(0, (expires_at.date() - checked_at.date()).days)
        result.tls_expires_at = expires_at
        result.tls_days_remaining = remaining
        result.tls_status = "EXPIRING" if remaining <= SSL_EXPIRY_WARNING_DAYS else "VALID"
    except (ssl.SSLError, OSError, asyncio.TimeoutError):
        result.tls_status = "FAILED"
        result.tls_error = "The TLS certificate or secure connection could not be validated."
    return result, destination


async def perform_check(
    monitor, resolve_destination=safe_destination, destination=None
) -> CheckResult:
    start = perf_counter()
    try:
        async with asyncio.timeout(monitor.timeout_ms / 1000):
            destination = destination or await resolve_destination(monitor.url)
            connector = aiohttp.TCPConnector(
                resolver=PinnedResolver(destination),
                use_dns_cache=False,
                force_close=True,
                limit=1,
                family=destination.family,
            )
            async with aiohttp.ClientSession(
                connector=connector,
                trust_env=False,
                timeout=aiohttp.ClientTimeout(total=monitor.timeout_ms / 1000),
                headers={"User-Agent": "AliveRadar/2.0 uptime-monitor", "Accept": "*/*"},
            ) as client:
                async with client.request(
                    monitor.method,
                    destination.url,
                    allow_redirects=False,
                    max_line_size=8190,
                    max_field_size=8190,
                ) as response:
                    code = response.status
                    success = code in monitor.expected_status_codes
                    response.close()
                    return CheckResult(
                        "UP" if success else "DOWN",
                        code,
                        round((perf_counter() - start) * 1000),
                        None if success else "HTTP",
                        None if success else f"Unexpected HTTP {code}. Redirects are not followed.",
                    )
    except TimeoutError:
        kind = "TIMEOUT"
    except (ssl.SSLError, aiohttp.ClientConnectorCertificateError, aiohttp.ClientSSLError):
        kind = "TLS"
    except (socket.gaierror, aiohttp.ClientConnectorDNSError):
        kind = "DNS"
    except ValueError:
        kind = "BLOCKED"
    except (OSError, aiohttp.ClientError):
        kind = "CONNECTION"
    return CheckResult(
        "DOWN",
        None,
        round((perf_counter() - start) * 1000),
        kind,
        "Destination rejected by outbound security policy."
        if kind == "BLOCKED"
        else f"{kind.lower()} failure while checking destination.",
    )
