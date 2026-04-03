from datetime import timedelta, timezone as dt_timezone
from decimal import Decimal

import boto3
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone


def _dynamodb_region() -> str:
    return getattr(settings, "AWS_DYNAMODB_REGION", getattr(settings, "AWS_REGION", "ap-south-1"))


def _location_history_ttl_days() -> int:
    return getattr(settings, "LOCATION_HISTORY_TTL_DAYS", 180)


def _location_history_sample_seconds() -> int:
    return getattr(settings, "LOCATION_HISTORY_SAMPLE_SECONDS", 5)


def location_history_is_enabled() -> bool:
    return bool(
        getattr(settings, "LOCATION_HISTORY_ENABLED", False)
        and getattr(settings, "DYNAMODB_LOCATION_TABLE", "")
    )


def _to_decimal(value):
    return Decimal(str(value))


def _sample_cache_key(ride_id, role):
    return f"ride_location_history:last_sample:{ride_id}:{role}"


def get_location_history_table():
    return boto3.resource(
        "dynamodb",
        region_name=_dynamodb_region(),
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

    expires_at = recorded_at + timedelta(days=_location_history_ttl_days())
    actor_user_id = (
        ride.driver.user_id if role == "driver" else ride.rider_id if role == "rider" else None
    )

    return {
        "ride_id": str(ride.id),
        "event_ts": recorded_at.astimezone(dt_timezone.utc).isoformat(),
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


def should_sample_location_history_event(ride_id, role) -> bool:
    if not location_history_is_enabled():
        return False

    sample_seconds = _location_history_sample_seconds()
    if sample_seconds <= 0:
        return True

    return cache.add(_sample_cache_key(ride_id, role), "1", timeout=sample_seconds)


def _dispatch_location_history_task(
    ride_id,
    role,
    latitude,
    longitude,
    heading=0,
    source="unknown",
):
    from .tasks import record_location_history_event

    record_location_history_event.delay(
        ride_id=ride_id,
        role=role,
        latitude=latitude,
        longitude=longitude,
        heading=heading,
        source=source,
    )


def enqueue_location_history_event(
    ride_id,
    role,
    latitude,
    longitude,
    heading=0,
    source="unknown",
) -> bool:
    if role not in {"driver", "rider"} or latitude is None or longitude is None:
        return False

    if not should_sample_location_history_event(ride_id, role):
        return False

    _dispatch_location_history_task(
        ride_id=ride_id,
        role=role,
        latitude=latitude,
        longitude=longitude,
        heading=heading,
        source=source,
    )
    return True
