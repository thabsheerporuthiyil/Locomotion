from unittest.mock import patch

import requests
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import DriverProfile, DriverReminder
from location.models import District, Panchayath, Taluk

User = get_user_model()


class DriverCoachApplyTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="drivercoach@test.com", password="password123", name="Driver Coach"
        )
        self.client.login(email="drivercoach@test.com", password="password123")

        district = District.objects.create(name="Malappuram")
        taluk = Taluk.objects.create(name="Tirur", district=district)
        panchayath = Panchayath.objects.create(name="Test Panchayath", taluk=taluk)

        self.driver = DriverProfile.objects.create(
            user=self.user,
            phone_number="9999999999",
            experience_years=3,
            service_type="driver_only",
            panchayath=panchayath,
        )

    @patch("drivers.views.send_driver_reminder.apply_async")
    def test_apply_creates_reminder(self, mocked_apply_async):
        url = reverse("driver-coach-apply")

        payload = {
            "actions": [{"type": "reminder", "at": "23:59", "message": "Test reminder"}]
        }

        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DriverReminder.objects.count(), 1)
        mocked_apply_async.assert_called_once()

    @patch("drivers.views.send_driver_reminder.apply_async")
    def test_apply_rejects_invalid_time(self, mocked_apply_async):
        url = reverse("driver-coach-apply")

        payload = {
            "actions": [{"type": "reminder", "at": "bad", "message": "Test reminder"}]
        }

        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DriverReminder.objects.count(), 0)
        mocked_apply_async.assert_not_called()


class DriverCoachRemindersTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="driverreminders@test.com",
            password="password123",
            name="Driver Reminders",
        )
        self.client.login(email="driverreminders@test.com", password="password123")

        district = District.objects.create(name="Kozhikode")
        taluk = Taluk.objects.create(name="Koyilandy", district=district)
        panchayath = Panchayath.objects.create(name="Test Panchayath", taluk=taluk)

        self.driver = DriverProfile.objects.create(
            user=self.user,
            phone_number="9999999999",
            experience_years=3,
            service_type="driver_only",
            panchayath=panchayath,
        )

    def test_list_reminders_empty(self):
        url = reverse("driver-coach-reminders")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), [])


class DriverCoachPlanFallbackTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="driverplanfallback@test.com",
            password="password123",
            name="Driver Plan Fallback",
        )
        self.client.login(email="driverplanfallback@test.com", password="password123")

        district = District.objects.create(name="Palakkad")
        taluk = Taluk.objects.create(name="Alathur", district=district)
        panchayath = Panchayath.objects.create(name="Test Panchayath", taluk=taluk)

        self.driver = DriverProfile.objects.create(
            user=self.user,
            phone_number="9999999999",
            experience_years=3,
            service_type="driver_only",
            panchayath=panchayath,
        )

    @patch("drivers.views.requests.post")
    def test_plan_uses_local_fallback_when_ai_down(self, mocked_post):
        mocked_post.side_effect = requests.RequestException("AI down")

        url = reverse("driver-coach-plan")
        response = self.client.get(url + "?days=14&goal=maximize%20earnings")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        self.assertIn("plan", data)
        self.assertEqual(data.get("llm_used"), False)
        self.assertIn(
            "Fallback plan generated in Django", data.get("plan", {}).get("notes", "")
        )
