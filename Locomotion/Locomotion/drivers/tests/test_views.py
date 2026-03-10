from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import DriverProfile
from location.models import District, Panchayath, Taluk

User = get_user_model()


class DriverViewTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="driver@test.com", password="password123", name="Driver Test"
        )

        self.client.login(email="driver@test.com", password="password123")

        district = District.objects.create(name="Malappuram")
        taluk = Taluk.objects.create(name="Tirur", district=district)
        panchayath = Panchayath.objects.create(name="Test Panchayath", taluk=taluk)

        self.driver = DriverProfile.objects.create(
            user=self.user,
            phone_number="9999999999",
            experience_years=5,
            service_type="driver_only",
            panchayath=panchayath,
        )

    def test_driver_list_view(self):
        url = reverse("driver-list")

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_driver_detail_view(self):
        url = reverse("driver-detail", args=[self.driver.id])

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_driver_availability_toggle(self):
        url = reverse("driver-availability")

        self.client.force_authenticate(user=self.user)

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
