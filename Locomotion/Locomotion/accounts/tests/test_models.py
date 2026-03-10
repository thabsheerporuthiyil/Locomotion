from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.models import EmailOTP

User = get_user_model()


class UserModelTest(TestCase):

    def test_create_user(self):
        user = User.objects.create_user(
            email="test@example.com", name="Test User", password="test1234"
        )
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password("test1234"))
        self.assertFalse(user.is_staff)

    def test_create_superuser(self):
        admin = User.objects.create_superuser(
            email="admin@example.com", name="Admin", password="admin123"
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)


class EmailOTPModelTest(TestCase):

    def test_create_otp(self):
        otp = EmailOTP.objects.create(email="otp@example.com", otp="123456")
        self.assertEqual(otp.otp, "123456")
        self.assertFalse(otp.is_used)
