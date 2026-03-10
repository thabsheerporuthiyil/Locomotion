from django.contrib.auth import get_user_model
from django.test import TestCase

from drivers.models import DriverProfile
from location.models import District, Panchayath, Taluk

User = get_user_model()


class DriverModelTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="driver@test.com", password="password123", name="Test Driver"
        )

        self.district = District.objects.create(name="Kozhikode")

        self.taluk = Taluk.objects.create(name="Koyilandy", district=self.district)

        self.panchayath = Panchayath.objects.create(
            name="Test Panchayath", taluk=self.taluk
        )

        self.driver = DriverProfile.objects.create(
            user=self.user,
            phone_number="9999999999",
            experience_years=5,
            service_type="driver_only",
            panchayath=self.panchayath,
        )

    def test_driver_profile_created(self):
        self.assertEqual(self.driver.user.email, "driver@test.com")

    def test_driver_str(self):
        self.assertEqual(str(self.driver), f"{self.user} - Driver")

    def test_driver_is_active_default(self):
        self.assertTrue(self.driver.is_active)
