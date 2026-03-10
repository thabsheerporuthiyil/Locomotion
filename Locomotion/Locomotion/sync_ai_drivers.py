import os
import django
import requests
import json
import uuid

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Locomotion.settings')
django.setup()

from drivers.models import DriverProfile
from bookings.models import RideRequest

FASTAPI_URL = "http://localhost:8001/api/ai/sync-driver"
# if running from within same docker network it would be http://fastapi-ai:8000 but we run this from host or web container?
# let's write it to be run from the web container
FASTAPI_INTERNAL_URL = "http://fastapi-ai:8000/api/ai/sync-driver"

def sync_drivers():
    drivers = DriverProfile.objects.all()
    print(f"Found {drivers.count()} drivers. Syncing to Qdrant...")
    
    success_count = 0
    error_count = 0

    for driver in drivers:
        try:
            # Gather Review Text
            # We map from driver's RideRequests where feedback exists
            completed_rides = RideRequest.objects.filter(driver=driver, status='completed').exclude(feedback__isnull=True).exclude(feedback__exact='')
            
            reviews = []
            for ride in completed_rides:
                rating = ride.rating if ride.rating else 'No rating'
                reviews.append(f"[Rating: {rating}/5] {ride.feedback}")
            
            reviews_text = " ".join(reviews) if reviews else "No reviews yet."
            
            # Format Vehicle Info (Assuming Vehicle model relates to driver, check drivers/models.py later. For now, use basic text)
            vehicle_info = "Vehicle details not specified"
            # Locomotion has a vehicles app, we will try to fetch if it exists. But driver profile might have vehicle explicitly or implicitly.
            # Let's see if driver has a related vehicle. 
            if hasattr(driver, 'vehicles') and driver.vehicles.all().exists():
                vehicle = driver.vehicles.first()
                vehicle_info = f"{vehicle.vehicle_category.name} - {vehicle.vehicle_model.name} (Reg: {vehicle.registration_number})"
            
            # Main.py and Qdrant accept integer IDs. The frontend relies on integer IDs for filtering.
            # Using driver.pk directly as the driver_id
            driver_id = driver.pk

            payload = {
                "driver_id": driver_id,
                "name": driver.user.name if driver.user else f"Driver {driver.pk}",
                "bio": driver.about if hasattr(driver, 'about') and driver.about else "Experienced driver",
                "vehicle_info": vehicle_info,
                "reviews_text": reviews_text
            }
            
            # We try internal first (if running in docker compose), then fallback to localhost (if running from host)
            try:
                response = requests.post(FASTAPI_INTERNAL_URL, json=payload, timeout=10)
            except requests.exceptions.ConnectionError:
                response = requests.post(FASTAPI_URL, json=payload, timeout=10)
                
            if response.status_code == 200:
                success_count += 1
                print(f"Synced {payload['name']}")
            else:
                error_count += 1
                print(f"Failed to sync {payload['name']}: {response.text}")
                
        except Exception as e:
            error_count += 1
            print(f"Exception for driver {driver.pk}: {e}")

    print(f"\nSync Complete! Success: {success_count}, Errors: {error_count}")

if __name__ == "__main__":
    sync_drivers()
