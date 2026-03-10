from django.contrib.auth import get_user_model
from django.test import TestCase

from bookings.models import RideRequest
from drivers.models import DriverProfile
from location.models import District, Panchayath, Taluk

User = get_user_model()


class RideRequestModelTest(TestCase):

    def setUp(self):

        self.rider = User.objects.create(
            name="Test Rider", email="rider@test.com", phone_number="9999999999"
        )

        self.driver_user = User.objects.create(
            name="Test Driver", email="driver@test.com", phone_number="8888888888"
        )

        self.district = District.objects.create(name="Kozhikode")

        self.taluk = Taluk.objects.create(name="Koyilandy", district=self.district)

        self.panchayath = Panchayath.objects.create(
            name="Test Panchayath", taluk=self.taluk
        )

        self.driver = DriverProfile.objects.create(
            user=self.driver_user,
            phone_number="8888888888",
            experience_years=5,
            service_type="driver_only",
            panchayath=self.panchayath,
        )

    def test_create_ride_request(self):

        ride = RideRequest.objects.create(
            rider=self.rider,
            driver=self.driver,
            source_location="A",
            source_lat=10.0,
            source_lng=75.0,
            destination_location="B",
            destination_lat=11.0,
            destination_lng=76.0,
            distance_km=10,
            estimated_fare=150,
        )

        self.assertEqual(ride.status, "pending")
        self.assertEqual(ride.rider, self.rider)
        self.assertEqual(ride.driver, self.driver)
