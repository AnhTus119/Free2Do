"""Audit and optionally update seeded activity coordinates.

Google Maps links are treated as the source of truth. If a short link contains
only an address, that address is resolved with Nominatim at <= 1 request/second.

Preview only:
    python sync_activity_locations.py

Update the current database:
    python sync_activity_locations.py --apply
"""

from __future__ import annotations

import argparse

from app import models
from app.database import SessionLocal
from app.utils.distance import haversine_km
from app.utils.geocoding import resolve_location
from seed_activities import GOOGLE_MAP_URLS


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write verified coordinates to the database")
    args = parser.parse_args()
    db = SessionLocal()
    changed = 0
    try:
        print("VERIFIED_COORDINATES = {")
        for activity_id, google_maps_url in GOOGLE_MAP_URLS.items():
            activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
            if activity is None:
                print(f"    # {activity_id}: missing from database")
                continue
            try:
                result = resolve_location(google_maps_url, activity.address)
            except Exception as exc:
                print(f"    # {activity_id}: resolver error: {exc}")
                continue
            if not result:
                print(f"    # {activity_id}: could not resolve {activity.address!r}")
                continue
            latitude, longitude, _display_name, source = result
            old_distance = None
            if activity.latitude is not None and activity.longitude is not None:
                old_distance = haversine_km(latitude, longitude, activity.latitude, activity.longitude)
            marker = "" if old_distance is None else f"  # moved {old_distance:.2f} km ({source})"
            print(f'    "{activity_id}": ({latitude:.7f}, {longitude:.7f}),{marker}')
            if activity.latitude != latitude or activity.longitude != longitude:
                changed += 1
                if args.apply:
                    activity.latitude = latitude
                    activity.longitude = longitude
        print("}")
        if args.apply:
            db.commit()
        else:
            db.rollback()
        print(f"{'Updated' if args.apply else 'Would update'} {changed} activities.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
