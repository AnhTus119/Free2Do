import re
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests


COORDINATE_PATTERNS = (
    re.compile(r"@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)"),
    re.compile(r"!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)"),
)


def _is_google_maps_host(host: str | None) -> bool:
    host = (host or "").lower().split(":", 1)[0]
    return host == "goo.gl" or host.endswith(".goo.gl") or host == "google.com" or host.endswith(".google.com")


def _valid(latitude: float, longitude: float) -> tuple[float, float] | None:
    if -90 <= latitude <= 90 and -180 <= longitude <= 180:
        return latitude, longitude
    return None


def _extract(url: str) -> tuple[float, float] | None:
    decoded = unquote(url)
    for pattern in COORDINATE_PATTERNS:
        match = pattern.search(decoded)
        if match:
            return _valid(float(match.group(1)), float(match.group(2)))
    query = parse_qs(urlparse(decoded).query)
    for key in ("q", "query", "ll", "destination", "center"):
        for value in query.get(key, []):
            match = re.search(r"(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)", value)
            if match:
                return _valid(float(match.group(1)), float(match.group(2)))
    return None


def coordinates_from_google_maps_url(url: str) -> tuple[float, float] | None:
    """Trích tọa độ, chỉ theo redirect thuộc các miền Google để tránh SSRF."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not _is_google_maps_host(parsed.hostname):
        return None
    coordinates = _extract(url)
    if coordinates:
        return coordinates

    current = url
    for _ in range(5):
        response = requests.get(current, allow_redirects=False, stream=True, timeout=8)
        try:
            if response.status_code not in (301, 302, 303, 307, 308):
                return _extract(current)
            next_url = urljoin(current, response.headers.get("location", ""))
        finally:
            response.close()
        parsed_next = urlparse(next_url)
        if parsed_next.scheme not in ("http", "https") or not _is_google_maps_host(parsed_next.hostname):
            return None
        current = next_url
        coordinates = _extract(current)
        if coordinates:
            return coordinates
    return None
