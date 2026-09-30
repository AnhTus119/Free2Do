"""Resolve user-entered addresses and Google Maps links without an API key.

The public Nominatim service is only called for explicit user actions or the
one-off location sync script. Results are cached in-process and requests are
serialized to stay below the public service's one-request-per-second limit.
"""

from __future__ import annotations

from functools import lru_cache
import threading
import time
from urllib.parse import parse_qs, unquote, urlparse

import requests

from app.utils.google_maps import (
    coordinates_from_google_embed,
    coordinates_from_url_text,
    is_google_maps_url,
)


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Free2Do/1.1 (location search; contact: anhtud143@gmail.com)"
_request_lock = threading.Lock()
_last_request_at = 0.0


def _in_vietnam(latitude: float, longitude: float) -> bool:
    return 8.0 <= latitude <= 24.0 and 102.0 <= longitude <= 110.0


def _normalise_query(value: str) -> str:
    return " ".join(unquote(value or "").strip().split())


def _google_query(url: str) -> str | None:
    query = parse_qs(urlparse(url).query)
    for key in ("q", "query", "destination"):
        value = next((item for item in query.get(key, []) if item.strip()), None)
        if value:
            return _normalise_query(value.replace("+", " "))
    return None


def _follow_google_url(url: str) -> str:
    response = requests.get(
        url,
        allow_redirects=True,
        timeout=12,
        stream=True,
        headers={"User-Agent": USER_AGENT},
    )
    try:
        return response.url
    finally:
        response.close()


@lru_cache(maxsize=512)
def geocode_address(address: str) -> tuple[float, float, str] | None:
    """Return ``(latitude, longitude, display_name)`` for one address."""
    query = _normalise_query(address)
    if not query:
        return None
    global _last_request_at
    with _request_lock:
        wait_seconds = 1.05 - (time.monotonic() - _last_request_at)
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        response = requests.get(
            NOMINATIM_URL,
            params={
                "q": query,
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "vn",
                "addressdetails": 0,
            },
            headers={"User-Agent": USER_AGENT, "Accept-Language": "vi"},
            timeout=12,
        )
        _last_request_at = time.monotonic()
    response.raise_for_status()
    rows = response.json()
    if not rows:
        return None
    row = rows[0]
    return float(row["lat"]), float(row["lon"]), row.get("display_name") or query


def resolve_location(value: str, fallback_address: str | None = None) -> tuple[float, float, str, str] | None:
    """Resolve a Google Maps link or address.

    Google links with explicit coordinates win. Short links are expanded and
    their destination address is geocoded; the Google preview viewport is only
    a final fallback because it can be kilometres away from the actual place.
    """
    value = (value or "").strip()
    if not value:
        return None
    if is_google_maps_url(value):
        direct = coordinates_from_url_text(value)
        if direct and _in_vietnam(*direct):
            return direct[0], direct[1], fallback_address or "Vị trí Google Maps", "google_maps"
        try:
            final_url = _follow_google_url(value)
        except requests.RequestException:
            final_url = value
        direct = coordinates_from_url_text(final_url)
        if direct and _in_vietnam(*direct):
            return direct[0], direct[1], fallback_address or "Vị trí Google Maps", "google_maps"
        google_address = _google_query(final_url)
        for candidate in (google_address, fallback_address):
            if candidate:
                try:
                    embedded = coordinates_from_google_embed(candidate)
                except requests.RequestException:
                    embedded = None
                if embedded and _in_vietnam(*embedded):
                    return embedded[0], embedded[1], candidate, "google_embed"
        for candidate in (google_address, fallback_address):
            if candidate and (resolved := geocode_address(candidate)):
                return resolved[0], resolved[1], resolved[2], "nominatim"
        return None
    resolved = geocode_address(value)
    return (*resolved, "nominatim") if resolved else None
