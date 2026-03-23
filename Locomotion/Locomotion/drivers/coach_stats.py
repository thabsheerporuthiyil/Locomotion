from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Avg, Count, Sum
from django.db.models.functions import ExtractHour
from django.utils import timezone

from bookings.models import RideRequest
from drivers.models import DriverProfile


@dataclass(frozen=True)
class CoachStatsWindow:
    start: Any
    end: Any
    days: int


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _hour_buckets() -> dict[str, dict[str, float | int]]:
    return {str(h): {"count": 0, "fare_sum": 0.0} for h in range(24)}


def build_driver_earnings_coach_stats(
    *, driver: DriverProfile, days: int = 14
) -> dict[str, Any]:
    days = int(days)
    if days < 1:
        days = 1
    if days > 90:
        days = 90

    window_end = timezone.now()
    window_start = window_end - timedelta(days=days)
    window = CoachStatsWindow(start=window_start, end=window_end, days=days)

    completed_rides = RideRequest.objects.filter(
        status="completed",
        created_at__gte=window.start,
        created_at__lte=window.end,
    )

    driver_completed = completed_rides.filter(driver=driver)

    driver_agg = driver_completed.aggregate(
        rides_completed=Count("id"),
        distance_km_avg=Avg("distance_km"),
        fare_avg=Avg("estimated_fare"),
        fare_sum=Sum("estimated_fare"),
        service_charge_sum=Sum("service_charge"),
    )

    global_agg = completed_rides.aggregate(
        rides_completed=Count("id"),
        distance_km_avg=Avg("distance_km"),
        fare_avg=Avg("estimated_fare"),
        fare_sum=Sum("estimated_fare"),
        service_charge_sum=Sum("service_charge"),
    )

    driver_by_hour = _hour_buckets()
    for row in (
        driver_completed.annotate(hour=ExtractHour("created_at"))
        .values("hour")
        .annotate(count=Count("id"), fare_sum=Sum("estimated_fare"))
        .order_by()
    ):
        hour = row["hour"]
        if hour is None:
            continue
        bucket = driver_by_hour.get(str(int(hour)))
        if not bucket:
            continue
        bucket["count"] = int(row["count"] or 0)
        bucket["fare_sum"] = _as_float(row["fare_sum"]) or 0.0

    global_by_hour = _hour_buckets()
    for row in (
        completed_rides.annotate(hour=ExtractHour("created_at"))
        .values("hour")
        .annotate(count=Count("id"), fare_sum=Sum("estimated_fare"))
        .order_by()
    ):
        hour = row["hour"]
        if hour is None:
            continue
        bucket = global_by_hour.get(str(int(hour)))
        if not bucket:
            continue
        bucket["count"] = int(row["count"] or 0)
        bucket["fare_sum"] = _as_float(row["fare_sum"]) or 0.0

    driver_top_pickups = list(
        driver_completed.exclude(source_location__isnull=True)
        .exclude(source_location__exact="")
        .values("source_location")
        .annotate(count=Count("id"))
        .order_by("-count", "source_location")[:5]
    )

    global_top_pickups = list(
        completed_rides.exclude(source_location__isnull=True)
        .exclude(source_location__exact="")
        .values("source_location")
        .annotate(count=Count("id"))
        .order_by("-count", "source_location")[:5]
    )

    return {
        "window": {
            "days": window.days,
            "start": window.start.isoformat(),
            "end": window.end.isoformat(),
        },
        "driver": {
            "id": driver.id,
            "name": getattr(driver.user, "name", None),
            "wallet_balance": _as_float(driver.wallet_balance),
            "panchayath": str(driver.panchayath) if driver.panchayath_id else None,
        },
        "driver_stats": {
            "rides_completed": int(driver_agg["rides_completed"] or 0),
            "distance_km_avg": _as_float(driver_agg["distance_km_avg"]),
            "fare_avg": _as_float(driver_agg["fare_avg"]),
            "fare_sum": _as_float(driver_agg["fare_sum"]) or 0.0,
            "service_charge_sum": _as_float(driver_agg["service_charge_sum"]) or 0.0,
            "by_hour": driver_by_hour,
            "top_pickups": driver_top_pickups,
        },
        "global_stats": {
            "rides_completed": int(global_agg["rides_completed"] or 0),
            "distance_km_avg": _as_float(global_agg["distance_km_avg"]),
            "fare_avg": _as_float(global_agg["fare_avg"]),
            "fare_sum": _as_float(global_agg["fare_sum"]) or 0.0,
            "service_charge_sum": _as_float(global_agg["service_charge_sum"]) or 0.0,
            "by_hour": global_by_hour,
            "top_pickups": global_top_pickups,
        },
    }
