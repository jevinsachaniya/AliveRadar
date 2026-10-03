import asyncio
import socket
import ssl
from dataclasses import asdict, dataclass
from time import perf_counter

import aiohttp

from backend.security import PinnedResolver, safe_destination


@dataclass
class CheckResult:
    result_status: str
    http_status_code: int | None
    response_time_ms: int | None
    error_type: str | None = None
    sanitized_error_message: str | None = None

    def values(self) -> dict:
        return asdict(self)


async def perform_check(monitor, resolve_destination=safe_destination) -> CheckResult:
    start = perf_counter()
    try:
        async with asyncio.timeout(monitor.timeout_ms / 1000):
            destination = await resolve_destination(monitor.url)
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
