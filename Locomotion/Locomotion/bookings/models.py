from django.conf import settings
from django.db import models

from drivers.models import DriverProfile

User = settings.AUTH_USER_MODEL


class RideRequest(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("accepted", "Accepted"),
        ("arrived", "Arrived"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    )

    rider = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="ride_requests"
    )
    driver = models.ForeignKey(
        DriverProfile, on_delete=models.CASCADE, related_name="ride_requests"
    )

    source_location = models.CharField(max_length=255)
    source_lat = models.FloatField()
    source_lng = models.FloatField()

    destination_location = models.CharField(max_length=255)
    destination_lat = models.FloatField()
    destination_lng = models.FloatField()

    vehicle_details = models.CharField(max_length=255, null=True, blank=True)

    distance_km = models.FloatField(null=True, blank=True)
    estimated_fare = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    service_charge = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    ride_otp = models.CharField(max_length=4, null=True, blank=True)
    is_paid = models.BooleanField(default=False)

    # Rating Fields
    rating = models.IntegerField(
        null=True, blank=True, choices=[(i, i) for i in range(1, 6)]
    )
    feedback = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.rider.name} -> {self.driver.user.name} ({self.status})"


class ChatMessage(models.Model):
    ride_request = models.ForeignKey(
        RideRequest, on_delete=models.CASCADE, related_name="chat_messages"
    )
    sender = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_messages"
    )
    receiver = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="received_messages"
    )
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Message from {self.sender.name} to {self.receiver.name} on Ride {self.ride_request.id}"
