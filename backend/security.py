import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit

from aiohttp.abc import AbstractResolver

from backend.config import settings
from backend.schemas import validate_url


def public_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        # is_global alone includes multicast and some special-purpose addresses.
        blocked = (
            ip.is_multicast
            or ip.is_unspecified
            or ip.is_reserved
            or ip.is_loopback
            or ip.is_link_local
        )
        if isinstance(ip, ipaddress.IPv6Address):
            blocked = blocked or ip.sixtofour is not None or ip.teredo is not None
        return ip.is_global and not blocked
    except ValueError:
        return False


@dataclass(frozen=True)
class Destination:
    url: str
    hostname: str
    address: str
    family: int
    port: int


async def resolve_host(hostname: str, port: int) -> list[tuple[str, int]]:
    records = await asyncio.get_running_loop().getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    return list(dict.fromkeys((record[4][0], record[0]) for record in records))


async def safe_destination(raw: str, resolver=resolve_host) -> Destination:
    raw = validate_url(raw)
    url = urlsplit(raw)
    host = (url.hostname or "").lower().rstrip(".")
    port = url.port or (443 if url.scheme == "https" else 80)
    origin = f"{url.scheme}://{url.netloc}"
    cfg = settings()
    if cfg.node_env != "production" and cfg.dev_mock_origin and origin == cfg.dev_mock_origin:
        if host != "127.0.0.1":
            raise ValueError("Development target must use 127.0.0.1.")
        return Destination(raw, host, "127.0.0.1", socket.AF_INET, port)
    if port not in {80, 443}:
        raise ValueError("Only standard HTTP and HTTPS ports are allowed.")
    if (
        host.rsplit(".", 1)[-1]
        in {"localhost", "local", "internal", "lan", "home", "test", "invalid"}
        or "%" in host
    ):
        raise ValueError("Internal hostnames are not allowed.")
    try:
        ip = ipaddress.ip_address(host)
        records = [(str(ip), socket.AF_INET6 if ip.version == 6 else socket.AF_INET)]
    except ValueError:
        if "." not in host:
            raise ValueError("Internal hostnames are not allowed.") from None
        records = await resolver(host, port)
    if not records or any(not public_address(address) for address, _ in records):
        raise ValueError("Private and reserved destinations are not allowed.")
    address, family = records[0]
    return Destination(raw, host, address, family, port)


class PinnedResolver(AbstractResolver):
    def __init__(self, destination: Destination):
        self.destination = destination

    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_INET):
        if host.lower().rstrip(".") != self.destination.hostname or port != self.destination.port:
            raise ValueError("Unexpected destination during socket resolution.")
        return [
            {
                "hostname": host,
                "host": self.destination.address,
                "port": port,
                "family": self.destination.family,
                "proto": 0,
                "flags": socket.AI_NUMERICHOST,
            }
        ]

    async def close(self):
        pass
