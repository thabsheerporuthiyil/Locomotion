from __future__ import annotations

from typing import Any


def build_coach_plan_fallback(
    stats: dict[str, Any], *, max_hotspots: int = 5
) -> dict[str, Any]:
    driver_stats = (stats or {}).get("driver_stats") or {}
    global_stats = (stats or {}).get("global_stats") or {}

    by_hour = global_stats.get("by_hour") if isinstance(global_stats, dict) else {}
    hour_rows: list[tuple[int, int, float]] = []
    if isinstance(by_hour, dict):
        for h_str, bucket in by_hour.items():
            try:
                hour = int(h_str)
            except Exception:
                continue
            if not isinstance(bucket, dict):
                continue
            count = int(bucket.get("count") or 0)
            fare_sum = float(bucket.get("fare_sum") or 0.0)
            hour_rows.append((hour, count, fare_sum))

    hour_rows.sort(key=lambda x: (x[1], x[2]), reverse=True)

    best_hours = [
        {
            "start_hour": hour,
            "end_hour": (hour + 1) % 24,
            "reason": "High demand hour based on recent rides.",
        }
        for (hour, _count, _fare_sum) in hour_rows[:3]
    ]

    hotspots: list[str] = []
    top_pickups = (
        driver_stats.get("top_pickups") if isinstance(driver_stats, dict) else None
    )
    if isinstance(top_pickups, list):
        for row in top_pickups:
            if not isinstance(row, dict):
                continue
            loc = (row.get("source_location") or "").strip()
            if loc:
                hotspots.append(loc)
            if len(hotspots) >= max_hotspots:
                break

    actions: list[dict[str, Any]] = []
    for slot in best_hours[:2]:
        start_hour = slot.get("start_hour")
        if isinstance(start_hour, int) and 0 <= start_hour <= 23:
            at = f"{start_hour:02d}:00"
            actions.append(
                {
                    "type": "reminder",
                    "at": at,
                    "message": f"Go online around {at} to catch a peak-demand hour.",
                }
            )

    return {
        "best_hours": best_hours,
        "hotspots": hotspots,
        "actions": actions,
        "notes": "Fallback plan generated in Django (AI service unavailable).",
    }
