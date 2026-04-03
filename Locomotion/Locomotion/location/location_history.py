from datetime import timedelta
from decimal import Decimal

import boto3
from django.conf import settings
from django.utils import timezone


def location_history_is_enabled() -> bool:
    return bool(
        getattr(settings, "LOCATION_HISTORY_ENABLED", False)
        and getattr(settings, "DYNAMODB_LOCATION_TABLE", "")
    )


def _to_decimal(value):
    return Decimal(str(value))


def get_location_history_table():
    return boto3.resource(
        "dynamodb",
        region_name=settings.AWS_DYNAMODB_REGION,
    ).Table(settings.DYNAMODB_LOCATION_TABLE)


def build_location_history_item(
    ride,
    role,
    latitude,
    longitude,
    heading=0,
    source="unknown",
    recorded_at=None,
):
    recorded_at = recorded_at or timezone.now()
    if timezone.is_naive(recorded_at):
        recorded_at = timezone.make_aware(recorded_at, timezone.get_current_timezone())

    expires_at = recorded_at + timedelta(days=settings.LOCATION_HISTORY_TTL_DAYS)
    actor_user_id = (
        ride.driver.user_id if role == "driver" else ride.rider_id if role == "rider" else None
    )

    return {
        "ride_id": str(ride.id),
        "event_ts": recorded_at.astimezone(timezone.utc).isoformat(),
        "role": role,
        "actor_user_id": actor_user_id,
        "rider_id": ride.rider_id,
        "driver_profile_id": ride.driver_id,
        "driver_user_id": ride.driver.user_id,
        "booking_status": ride.status,
        "latitude": _to_decimal(latitude),
        "longitude": _to_decimal(longitude),
        "heading": _to_decimal(heading),
        "source": source,
        "expires_at": int(expires_at.timestamp()),
    }


def write_location_history_event(
    ride,
    role,
    latitude,
    longitude,
    heading=0,
    source="unknown",
    recorded_at=None,
):
    if not location_history_is_enabled():
        return None

    item = build_location_history_item(
        ride=ride,
        role=role,
        latitude=latitude,
        longitude=longitude,
        heading=heading,
        source=source,
        recorded_at=recorded_at,
    )
    get_location_history_table().put_item(Item=item)
    return item
