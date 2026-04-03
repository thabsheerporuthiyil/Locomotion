from celery import shared_task

from bookings.models import RideRequest

from .location_history import location_history_is_enabled, write_location_history_event


@shared_task
def record_location_history_event(
    ride_id,
    role,
    latitude,
    longitude,
    heading=0,
    source="unknown",
    recorded_at=None,
):
    if not location_history_is_enabled():
        return {"saved": False, "reason": "disabled", "ride_id": ride_id}

    try:
        ride = RideRequest.objects.select_related("rider", "driver__user").get(pk=ride_id)
    except RideRequest.DoesNotExist:
        return {"saved": False, "reason": "ride_not_found", "ride_id": ride_id}

    item = write_location_history_event(
        ride=ride,
        role=role,
        latitude=latitude,
        longitude=longitude,
        heading=heading,
        source=source,
        recorded_at=recorded_at,
    )
    return {
        "saved": bool(item),
        "ride_id": str(ride_id),
        "event_ts": item["event_ts"] if item else None,
    }
