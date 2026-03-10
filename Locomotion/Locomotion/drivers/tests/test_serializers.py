from django.contrib.auth import get_user_model
from django.test import TestCase

from drivers.models import DriverProfile
from drivers.serializers import DriverListSerializer
from location.models import District, Panchayath, Taluk

User = get_user_model()


class DriverSerializerTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="driver@test.com", password="pass123", name="Driver Test"
        )

        district = District.objects.create(name="Malappuram")
        taluk = Taluk.objects.create(name="Tirur", district=district)
        panchayath = Panchayath.objects.create(name="Test Panchayath", taluk=taluk)

        self.driver = DriverProfile.objects.create(
            user=self.user,
            phone_number="8888888888",
            experience_years=4,
            service_type="driver_only",
            panchayath=panchayath,
        )

    def test_driver_list_serializer(self):
        serializer = DriverListSerializer(self.driver)

        data = serializer.data

        self.assertEqual(data["name"], "Driver Test")
        self.assertEqual(data["experience_years"], 4)
