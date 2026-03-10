import logging
from datetime import timedelta

import razorpay
from celery import shared_task
from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from drivers.models import DriverProfile

from .models import RideRequest

logger = logging.getLogger(__name__)

razorpay_client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)


@shared_task
def auto_cancel_stale_rides():
    """
    Cancels any ride requests that have been pending for more than 5 minutes.
    This frees up the rider's map and cleans out the driver's request queue.
    """
    five_minutes_ago = timezone.now() - timedelta(minutes=5)

    stale_rides = RideRequest.objects.filter(
        status="pending", created_at__lte=five_minutes_ago
    )
    count = stale_rides.count()

    if count > 0:
        stale_rides.update(status="cancelled")
        return f"Auto-cancelled {count} stale ride requests"
    return "No stale rides to cancel"
