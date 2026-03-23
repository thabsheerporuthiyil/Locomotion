import requests
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)

FASTAPI_INTERNAL_URL = "http://fastapi-ai:8000/api/ai/sync-driver"

@shared_task
def sync_driver_to_qdrant(driver_profile_id):
    """
    Background task to sync a single driver's profile, vehicle details,
    and reviews to the FastAPI AI Matchmaker (Qdrant Vector Database).
    """
    from drivers.models import DriverProfile
    from bookings.models import RideRequest
    
    try:
        driver = DriverProfile.objects.get(pk=driver_profile_id)
    except DriverProfile.DoesNotExist:
        logger.error(f"DriverProfile {driver_profile_id} not found for AI sync.")
        return

    try:
        # Gather Review Text
        completed_rides = RideRequest.objects.filter(driver=driver).exclude(
            feedback__isnull=True
        ).exclude(feedback__exact='')
        
        
        
        reviews = []
        for ride in completed_rides:
            rating = ride.rating if ride.rating else 'No rating'
            reviews.append(f"[Rating: {rating}/5] {ride.feedback}")
        
        reviews_text = " ".join(reviews) if reviews else "No reviews yet."
        
        # Format Vehicle Info
        vehicle_info = "Vehicle details not specified"
        if hasattr(driver, 'vehicles') and driver.vehicles.exists():
            vehicle = driver.vehicles.first()
            vehicle_info = f"{vehicle.vehicle_type} - {vehicle.vehicle_model} ({vehicle.color})"
        
        # Consistent integer IDs matching the bulk script and frontend expectations
        # Qdrant and main.py expect an integer for driver_id
        driver_id = driver.pk

        payload = {
            "driver_id": driver_id,
            "name": driver.user.name if driver.user else f"Driver {driver.pk}",
            "is_available": driver.is_available,
            "bio": driver.about if hasattr(driver, 'about') and driver.about else "Experienced driver",
            "vehicle_info": vehicle_info,
            "reviews_text": reviews_text
        }
        
        # Push to the internal FastAPI network
        response = requests.post(FASTAPI_INTERNAL_URL, json=payload, timeout=10)
        
        if response.status_code == 200:
            logger.info(f"Successfully synced driver {driver.pk} ({payload['name']}) to AI Matchmaker.")
        else:
            logger.error(f"Failed to sync driver {driver.pk} to AI: {response.text}")
            
    except Exception as e:
        logger.error(f"Exception during AI sync for driver {driver_profile_id}: {e}")


@shared_task
def send_driver_reminder(reminder_id: int) -> None:
    from drivers.models import DriverReminder

    try:
        reminder = DriverReminder.objects.select_related("driver", "driver__user").get(
            pk=reminder_id
        )
    except DriverReminder.DoesNotExist:
        logger.error(f"DriverReminder {reminder_id} not found.")
        return

    if reminder.status != "pending":
        return

    try:
        from django.core.mail import send_mail
        from django.conf import settings

        subject = "Locomotion: Your Driver Coach Reminder"
        message_body = (
            f"Hello {reminder.driver.user.name or 'Driver'},\n\n"
            f"Your Driver Coach has a reminder for you:\n"
            f"\"{reminder.message}\"\n\n"
            f"Set at: {reminder.remind_at.strftime('%H:%M')}\n\n"
            "Stay safe and happy driving!\n"
            "Locomotion Team"
        )
        
        send_mail(
            subject=subject,
            message=message_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[reminder.driver.user.email],
            fail_silently=False,
        )

        logger.info(
            f"[REMINDER SENT] driver={reminder.driver.user.email} at={reminder.remind_at.isoformat()} msg={reminder.message}"
        )
        reminder.status = "sent"
        reminder.sent_at = timezone.now()
        reminder.last_error = ""
        reminder.save(update_fields=["status", "sent_at", "last_error"])
    except Exception as e:
        reminder.status = "failed"
        reminder.last_error = str(e)
        reminder.save(update_fields=["status", "last_error"])
        logger.error(f"Failed to send reminder {reminder_id}: {e}")


