from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import EmailOTP

User = get_user_model()


class OTPVerificationTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="otp@example.com", name="OTP User", password="test123"
        )
        self.otp = EmailOTP.objects.create(email=self.user.email, otp="123456")

    def test_verify_otp(self):
        url = reverse("verify-otp")
        data = {"email": self.user.email, "otp": "123456"}

        response = self.client.post(url, data)

        self.assertEqual(response.status_code, 200)
