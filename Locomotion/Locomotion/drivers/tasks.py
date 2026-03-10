import logging
import uuid

import requests
from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

FASTAPI_INTERNAL_URL = "http://fastapi-ai:8000/api/ai/sync-driver"


@shared_task
def sync_driver_to_qdrant(driver_profile_id):
    """
    Background task to sync a single driver's profile, vehicle details,
    and reviews to the FastAPI AI Matchmaker (Qdrant Vector Database).
    """
    from bookings.models import RideRequest
    from drivers.models import DriverProfile

    try:
        driver = DriverProfile.objects.get(pk=driver_profile_id)
    except DriverProfile.DoesNotExist:
        logger.error(f"DriverProfile {driver_profile_id} not found for AI sync.")
        return

    try:
        # Gather Review Text
        completed_rides = (
            RideRequest.objects.filter(driver=driver, status="completed")
            .exclude(feedback__isnull=True)
            .exclude(feedback__exact="")
        )

        reviews = []
        for ride in completed_rides:
            rating = ride.rating if ride.rating else "No rating"
            reviews.append(f"[Rating: {rating}/5] {ride.feedback}")

        reviews_text = " ".join(reviews) if reviews else "No reviews yet."

        # Format Vehicle Info
        vehicle_info = "Vehicle details not specified"
        if hasattr(driver, "vehicles") and driver.vehicles.exists():
            vehicle = driver.vehicles.first()
            vehicle_info = (
                f"{vehicle.vehicle_type} - {vehicle.vehicle_model} ({vehicle.color})"
            )

        # Consistent UUID matching the bulk script
        driver_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"driver_{driver.pk}"))

        payload = {
            "driver_id": driver_uuid,
            "name": driver.user.name if driver.user else f"Driver {driver.pk}",
            "bio": (
                driver.about
                if hasattr(driver, "about") and driver.about
                else "Experienced driver"
            ),
            "vehicle_info": vehicle_info,
            "reviews_text": reviews_text,
        }

        # Push to the internal FastAPI network
        response = requests.post(FASTAPI_INTERNAL_URL, json=payload, timeout=10)

        if response.status_code == 200:
            logger.info(
                f"Successfully synced driver {driver.pk} ({payload['name']}) to AI Matchmaker."
            )
        else:
            logger.error(f"Failed to sync driver {driver.pk} to AI: {response.text}")

    except Exception as e:
        logger.error(f"Exception during AI sync for driver {driver_profile_id}: {e}")
