from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import DriverApplicationReview, DriverProfile, DriverVehicle


@receiver(post_save, sender=DriverApplicationReview)
def handle_application_review(sender, instance, created, **kwargs):
    if instance.status == "approved":
        application = instance.application
        application.status = "approved"
        application.save()

        # Create or Update DriverProfile
        driver_profile, created = DriverProfile.objects.get_or_create(
            user=application.user,
            defaults={
                "phone_number": application.phone_number,
                "experience_years": application.experience_years,
                "service_type": application.service_type,
                "panchayath": application.panchayath,
                "profile_image": application.profile_image,
                # Legacy fields map to primary vehicle
                "vehicle_model": application.vehicle_model,
                "vehicle_registration_number": application.vehicle_registration_number,
            },
        )

        # If profile existed, update fields
        if not created:
            driver_profile.phone_number = application.phone_number
            driver_profile.experience_years = application.experience_years
            driver_profile.service_type = application.service_type
            driver_profile.panchayath = application.panchayath
            driver_profile.profile_image = application.profile_image
            driver_profile.vehicle_model = application.vehicle_model
            driver_profile.vehicle_registration_number = (
                application.vehicle_registration_number
            )
            driver_profile.is_active = True
            driver_profile.save()

        # Create DriverVehicle if applicable
        if (
            application.service_type == "driver_with_vehicle"
            and application.vehicle_model
        ):
            DriverVehicle.objects.create(
                driver=driver_profile,
                vehicle_category=application.vehicle_category,
                vehicle_model=application.vehicle_model,
                registration_number=application.vehicle_registration_number,
                vehicle_image=application.vehicle_image,
                rc_document=application.rc_document,
                insurance_document=application.insurance_document,
                is_primary=True,
                is_active=True,
            )
