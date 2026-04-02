from django.contrib.auth import get_user_model
from django.utils import timezone
from django.urls import reverse
from rest_framework.test import APITestCase
from datetime import timedelta

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
        self.user.refresh_from_db()
        self.otp.refresh_from_db()
        self.assertTrue(self.user.is_verified)
        self.assertTrue(self.otp.is_used)

    def test_verify_otp_rejects_invalid_format(self):
        url = reverse("verify-otp")

        response = self.client.post(
            url,
            {"email": self.user.email, "otp": "12ab"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("otp", response.data)

    def test_verify_otp_returns_404_for_unknown_user(self):
        url = reverse("verify-otp")

        response = self.client.post(
            url,
            {"email": "missing@example.com", "otp": "123456"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error"], "User not found")

    def test_verify_otp_rejects_expired_code(self):
        url = reverse("verify-otp")
        EmailOTP.objects.filter(pk=self.otp.pk).update(
            created_at=timezone.now() - timedelta(minutes=3)
        )

        response = self.client.post(
            url,
            {"email": self.user.email, "otp": "123456"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "OTP expired")
        self.otp.refresh_from_db()
        self.assertTrue(self.otp.is_used)
