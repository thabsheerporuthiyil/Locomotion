from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from bookings.models import RideRequest
from drivers.models import DriverProfile
from location.models import District, Panchayath, Taluk

User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminRideLocationHistoryApiTests(APITestCase):
    def setUp(self):
        district = District.objects.create(name="Malappuram")
        taluk = Taluk.objects.create(district=district, name="Perinthalmanna")
        panchayath = Panchayath.objects.create(taluk=taluk, name="Puzhakkattiri")

        self.admin = User.objects.create_user(
            email="admin@example.com",
            name="Admin",
            password="StrongPass123!",
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save(update_fields=["is_staff", "is_superuser"])

        self.rider = User.objects.create_user(
            email="rider@example.com",
            name="Rider",
            password="StrongPass123!",
        )
        self.driver_user = User.objects.create_user(
            email="driver@example.com",
            name="Driver",
            password="StrongPass123!",
        )
        self.driver = DriverProfile.objects.create(
            user=self.driver_user,
            phone_number="9876543210",
            experience_years=3,
            service_type="driver_only",
            panchayath=panchayath,
        )
        self.ride = RideRequest.objects.create(
            rider=self.rider,
            driver=self.driver,
            source_location="Source",
            source_lat=10.9981,
            source_lng=76.2273,
            destination_location="Destination",
            destination_lat=11.0025,
            destination_lng=76.2454,
            status="accepted",
        )

    @patch("location.admin_views.query_location_history")
    def test_admin_can_fetch_ride_location_history(self, mock_query):
        mock_query.return_value = {
            "items": [
                {
                    "ride_id": str(self.ride.id),
                    "event_ts": "2026-04-03T03:30:00+00:00",
                    "role": "driver",
                    "latitude": 11.123456,
                    "longitude": 76.654321,
                    "heading": 90,
                    "source": "websocket",
                }
            ],
            "last_evaluated_key": {
                "ride_id": str(self.ride.id),
                "event_ts": "2026-04-03T03:30:00+00:00",
            },
        }
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            reverse("admin-ride-location-history", args=[self.ride.id]),
            {"order": "desc", "limit": 100},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["ride_id"], self.ride.id)
        self.assertEqual(response.data["booking_status"], "accepted")
        self.assertEqual(response.data["order"], "desc")
        self.assertEqual(response.data["limit"], 100)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["next_cursor"], "2026-04-03T03:30:00+00:00"
        )
        self.assertEqual(response.data["results"][0]["role"], "driver")
        mock_query.assert_called_once_with(
            ride_id=self.ride.id,
            limit=100,
            forward=False,
        )

    def test_non_admin_cannot_fetch_ride_location_history(self):
        self.client.force_authenticate(user=self.rider)

        response = self.client.get(
            reverse("admin-ride-location-history", args=[self.ride.id])
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_fetch_recent_rides_for_history_picker(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            reverse("admin-ride-history-list"),
            {"limit": 25},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.ride.id)
        self.assertEqual(response.data["results"][0]["status"], "accepted")
        self.assertEqual(response.data["results"][0]["rider_email"], self.rider.email)

    def test_admin_can_search_recent_rides_by_exact_numeric_id(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            reverse("admin-ride-history-list"),
            {"q": str(self.ride.id)},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.ride.id)

    def test_non_admin_cannot_fetch_recent_rides_for_history_picker(self):
        self.client.force_authenticate(user=self.rider)

        response = self.client.get(reverse("admin-ride-history-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
