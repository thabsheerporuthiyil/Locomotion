from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from drivers.tasks import sync_driver_to_qdrant
from .models import RideRequest

@receiver(pre_save, sender=RideRequest)
def cache_previous_feedback(sender, instance, **kwargs):
    if not instance.pk:
        instance._prev_feedback = None
        instance._prev_rating = None
        instance._prev_status = None
        return

    try:
        previous = RideRequest.objects.get(pk=instance.pk)
        instance._prev_feedback = previous.feedback
        instance._prev_rating = previous.rating
        instance._prev_status = previous.status
    except RideRequest.DoesNotExist:
        instance._prev_feedback = None
        instance._prev_rating = None
        instance._prev_status = None

@receiver(post_save, sender=RideRequest)
def trigger_ai_sync_on_feedback(sender, instance, created, **kwargs):
    """
    Ensure the driver's info in Qdrant is updated whenever a ride is completed 
    or its feedback/rating is updated (e.g. via Admin).
    """
    if not instance.driver:
        return

    feedback_or_rating_present = bool(instance.feedback) or (instance.rating is not None)
    if not feedback_or_rating_present:
        return

    feedback_changed = getattr(instance, "_prev_feedback", None) != instance.feedback
    rating_changed = getattr(instance, "_prev_rating", None) != instance.rating
    status_changed_to_completed = getattr(instance, "_prev_status", None) != instance.status and instance.status == "completed"

    if created or feedback_changed or rating_changed or status_changed_to_completed:
        sync_driver_to_qdrant.delay(instance.driver.id)
