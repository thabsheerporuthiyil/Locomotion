import os
import django
import requests
import time

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Locomotion.settings')
django.setup()

from drivers.models import DriverProfile
from bookings.models import RideRequest

FASTAPI_URL = "http://localhost:8001/api/ai/sync-driver"
# if running from within same docker network it would be http://fastapi-ai:8000 but we run this from host or web container?
# let's write it to be run from the web container
FASTAPI_INTERNAL_URL = "http://fastapi-ai:8000/api/ai/sync-driver"

def _running_in_docker() -> bool:
    # Works for typical Linux containers (including docker compose services).
    return os.path.exists("/.dockerenv")

def _post_with_retries(url: str, payload: dict, timeout: int = 30, attempts: int = 3):
    last_err = None
    for attempt in range(1, attempts + 1):
        try:
            return requests.post(url, json=payload, timeout=timeout)
        except requests.exceptions.ConnectionError as e:
            last_err = e
            if attempt < attempts:
                time.sleep(attempt)  # simple backoff: 1s, 2s, ...
    raise last_err

def sync_drivers():
    drivers = DriverProfile.objects.all()
    print(f"Found {drivers.count()} drivers. Syncing to Qdrant...")
    
    success_count = 0
    error_count = 0

    for driver in drivers:
        try:
            # Gather Review Text
            # Don't require `status='completed'` here; test/admin data may have feedback on other statuses
            # and we still want those keywords (e.g. "pets") searchable in the AI matcher.
            completed_rides = RideRequest.objects.filter(driver=driver).exclude(
                feedback__isnull=True
            ).exclude(feedback='')
            
            reviews = []
            for ride in completed_rides:
                rating_str = f"{ride.rating}/5" if ride.rating else "No rating"
                reviews.append(f"[Rating: {rating_str}] {ride.feedback}")
            
            reviews_text = " ".join(reviews) if reviews else "No reviews recorded for this driver yet."
            
            # Format Vehicle Info (Assuming Vehicle model relates to driver, check drivers/models.py later. For now, use basic text)
            vehicle_info = "Vehicle details not specified"
            # Locomotion has a vehicles app, we will try to fetch if it exists. But driver profile might have vehicle explicitly or implicitly.
            # Let's see if driver has a related vehicle. 
            if hasattr(driver, 'vehicles') and driver.vehicles.all().exists():
                vehicle = driver.vehicles.first()
                vehicle_info = f"{vehicle.vehicle_category.name} - {vehicle.vehicle_model.name} (Reg: {vehicle.registration_number})"
            
            # Main.py and Qdrant accept integer IDs. The frontend relies on integer IDs for filtering.
            driver_id = driver.pk

            payload = {
                "driver_id": driver_id,
                "name": driver.user.name if driver.user else f"Driver {driver.pk}",
                "bio": driver.about if hasattr(driver, 'about') and driver.about else "Experienced driver",
                "vehicle_info": vehicle_info,
                "reviews_text": reviews_text
            }
            
            # If running inside docker compose (e.g. `docker compose exec web ...`), ALWAYS use the service DNS name.
            # `localhost:8001` only works from the host, not from inside the container.
            if _running_in_docker():
                response = _post_with_retries(FASTAPI_INTERNAL_URL, payload, timeout=30, attempts=3)
            else:
                try:
                    response = _post_with_retries(FASTAPI_URL, payload, timeout=30, attempts=3)
                except requests.exceptions.ConnectionError:
                    response = _post_with_retries(FASTAPI_INTERNAL_URL, payload, timeout=30, attempts=1)
                
            if response.status_code == 200:
                success_count += 1
                print(f"Synced {payload['name']}")
            else:
                error_count += 1
                print(f"Failed to sync {payload['name']} via sync-driver endpoint: {response.status_code} {response.text}")
                
        except Exception as e:
            error_count += 1
            print(f"Exception for driver {driver.pk}: {e}")

    print(f"\nSync Complete! Success: {success_count}, Errors: {error_count}")

if __name__ == "__main__":
    sync_drivers()
