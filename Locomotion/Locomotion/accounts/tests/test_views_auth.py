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
