"""Rules-based explanations for observed monitor failures.

The diagnosis is intentionally limited to the evidence retained by AliveRadar.
It identifies repeated patterns; it never presents a root cause as confirmed.
"""

from collections import Counter
from datetime import datetime
from typing import Iterable


def _value(item, name, default=None):
    return getattr(item, name, default)


def _cause(title, likelihood, description, steps):
    return {
        "title": title,
        "likelihood": likelihood,
        "description": description,
        "steps": steps,
    }


def _detection(tone, title, detail):
    return {"tone": tone, "title": title, "detail": detail}


def _primary_signal(status_codes, error_types):
    if status_codes:
        code = status_codes.most_common(1)[0][0]
        return f"HTTP {code} detected"
    if error_types:
        kind = error_types.most_common(1)[0][0]
        return f"{kind.title()} failure detected"
    return "No error pattern detected"


def _what_we_detected(failures, status_codes, error_types, previous_success):
    detected = []
    if previous_success is not None:
        code = _value(previous_success, "http_status_code")
        response = _value(previous_success, "response_time_ms")
        detail = (
            f"The last successful check returned HTTP {code}."
            if code
            else "The last successful check completed before this failure pattern."
        )
        if response is not None:
            detail += f" Response time was {response} ms."
        detected.append(_detection("healthy", "Previously operational", detail))
    for code, count in status_codes.most_common(2):
        if code == 503:
            title = "Service unavailable"
        elif 500 <= code <= 599:
            title = "Server-side error"
        elif code == 429:
            title = "Rate limit response"
        elif 400 <= code <= 499:
            title = "Unexpected client-side response"
        else:
            title = "Unexpected HTTP response"
        detected.append(
            _detection(
                "warning",
                title,
                f"{count} recorded check{'s' if count != 1 else ''} returned HTTP {code}.",
            )
        )
    for kind, count in error_types.most_common(2):
        if kind in {"HTTP", "UNKNOWN"}:
            continue
        detected.append(
            _detection(
                "warning",
                f"{kind.title()} failure",
                f"{count} recorded check{'s' if count != 1 else ''} ended with a {kind.lower()} failure.",
            )
        )
    http_failures = [
        _value(check, "response_time_ms")
        for check in failures
        if _value(check, "http_status_code") is not None
        and _value(check, "response_time_ms") is not None
    ]
    if http_failures and max(http_failures) < 1000:
        low, high = min(http_failures), max(http_failures)
        range_text = f"{low} ms" if low == high else f"{low}–{high} ms"
        detected.append(
            _detection(
                "info",
                "Fast error response",
                f"The server or an intermediary returned the failing response in {range_text}.",
            )
        )
    return detected


def _confidence(matches: int, failures: int):
    share = matches / failures if failures else 0
    if matches >= 3 and share >= 0.75:
        return {
            "level": "High",
            "score": 85,
            "explanation": "The same pattern appeared in most of the observed failed checks.",
        }
    if matches >= 2 and share >= 0.5:
        return {
            "level": "Medium",
            "score": 65,
            "explanation": "This pattern appeared more than once, but the observations are limited.",
        }
    return {
        "level": "Low",
        "score": 40 if failures else 0,
        "explanation": "There are too few matching observations to draw a strong conclusion.",
    }


def _response_evidence(checks):
    times = [
        _value(check, "response_time_ms")
        for check in checks
        if _value(check, "response_time_ms") is not None
    ]
    if not times:
        return None
    return {
        "label": "Observed response time",
        "value": f"{round(sum(times) / len(times))} ms average",
        "detail": f"Range: {min(times)}–{max(times)} ms across {len(times)} checks.",
    }


def _current_status_assessment(monitor_status, previous_success):
    status = monitor_status or "UNKNOWN"
    if status == "UP":
        code = _value(previous_success, "http_status_code")
        response = _value(previous_success, "response_time_ms")
        detail = "The latest recorded check was successful."
        if code is not None:
            detail = f"The latest successful check returned HTTP {code}."
        if response is not None:
            detail += f" Response time was {response} ms."
        signal, title, summary = (
            "Page is currently up",
            "Page is operational",
            "This page is currently up. There is no active incident to diagnose.",
        )
    elif status == "PAUSED":
        signal, title, detail, summary = (
            "Monitoring is paused",
            "Monitoring is paused",
            "AliveRadar is not currently collecting new checks for this page.",
            "This monitor is paused, so no current outage diagnosis is available.",
        )
    elif status == "PENDING":
        signal, title, detail, summary = (
            "Waiting for first check",
            "No observation yet",
            "AliveRadar has not recorded a completed check for this page yet.",
            "This monitor is waiting for its first check, so there is no failure evidence to analyze.",
        )
    else:
        signal, title, detail, summary = (
            "Current status is unknown",
            "No active failure pattern",
            "The retained observations do not show a current confirmed outage.",
            "There is no active incident to diagnose from the current monitor status.",
        )
    return {
        "analyzedAt": datetime.now().astimezone(),
        "scope": None,
        "activeFailure": False,
        "summary": summary,
        "primarySignal": signal,
        "confidence": {
            "level": "High" if status == "UP" else "Low",
            "score": 100 if status == "UP" else 0,
            "explanation": "This reflects the monitor’s latest observed status.",
        },
        "evidence": [],
        "whatWeDetected": [_detection("healthy" if status == "UP" else "info", title, detail)],
        "likelyCauses": [],
        "recommendedSteps": [],
        "disclaimer": "Status is based on recorded checks and does not represent continuous availability.",
    }


def diagnose(
    checks: Iterable[object],
    incident: object | None = None,
    previous_success: object | None = None,
    monitor_status: str | None = None,
) -> dict:
    """Return a conservative diagnosis from checks in a recent incident window."""
    if monitor_status in {"UP", "PAUSED", "PENDING", "UNKNOWN"}:
        return _current_status_assessment(monitor_status, previous_success)
    observations = list(checks)
    failures = [check for check in observations if _value(check, "result_status") == "DOWN"]
    scope = None
    if incident is not None:
        scope = {
            "incidentId": _value(incident, "id"),
            "status": _value(incident, "status"),
            "startedAt": _value(incident, "started_at"),
            "resolvedAt": _value(incident, "resolved_at"),
        }

    evidence = [
        {
            "label": "Observed failures",
            "value": f"{len(failures)} of {len(observations)} checks failed",
            "detail": "Only stored monitoring observations are included in this analysis.",
        }
    ]
    response = _response_evidence(observations)
    if response:
        evidence.append(response)

    if not failures:
        return {
            "analyzedAt": datetime.now().astimezone(),
            "scope": scope,
            "activeFailure": False,
            "summary": "No failed checks were found in the selected observation window.",
            "primarySignal": "No error pattern detected",
            "confidence": _confidence(0, 0),
            "evidence": evidence,
            "whatWeDetected": [
                *_what_we_detected([], Counter(), Counter(), previous_success),
                _detection(
                    "info",
                    "No failed checks in this window",
                    "There is not enough failure evidence to recommend an incident-specific fix.",
                ),
            ],
            "likelyCauses": [],
            "recommendedSteps": [
                "Keep monitoring this page so a future failure can be compared with its normal behavior.",
                "Review the expected status codes if this URL intentionally returns a non-200 response.",
            ],
            "disclaimer": "This rules-based assessment uses observed checks and does not confirm a root cause.",
        }

    error_types = Counter((_value(check, "error_type") or "UNKNOWN") for check in failures)
    status_codes = Counter(
        _value(check, "http_status_code")
        for check in failures
        if _value(check, "http_status_code") is not None
    )
    for code, count in status_codes.most_common(3):
        evidence.append(
            {
                "label": "HTTP response pattern",
                "value": f"HTTP {code} observed {count} time{'s' if count != 1 else ''}",
                "detail": "The response was outside this monitor’s expected status codes.",
            }
        )
    for kind, count in error_types.most_common(3):
        if kind != "HTTP" and kind != "UNKNOWN":
            evidence.append(
                {
                    "label": "Connection pattern",
                    "value": f"{kind.title()} failure observed {count} time{'s' if count != 1 else ''}",
                    "detail": "This is the error category recorded by the monitoring check.",
                }
            )

    detected = _what_we_detected(failures, status_codes, error_types, previous_success)

    causes = []
    matched = 0
    http_5xx = [code for code in status_codes if 500 <= code <= 599]
    if http_5xx:
        count = sum(status_codes[code] for code in http_5xx)
        matched = max(matched, count)
        codes = ", ".join(str(code) for code in sorted(http_5xx))
        if 503 in http_5xx:
            steps = [
                "Check your hosting provider, cloud platform, CDN, and status pages for an active incident or maintenance event.",
                "Inspect application, web-server, and reverse-proxy logs around the first failed check.",
                "Check backend health, CPU, memory, connection pools, and upstream dependency availability.",
                "After making a fix, confirm that the next scheduled checks return the expected HTTP status code.",
            ]
        elif 502 in http_5xx or 504 in http_5xx:
            steps = [
                "Check the reverse proxy or load balancer error logs for failed upstream connections.",
                "Confirm the upstream application is running, healthy, and reachable from the proxy.",
                "Review upstream timeouts, deployment changes, and backend capacity.",
                "After restoring the upstream service, confirm the next scheduled checks recover.",
            ]
        else:
            steps = [
                "Check application and web-server error logs for the observed time window.",
                "Review recent deployments, environment changes, and application error tracking.",
                "Check resource saturation and the health of databases or upstream services.",
                "After a fix, confirm that the next scheduled checks return the expected HTTP status code.",
            ]
        causes.append(
            _cause(
                "Repeated server-side HTTP errors",
                "Likely",
                f"AliveRadar observed HTTP {codes} in {count} failed check{'s' if count != 1 else ''}. This can indicate an application, reverse-proxy, capacity, or upstream dependency issue, but the exact component is not verified.",
                steps,
            )
        )
    timeout_count = error_types["TIMEOUT"]
    if timeout_count:
        matched = max(matched, timeout_count)
        causes.append(
            _cause(
                "Requests exceeded the configured timeout",
                "Likely" if timeout_count >= 2 else "Possible",
                f"{timeout_count} check{'s' if timeout_count != 1 else ''} ended in a timeout. The service may be slow, overloaded, waiting on a dependency, or unreachable from the monitor.",
                [
                    "Compare application latency and database or upstream dependency timings at the affected time.",
                    "Review CPU, memory, connection-pool, and queue saturation.",
                    "Confirm the monitor timeout is appropriate for this URL after investigating the slowdown.",
                ],
            )
        )
    dns_count = error_types["DNS"]
    if dns_count:
        matched = max(matched, dns_count)
        causes.append(
            _cause(
                "Hostname resolution failed",
                "Likely" if dns_count >= 2 else "Possible",
                f"{dns_count} check{'s' if dns_count != 1 else ''} could not resolve the hostname. This may relate to DNS records, authoritative nameservers, or DNS-provider availability.",
                [
                    "Resolve the hostname with an independent DNS resolver and compare the expected records.",
                    "Check the domain’s nameserver and DNS-provider status.",
                    "Review recent DNS, CDN, or domain configuration changes.",
                ],
            )
        )
    tls_count = error_types["TLS"]
    if tls_count:
        matched = max(matched, tls_count)
        causes.append(
            _cause(
                "TLS negotiation failed",
                "Likely" if tls_count >= 2 else "Possible",
                f"{tls_count} check{'s' if tls_count != 1 else ''} recorded a TLS failure. A certificate, hostname, certificate-chain, or TLS configuration problem is possible, but not confirmed by this check alone.",
                [
                    "Inspect the live certificate expiry, hostname coverage, and certificate chain.",
                    "Review recent certificate renewals and TLS or CDN configuration changes.",
                    "Test the URL from an independent TLS client to compare the handshake result.",
                ],
            )
        )
    connection_count = error_types["CONNECTION"]
    if connection_count:
        matched = max(matched, connection_count)
        causes.append(
            _cause(
                "The service could not be reached",
                "Likely" if connection_count >= 2 else "Possible",
                f"{connection_count} check{'s' if connection_count != 1 else ''} recorded a connection failure. The origin may not be accepting connections, or a network or firewall path may be blocking them.",
                [
                    "Confirm the origin is listening on the expected public HTTP or HTTPS port.",
                    "Review firewall, security-group, CDN, and load-balancer rules.",
                    "Check host and network health around the affected time window.",
                ],
            )
        )
    blocked_count = error_types["BLOCKED"]
    if blocked_count:
        matched = max(matched, blocked_count)
        causes.append(
            _cause(
                "The monitoring destination was blocked by safety policy",
                "Likely",
                "The URL resolved to a destination that the monitoring service is not permitted to request. This is a monitor configuration or network-address issue, not evidence that the public website is down.",
                [
                    "Use a public HTTP or HTTPS URL on a standard port.",
                    "Check that the hostname does not resolve to a private, loopback, or reserved address.",
                    "Update the monitor URL after the public destination is available.",
                ],
            )
        )
    http_4xx = [code for code in status_codes if 400 <= code <= 499]
    if http_4xx:
        count = sum(status_codes[code] for code in http_4xx)
        matched = max(matched, count)
        codes = ", ".join(str(code) for code in sorted(http_4xx))
        causes.append(
            _cause(
                "Unexpected client-side HTTP response",
                "Possible",
                f"AliveRadar observed HTTP {codes}. This can result from an access rule, missing route, authentication requirement, rate limit, or a changed expected status code.",
                [
                    "Open the monitored URL and verify the route still exists and is publicly accessible.",
                    "Review authentication, bot protection, rate limiting, and web-application firewall rules.",
                    "Confirm the expected status codes match the intended behavior for this URL.",
                ],
            )
        )
    if not causes:
        matched = len(failures)
        causes.append(
            _cause(
                "Mixed or incomplete failure pattern",
                "Possible",
                "The retained checks do not show one repeatable HTTP, timeout, DNS, TLS, or connection pattern. More observations may be needed to narrow the investigation.",
                [
                    "Review the check details and application logs for the observed timestamps.",
                    "Check recent deployments and infrastructure changes.",
                    "Keep the monitor active to collect more evidence if the issue recurs.",
                ],
            )
        )

    primary = causes[0]
    return {
        "analyzedAt": datetime.now().astimezone(),
        "scope": scope,
        "activeFailure": True,
        "summary": f"AliveRadar observed {len(failures)} failed check{'s' if len(failures) != 1 else ''}. The strongest pattern is {primary['title'].lower()}.",
        "primarySignal": _primary_signal(status_codes, error_types),
        "confidence": _confidence(matched, len(failures)),
        "evidence": evidence,
        "whatWeDetected": detected,
        "likelyCauses": causes[:3],
        "recommendedSteps": primary["steps"],
        "disclaimer": "This rules-based assessment uses observed checks and does not confirm a root cause.",
    }
