from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import Notification
from bookings.models import RideRequest
from drivers.models import DriverProfile
from location.models import District, Panchayath, Taluk

User = get_user_model()


class CreateRideRequestTest(APITestCase):

    def setUp(self):

        self.rider = User.objects.create(
            name="Rider", email="rider@test.com", phone_number="9999999999"
        )

        driver_user = User.objects.create(
            name="Driver", email="driver@test.com", phone_number="8888888888"
        )

        self.district = District.objects.create(name="Kozhikode")

        self.taluk = Taluk.objects.create(name="Koyilandy", district=self.district)

        self.panchayath = Panchayath.objects.create(
            name="Test Panchayath", taluk=self.taluk
        )

        self.driver = DriverProfile.objects.create(
            user=driver_user,
            phone_number="8888888888",
            experience_years=5,
            service_type="driver_only",
            panchayath=self.panchayath,
        )

        self.client.force_authenticate(user=self.rider)

    def test_create_ride_request(self):

        url = "/api/bookings/request/"

        data = {
            "driver": self.driver.id,
            "source_location": "Calicut",
            "source_lat": 11.25,
            "source_lng": 75.78,
            "destination_location": "Kozhikode Beach",
            "destination_lat": 11.26,
            "destination_lng": 75.77,
            "distance_km": 5,
            "estimated_fare": 100,
        }

        response = self.client.post(url, data)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(RideRequest.objects.count(), 1)


class RideActionTest(APITestCase):

    def setUp(self):

        self.rider = User.objects.create(
            name="Rider", email="rider@test.com", phone_number="9999999999"
        )

        self.driver_user = User.objects.create(
            name="Driver", email="driver@test.com", phone_number="8888888888"
        )

        self.district = District.objects.create(name="Kozhikode")

        self.taluk = Taluk.objects.create(name="Koyilandy", district=self.district)

        self.panchayath = Panchayath.objects.create(
            name="Test Panchayath", taluk=self.taluk
        )

        self.driver = DriverProfile.objects.create(
            user=self.driver_user,
            phone_number="8888888888",
            experience_years=3,
            service_type="driver_only",
            panchayath=self.panchayath,
        )

        self.ride = RideRequest.objects.create(
            rider=self.rider,
            driver=self.driver,
            source_location="A",
            source_lat=10,
            source_lng=10,
            destination_location="B",
            destination_lat=11,
            destination_lng=11,
            distance_km=10,
            estimated_fare=150,
        )

        self.client.force_authenticate(user=self.driver_user)

    def test_driver_accept_ride(self):

        url = f"/api/bookings/{self.ride.id}/accept/"

        response = self.client.post(url)

        self.ride.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.ride.status, "accepted")

    @override_settings(AWS_SQS_QUEUE_URL="https://example.com/queue")
    @patch("bookings.views.boto3.client")
    def test_confirm_payment_creates_payment_completed_notification(self, mock_boto_client):

        self.ride.status = "completed"
        self.ride.save(update_fields=["status"])
        self.rider.fcm_device_token = "test-fcm-token"
        self.rider.save(update_fields=["fcm_device_token"])
        mock_boto_client.return_value = Mock()

        url = f"/api/bookings/{self.ride.id}/confirm_payment/"

        response = self.client.post(url)

        self.ride.refresh_from_db()
        notification = Notification.objects.filter(user=self.rider).latest("created_at")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.ride.is_paid)
        self.assertEqual(notification.title, "Payment Completed!")
        self.assertEqual(notification.data["type"], "payment_completed")
        self.assertEqual(notification.data["ride_id"], str(self.ride.id))
