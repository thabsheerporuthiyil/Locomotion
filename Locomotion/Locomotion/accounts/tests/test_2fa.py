import pyotp
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

User = get_user_model()


class TwoFATest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="2fa@example.com", name="2FA User", password="test123"
        )
        self.user.is_verified = True
        self.user.save()

        # Authenticate user
        self.client.force_authenticate(user=self.user)

    def test_setup_2fa(self):
        url = reverse("2fa-setup")

        response = self.client.post(url)

        self.assertEqual(response.status_code, 200)
        self.assertIn("qr_code", response.data)

        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.twofa_secret)

    def test_confirm_2fa_success(self):
        secret = pyotp.random_base32()
        self.user.twofa_secret = secret
        self.user.save()

        totp = pyotp.TOTP(secret)
        code = totp.now()

        url = reverse("2fa-confirm")
        response = self.client.post(url, {"code": code})

        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_2fa_enabled)

    def test_confirm_2fa_invalid_code(self):
        self.user.twofa_secret = pyotp.random_base32()
        self.user.save()

        url = reverse("2fa-confirm")
        response = self.client.post(url, {"code": "000000"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Invalid code")

    def test_verify_2fa_login_failure(self):
        secret = pyotp.random_base32()
        self.user.twofa_secret = secret
        self.user.is_2fa_enabled = True
        self.user.save()

        url = reverse("2fa-verify-login")
        response = self.client.post(url, {"user_id": self.user.id, "code": "000000"})

        self.assertEqual(response.status_code, 400)

    def test_disable_2fa(self):
        self.user.is_2fa_enabled = True
        self.user.twofa_secret = pyotp.random_base32()
        self.user.save()

        url = reverse("disable-2fa")
        response = self.client.post(url)

        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_2fa_enabled)
