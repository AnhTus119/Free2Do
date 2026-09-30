import re
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests


COORDINATE_PATTERNS = (
    re.compile(r"@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)"),
    re.compile(r"!8m2!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)"),
)
PAGE_COORDINATE_PATTERN = re.compile(
    r"!2d(-?\d{1,3}(?:\.\d+)?)!3d(-?\d{1,2}(?:\.\d+)?)"
)
EMBED_INTEGER_COORDINATE_PATTERN = re.compile(r"\[(\d{8,9}),(\d{9,10})\]")
EMBED_FLOAT_COORDINATE_PATTERN = re.compile(
    r'"[^"\n]+",\s*\[(2[01]\.[0-9]{4,}),(10[4-6]\.[0-9]{4,})\]'
)


def _is_google_maps_host(host: str | None) -> bool:
    host = (host or "").lower().split(":", 1)[0]
    return host == "goo.gl" or host.endswith(".goo.gl") or host == "google.com" or host.endswith(".google.com")


def is_google_maps_url(url: str) -> bool:
    parsed = urlparse((url or "").strip())
    return parsed.scheme in ("http", "https") and _is_google_maps_host(parsed.hostname)


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


def coordinates_from_url_text(url: str) -> tuple[float, float] | None:
    """Extract coordinates already present in a URL without a network call."""
    return _extract(url)


def coordinates_from_google_embed(query: str) -> tuple[float, float] | None:
    """Resolve an address through Google's public legacy embed response.

    This does not use an API key. The integer pair is the place coordinate in
    1e-7 degrees, unlike the unrelated viewport center in normal Maps HTML.
    """
    response = requests.get(
        "https://maps.google.com/maps",
        params={"q": query, "output": "embed"},
        headers={"User-Agent": "Mozilla/5.0 Free2Do/1.1"},
        timeout=12,
    )
    response.raise_for_status()
    content = response.text
    float_match = EMBED_FLOAT_COORDINATE_PATTERN.search(content)
    if float_match:
        return _valid(float(float_match.group(1)), float(float_match.group(2)))
    for match in EMBED_INTEGER_COORDINATE_PATTERN.finditer(content):
        latitude = int(match.group(1)) / 10_000_000
        longitude = int(match.group(2)) / 10_000_000
        if 8 <= latitude <= 24 and 102 <= longitude <= 110:
            return latitude, longitude
    return None


def _extract_page_coordinates(content: str) -> tuple[float, float] | None:
    match = PAGE_COORDINATE_PATTERN.search(unquote(content))
    if not match:
        return None
    longitude, latitude = float(match.group(1)), float(match.group(2))
    return _valid(latitude, longitude)


def coordinates_from_google_maps_url(url: str, *, read_page: bool = True) -> tuple[float, float] | None:
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
                coordinates = _extract(response.url) or _extract(current)
                if coordinates:
                    return coordinates
                if not read_page:
                    return None
                chunks = []
                total = 0
                for chunk in response.iter_content(chunk_size=65536, decode_unicode=True):
                    if not chunk:
                        continue
                    chunks.append(chunk if isinstance(chunk, str) else chunk.decode("utf-8", "ignore"))
                    total += len(chunks[-1])
                    if total >= 524288:
                        break
                return _extract_page_coordinates("".join(chunks))
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
