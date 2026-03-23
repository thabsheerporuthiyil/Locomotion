from django.conf import settings
from django.db import models

from location.models import Panchayath
from vehicles.models import VehicleCategory, VehicleModel

User = settings.AUTH_USER_MODEL


class DriverApplication(models.Model):

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    )

    SERVICE_TYPE_CHOICES = (
        ("driver_only", "Driver Only"),
        ("driver_with_vehicle", "Driver With Vehicle"),
    )

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="driver_application"
    )

    phone_number = models.CharField(max_length=15)
    experience_years = models.PositiveIntegerField()

    service_type = models.CharField(max_length=30, choices=SERVICE_TYPE_CHOICES)

    vehicle_model = models.ForeignKey(
        VehicleModel, on_delete=models.SET_NULL, null=True, blank=True
    )

    vehicle_category = models.ForeignKey(
        VehicleCategory, on_delete=models.SET_NULL, null=True, blank=True
    )

    vehicle_registration_number = models.CharField(max_length=20, null=True, blank=True)

    # Documents & Images
    profile_image = models.ImageField(upload_to="profiles/")
    license_document = models.FileField(upload_to="driver_documents/licenses/")

    # Vehicle Documents (Only if driver_with_vehicle)
    rc_document = models.FileField(
        upload_to="driver_documents/rc/", null=True, blank=True
    )
    insurance_document = models.FileField(
        upload_to="driver_documents/insurance/", null=True, blank=True
    )
    vehicle_image = models.ImageField(
        upload_to="vehicle_images/", null=True, blank=True
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    panchayath = models.ForeignKey(
        Panchayath, on_delete=models.PROTECT, related_name="applications"
    )

    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} - {self.status}"


class DriverApplicationReview(models.Model):

    STATUS_CHOICES = (
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    )

    application = models.ForeignKey(
        DriverApplication, on_delete=models.CASCADE, related_name="reviews"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES)

    reason = models.TextField(blank=True, null=True)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="driver_reviews_done",
    )

    reviewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-reviewed_at"]

    def __str__(self):
        return f"{self.application.user} - {self.status}"


class DriverProfile(models.Model):

    SERVICE_TYPE_CHOICES = (
        ("driver_only", "Driver Only"),
        ("driver_with_vehicle", "Driver With Vehicle"),
    )

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="driver_profile"
    )

    phone_number = models.CharField(max_length=15)
    experience_years = models.PositiveIntegerField()

    service_type = models.CharField(max_length=30, choices=SERVICE_TYPE_CHOICES)

    # Retrieve primary vehicle details (Legacy support / Quick Access)
    vehicle_model = models.ForeignKey(
        VehicleModel, on_delete=models.SET_NULL, null=True, blank=True
    )

    vehicle_registration_number = models.CharField(max_length=20, null=True, blank=True)

    panchayath = models.ForeignKey(
        Panchayath, on_delete=models.PROTECT, related_name="drivers"
    )
    profile_image = models.ImageField(upload_to="profiles/", null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_available = models.BooleanField(default=True)

    # Rating Fields
    average_rating = models.FloatField(default=0.0)
    total_ratings = models.IntegerField(default=0)

    # Wallet Balance (Prepaid Commission Model)
    wallet_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    created_at = models.DateTimeField(auto_now_add=True)

    # Razorpay Linked Account ID for weekly payouts
    razorpay_account_id = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.user} - Driver"


class DriverVehicle(models.Model):
    driver = models.ForeignKey(
        DriverProfile, on_delete=models.CASCADE, related_name="vehicles"
    )

    vehicle_category = models.ForeignKey(VehicleCategory, on_delete=models.PROTECT)
    vehicle_model = models.ForeignKey(VehicleModel, on_delete=models.PROTECT)

    registration_number = models.CharField(max_length=20)

    vehicle_image = models.ImageField(upload_to="vehicle_images/")
    rc_document = models.FileField(upload_to="driver_documents/rc/")
    insurance_document = models.FileField(upload_to="driver_documents/insurance/")

    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.driver.user.name} - {self.vehicle_model}"


class DriverReminder(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("sent", "Sent"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    )

    driver = models.ForeignKey(
        DriverProfile, on_delete=models.CASCADE, related_name="reminders"
    )
    remind_at = models.DateTimeField()
    message = models.TextField()

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    sent_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-remind_at", "-created_at"]

    def __str__(self):
        return (
            f"Reminder for {self.driver.user.name} at {self.remind_at} ({self.status})"
        )
