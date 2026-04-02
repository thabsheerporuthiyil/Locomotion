from django.test import TestCase

from accounts.serializers import RegisterSerializer


class RegisterSerializerTest(TestCase):

    def test_password_mismatch(self):
        data = {
            "email": "test@example.com",
            "name": "Test",
            "password": "12345678",
            "confirm_password": "87654321",
        }
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())

    def test_valid_registration(self):
        data = {
            "email": "test@example.com",
            "name": "Test",
            "password": "12345678",
            "confirm_password": "12345678",
        }
        serializer = RegisterSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_password_validation_runs(self):
        data = {
            "email": "test@example.com",
            "name": "Test",
            "password": "123",
            "confirm_password": "123",
        }
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("password", serializer.errors)
