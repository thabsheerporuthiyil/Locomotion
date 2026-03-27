from rest_framework import serializers

from Locomotion.media_utils import build_media_url, validate_image_upload
from .models import Notification, User


class RegisterSerializer(serializers.ModelSerializer):
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["email", "name", "password", "confirm_password"]
        extra_kwargs = {"password": {"write_only": True}}

    def validate(self, data):
        if data["password"] != data["confirm_password"]:
            raise serializers.ValidationError("Passwords do not match")
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        user = User.objects.create_user(**validated_data)
        return user


class VerifyOTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField()


class SendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ForgotPasswordSendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField()
    new_password = serializers.CharField(min_length=8)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "body", "data", "is_read", "created_at", "read_at"]


class UserMeSerializer(serializers.ModelSerializer):
    profile_image_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "email",
            "name",
            "phone_number",
            "role",
            "is_2fa_enabled",
            "profile_image_url",
        ]

    def get_profile_image_url(self, obj):
        return build_media_url(obj.profile_image, request=self.context.get("request"))


class ProfileUpdateSerializer(serializers.ModelSerializer):
    profile_image_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = [
            "email",
            "name",
            "phone_number",
            "profile_image",
            "profile_image_url",
        ]
        read_only_fields = ["email", "profile_image_url"]

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        if len(value) > 50:
            raise serializers.ValidationError("Name must be 50 characters or fewer.")
        return value

    def validate_phone_number(self, value):
        if value in (None, ""):
            return None
        value = str(value).strip()
        if len(value) > 15:
            raise serializers.ValidationError("Phone number must be 15 digits or fewer.")
        return value

    def validate_profile_image(self, value):
        try:
            return validate_image_upload(value, label="Profile image", max_size_mb=5)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def get_profile_image_url(self, obj):
        return UserMeSerializer(context=self.context).get_profile_image_url(obj)
