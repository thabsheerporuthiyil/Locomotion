from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from drivers.models import DriverProfile
from drivers.permissions import IsActiveDriver
from location.models import District, Panchayath, Taluk

User = get_user_model()


class DriverPermissionTest(TestCase):

    def setUp(self):
        self.factory = APIRequestFactory()

        self.user = User.objects.create_user(
            email="driver@test.com", password="pass123", name="Driver"
        )

        district = District.objects.create(name="Malappuram")
        taluk = Taluk.objects.create(name="Tirur", district=district)
        panchayath = Panchayath.objects.create(name="Test", taluk=taluk)

        self.driver = DriverProfile.objects.create(
            user=self.user,
            phone_number="9999999999",
            experience_years=3,
            service_type="driver_only",
            panchayath=panchayath,
        )

    def test_active_driver_permission(self):
        request = self.factory.get("/")
        request.user = self.user

        permission = IsActiveDriver()

        self.assertTrue(permission.has_permission(request, None))

    def test_inactive_driver_permission(self):
        self.driver.is_active = False
        self.driver.save()

        request = self.factory.get("/")
        request.user = self.user

        permission = IsActiveDriver()

        self.assertFalse(permission.has_permission(request, None))
