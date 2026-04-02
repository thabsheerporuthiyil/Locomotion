from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

User = get_user_model()


class RegisterViewTest(APITestCase):

    @patch("accounts.views.send_otp_email.delay")
    def test_register_user(self, mock_send_otp):
        url = reverse("register")
        data = {
            "email": "new@example.com",
            "name": "New User",
            "password": "test12345",
            "confirm_password": "test12345",
        }

        response = self.client.post(url, data)

        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(email="new@example.com").exists())
        mock_send_otp.assert_called_once()

    @patch("accounts.views.send_otp_email.delay")
    def test_register_reuses_unverified_user_and_resends_otp(self, mock_send_otp):
        user = User.objects.create_user(
            email="pending@example.com",
            name="Pending User",
            password="oldpassword123",
        )
        user.is_verified = False
        user.save(update_fields=["is_verified"])

        url = reverse("register")
        data = {
            "email": "pending@example.com",
            "name": "Updated User",
            "password": "newpassword123",
            "confirm_password": "newpassword123",
        }

        response = self.client.post(url, data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(email="pending@example.com").count(), 1)
        user.refresh_from_db()
        self.assertEqual(user.name, "Updated User")
        self.assertTrue(user.check_password("newpassword123"))
        mock_send_otp.assert_called_once()

    @patch("accounts.views.send_otp_email.delay")
    def test_register_rejects_verified_existing_user(self, mock_send_otp):
        user = User.objects.create_user(
            email="verified@example.com",
            name="Verified User",
            password="password123",
        )
        user.is_verified = True
        user.save(update_fields=["is_verified"])

        url = reverse("register")
        data = {
            "email": "verified@example.com",
            "name": "Verified User",
            "password": "password123",
            "confirm_password": "password123",
        }

        response = self.client.post(url, data)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "User already exists")
        mock_send_otp.assert_not_called()


class LoginTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="login@example.com", name="Login User", password="test123"
        )
        self.user.is_verified = True
        self.user.save()

    def test_login_success(self):
        url = reverse("login")
        data = {"email": "login@example.com", "password": "test123"}

        response = self.client.post(url, data)

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
