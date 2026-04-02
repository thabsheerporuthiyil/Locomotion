import random
import pyotp
import qrcode
import base64
from io import BytesIO
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView
from .models import EmailOTP, FCMDevice, Notification
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import (
    ForgotPasswordSendOTPSerializer,
    NotificationSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    SendOTPSerializer,
    UserMeSerializer,
    VerifyOTPRequestSerializer,
)
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated, AllowAny
from .tasks import send_otp_email
from google.oauth2 import id_token
from google.auth.transport import requests
from django.conf import settings
from drivers.models import DriverApplication
from drivers.serializers import DriverApplicationSerializer

User = get_user_model()

OTP_EXPIRY_MINUTES = 2

def generate_otp():
    return str(random.randint(100000, 999999))


def _refresh_cookie_kwargs():
    kwargs = {
        "httponly": True,
        "secure": settings.SESSION_COOKIE_SECURE,
        "samesite": settings.SESSION_COOKIE_SAMESITE,
        "path": "/",
    }
    cookie_domain = getattr(settings, "SESSION_COOKIE_DOMAIN", None)
    if cookie_domain:
        kwargs["domain"] = cookie_domain
    return kwargs


def _clear_refresh_cookie(response):
    response.delete_cookie("refresh", **_refresh_cookie_kwargs())
    return response


def _issue_auth_response(user, role=None, extra_payload=None):
    refresh = RefreshToken.for_user(user)
    payload = {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "role": role or user.role,
        "name": user.name,
    }
    if extra_payload:
        payload.update(extra_payload)

    response = Response(payload)
    response.set_cookie(
        key="refresh",
        value=str(refresh),
        **_refresh_cookie_kwargs(),
    )
    return response


def _verify_google_identity_token(token):
    allowed_client_ids = getattr(settings, "GOOGLE_ALLOWED_CLIENT_IDS", None) or None
    return id_token.verify_oauth2_token(
        token,
        requests.Request(),
        allowed_client_ids,
    )


def _get_driver_access_error(user):
    if not user.is_active:
        return "Account blocked"

    driver_profile = getattr(user, "driver_profile", None)
    if not driver_profile:
        return "Only approved drivers can sign in to the driver app."

    if not driver_profile.is_active:
        return "Driver account is inactive. Contact support."

    return None


class RegisterView(APIView):
    @swagger_auto_schema(
        request_body=RegisterSerializer,
        responses={201: RegisterSerializer},
        operation_description="Register a new user and send verification OTP"
    )
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]

        if User.objects.filter(email=email).exists():
            return Response(
                {"error": "User already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = serializer.save()
        user.is_verified = False
        user.save()

        # Invalidate old OTPs
        EmailOTP.objects.filter(email=email, is_used=False).update(is_used=True)

        otp = generate_otp()
        EmailOTP.objects.create(email=email, otp=otp)

        send_otp_email.delay(email, otp)

        return Response(
            {"message": "Registration successful. OTP sent to email."},
            status=status.HTTP_201_CREATED,
        )


class SendOTPView(APIView):
    @swagger_auto_schema(
        operation_summary="Send or resend OTP to email",
        request_body=SendOTPSerializer,
        responses={
            200: openapi.Response("OTP sent", schema=openapi.Schema(type=openapi.TYPE_OBJECT, properties={'message': openapi.Schema(type=openapi.TYPE_STRING)})),
            400: "Email already verified",
            404: "User not found",
        },
    )
    def post(self, request):
        email = request.data.get("email")

        user = User.objects.filter(email=email).first()
        if not user:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if user.is_verified:
            return Response(
                {"error": "Email already verified"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Invalidate previous OTPs
        EmailOTP.objects.filter(email=email, is_used=False).update(is_used=True)

        otp = generate_otp()
        EmailOTP.objects.create(email=email, otp=otp)

        send_otp_email.delay(email, otp)

        return Response({"message": "OTP sent"})



class VerifyOTPView(APIView):
    @swagger_auto_schema(
        operation_summary="Verify Email/Admin OTP",
        request_body=VerifyOTPRequestSerializer,
        responses={
            200: openapi.Response("Success", schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'message': openapi.Schema(type=openapi.TYPE_STRING),
                    'name': openapi.Schema(type=openapi.TYPE_STRING),
                    'access': openapi.Schema(type=openapi.TYPE_STRING),
                }
            )),
            400: "Invalid OTP"
        }
    )
    def post(self, request):
        email = request.data.get("email")
        otp = request.data.get("otp")

        user = User.objects.filter(email=email).first()
        record = EmailOTP.objects.filter(
            email=email, otp=otp, is_used=False
        ).last()

        if not record:
            return Response({"error": "Invalid OTP"}, status=400)

        record.is_used = True
        record.save()

        # ADMIN OTP
        if user.is_staff or user.is_superuser:
            user.is_admin_otp_verified = True
            user.save()

            refresh = RefreshToken.for_user(user)
            response = Response({
                "access": str(refresh.access_token),
                "role": "admin",
                "name": user.name,
            })

            response.set_cookie(
                key="refresh",
                value=str(refresh),
                **_refresh_cookie_kwargs(),
            )
            return response

        # USER EMAIL VERIFICATION
        user.is_verified = True
        user.save()
        return Response({"message": "Email verified","name": user.name})


class CustomTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        email = request.data.get("email")
        password = request.data.get("password")

        user = User.objects.filter(email=email).first()

        if not user or not user.check_password(password):
            return Response({"error": "Invalid credentials"}, status=401)

        # If credentials are correct but the account is blocked, show a clear message.
        # (Checked after password verification to avoid leaking account existence.)
        if not user.is_active:
            return Response({"error": "Account blocked"}, status=403)

        if not user.is_staff and not user.is_superuser:
            if not user.is_verified:
                return Response({"error": "Email not verified"}, status=403)

        if user.is_staff or user.is_superuser:

            if not user.is_admin_otp_verified:
                EmailOTP.objects.filter(email=email, is_used=False).update(is_used=True)

                otp = generate_otp()
                EmailOTP.objects.create(email=email, otp=otp)

                send_otp_email.delay(email, otp)

                return Response(
                    {"otp_required": True, "type": "email_otp"},
                    status=200
                )

        if user.is_2fa_enabled:
            return Response(
                {
                    "otp_required": True,
                    "type": "totp",
                    "user_id": user.id
                },
                status=200
            )

        return _issue_auth_response(
            user,
            role="admin" if user.is_staff else "customer",
        )


class DriverMobileLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        password = request.data.get("password")

        user = User.objects.filter(email=email).first()

        if not user or not user.check_password(password):
            return Response({"error": "Invalid credentials"}, status=401)

        driver_error = _get_driver_access_error(user)
        if driver_error:
            return Response({"error": driver_error}, status=403)

        if not user.is_verified:
            return Response({"error": "Email not verified"}, status=403)

        if user.is_2fa_enabled:
            return Response(
                {
                    "otp_required": True,
                    "type": "totp",
                    "user_id": user.id,
                },
                status=200,
            )

        return _issue_auth_response(
            user,
            role="driver",
            extra_payload={"is_driver": True},
        )


class CookieTokenRefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh = request.COOKIES.get("refresh") or request.data.get("refresh")
        if not refresh:
            return Response({"error": "No refresh token"}, status=401)

        try:
            token = RefreshToken(refresh)
            user_id = token['user_id']
            user = User.objects.get(id=user_id)

            if not user.is_active:
                return Response({"error": "Account blocked"}, status=403)
            
            role = "admin" if (user.is_staff or user.is_superuser) else "customer"
            
            return Response({
                "access": str(token.access_token),
                "refresh": str(token),
                "role": role,
                "name": user.name,
            })
        except Exception:
            return Response({"error": "Invalid token"}, status=401)


class LogoutView(APIView):
    def post(self, request):
        response = Response({"message": "Logged out"})
        return _clear_refresh_cookie(response)


class ForgotPasswordSendOTPView(APIView):
    @swagger_auto_schema(
        operation_summary="Send OTP for forgot password",
        request_body=ForgotPasswordSendOTPSerializer,
        responses={
            200: openapi.Response("OTP sent"),
            404: "User not found",
        },
    )
    def post(self, request):
        serializer = ForgotPasswordSendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        user = User.objects.filter(email=email).first()

        if not user:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # invalidate old OTPs
        EmailOTP.objects.filter(email=email, is_used=False).update(is_used=True)

        otp = generate_otp()
        EmailOTP.objects.create(email=email, otp=otp)

        send_otp_email.delay(email, otp)

        return Response({"message": "OTP sent"}, status=status.HTTP_200_OK)


class ResetPasswordView(APIView):
    @swagger_auto_schema(
        operation_summary="Reset password using OTP",
        request_body=ResetPasswordSerializer,
        responses={
            200: "Password reset successful",
            400: "Invalid or expired OTP",
        },
    )
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        otp = serializer.validated_data["otp"]
        new_password = serializer.validated_data["new_password"]

        user = User.objects.filter(email=email).first()
        if not user:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        record = EmailOTP.objects.filter(
            email=email,
            otp=otp,
            is_used=False,
        ).last()

        if not record:
            return Response(
                {"error": "Invalid OTP"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # expiry check
        if timezone.now() > record.created_at + timedelta(minutes=OTP_EXPIRY_MINUTES):
            record.is_used = True
            record.save()
            return Response(
                {"error": "OTP expired"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # reset password
        user.set_password(new_password)
        user.save()

        record.is_used = True
        record.save()

        return Response(
            {"message": "Password reset successful"},
            status=status.HTTP_200_OK,
        )
    

class GoogleLoginView(APIView):
    def post(self, request):
        token = request.data.get("token")

        if not token:
            return Response({"error": "No token provided"}, status=400)

        try:
            idinfo = _verify_google_identity_token(token)

            email = idinfo.get("email")
            name = idinfo.get("name")

            if not email:
                return Response({"error": "Email not available"}, status=400)

        except ValueError:
            return Response({"error": "Invalid Google token"}, status=400)

        # Create or get user
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "name": name,
                "role": "customer",
                "is_verified": True,
            }
        )

        # If user exists but not verified → mark verified
        if not created and not user.is_verified:
            user.is_verified = True
            user.save()

        # Check for 2FA
        if user.is_2fa_enabled:
            return Response(
                {
                    "otp_required": True,
                    "type": "totp",
                    "user_id": user.id
                },
                status=200
            )

        return _issue_auth_response(user, role=user.role)


class DriverMobileGoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("token")

        if not token:
            return Response({"error": "No token provided"}, status=400)

        try:
            idinfo = _verify_google_identity_token(token)
            email = idinfo.get("email")

            if not email:
                return Response({"error": "Email not available"}, status=400)
        except ValueError:
            return Response({"error": "Invalid Google token"}, status=400)

        user = User.objects.filter(email=email).first()
        if not user:
            return Response(
                {"error": "Only approved drivers can sign in to the driver app."},
                status=403,
            )

        driver_error = _get_driver_access_error(user)
        if driver_error:
            return Response({"error": driver_error}, status=403)

        if not user.is_verified:
            user.is_verified = True
            user.save(update_fields=["is_verified"])

        if user.is_2fa_enabled:
            return Response(
                {
                    "otp_required": True,
                    "type": "totp",
                    "user_id": user.id,
                },
                status=200,
            )

        return _issue_auth_response(
            user,
            role="driver",
            extra_payload={"is_driver": True},
        )
    
class Setup2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        if user.is_2fa_enabled:
            return Response({"error": "2FA already enabled"}, status=400)

        # Reuse secret if setup was already started but not yet confirmed.
        secret = user.twofa_secret or pyotp.random_base32()
        if user.twofa_secret != secret:
            user.twofa_secret = secret
            user.save(update_fields=["twofa_secret"])

        totp = pyotp.TOTP(secret)

        otp_url = totp.provisioning_uri(
            name=user.email,
            issuer_name="Locomotion"
        )

        qr = qrcode.make(otp_url)
        buffer = BytesIO()
        qr.save(buffer, format="PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()

        return Response({
            "qr_code": f"data:image/png;base64,{qr_base64}"
        })


class Confirm2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        if not user.twofa_secret:
            return Response(
                {"error": "2FA setup not started. Please generate a new QR code."},
                status=400,
            )

        code = str(request.data.get("code") or "").strip().replace(" ", "")
        if not code.isdigit() or len(code) != 6:
            return Response({"error": "Invalid code format"}, status=400)

        totp = pyotp.TOTP(user.twofa_secret)

        # Allow small clock drift window (more real-world friendly)
        if not totp.verify(code, valid_window=1):
            return Response({"error": "Invalid code"}, status=400)

        user.is_2fa_enabled = True
        user.save(update_fields=["is_2fa_enabled"])

        return Response({"message": "2FA enabled successfully"})


class Verify2FALoginView(APIView):
    def post(self, request):
        user_id = request.data.get("user_id")
        code = str(request.data.get("code") or "").strip().replace(" ", "")

        if not code.isdigit() or len(code) != 6:
            return Response({"error": "Invalid code format"}, status=400)

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "Invalid user"}, status=400)

        if not user.is_active:
            return Response({"error": "Account blocked"}, status=403)

        if not user.twofa_secret:
            return Response({"error": "2FA not configured for this user"}, status=400)

        totp = pyotp.TOTP(user.twofa_secret)

        if not totp.verify(code, valid_window=1):
            return Response({"error": "Invalid code"}, status=400)

        refresh = RefreshToken.for_user(user)

        response = Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "role": user.role,
            "name": user.name,
        })

        response.set_cookie(
            key="refresh",
            value=str(refresh),
            **_refresh_cookie_kwargs(),
        )

        return response


class Disable2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        user.is_2fa_enabled = False
        user.twofa_secret = None
        user.save(update_fields=["is_2fa_enabled", "twofa_secret"])

        return Response(
            {"message": "2FA disabled successfully"},
            status=status.HTTP_200_OK
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _serialize_user(self, request, user):
        driver_application = None

        if hasattr(user, "driver_application"):
            application = user.driver_application
            driver_application = DriverApplicationSerializer(
                application,
                context={"request": request}
            ).data

        base = UserMeSerializer(user, context={"request": request}).data
        base.update(
            {
                "is_driver": hasattr(user, "driver_profile"),
                "has_applied": hasattr(user, "driver_application"),
                "driver_application": driver_application,
            }
        )
        return base

    def get(self, request):
        user = request.user
        response = Response(self._serialize_user(request, user), status=status.HTTP_200_OK)
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response["Pragma"] = "no-cache"
        return response

    @swagger_auto_schema(
        operation_summary="Update current user profile",
        request_body=ProfileUpdateSerializer,
        responses={
            200: openapi.Response("Profile updated", ProfileUpdateSerializer),
            400: "Invalid profile data",
        },
    )
    def patch(self, request):
        user = request.user
        old_profile_image_name = user.profile_image.name if user.profile_image else None

        serializer = ProfileUpdateSerializer(
            user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        user.refresh_from_db()

        new_profile_image_name = user.profile_image.name if user.profile_image else None
        if (
            old_profile_image_name
            and new_profile_image_name
            and old_profile_image_name != new_profile_image_name
        ):
            user.profile_image.storage.delete(old_profile_image_name)

        response = Response(
            self._serialize_user(request, user),
            status=status.HTTP_200_OK,
        )
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response["Pragma"] = "no-cache"
        return response


class UpdateFCMTokenView(APIView):
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_summary="Update FCM Device Token",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'fcm_token': openapi.Schema(type=openapi.TYPE_STRING, description="Firebase Cloud Messaging Device Token"),
            },
            required=['fcm_token']
        ),
        responses={200: "Token updated successfully", 400: "Token is required"}
    )
    def post(self, request):
        fcm_token = request.data.get('fcm_token')
        
        if not fcm_token:
            return Response({'error': 'fcm_token is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        user = request.user

        # Keep the legacy single-token field for compatibility with existing code paths.
        user.fcm_device_token = fcm_token
        user.save(update_fields=["fcm_device_token"])

        platform = (request.data.get("platform") or "web").lower()
        if platform not in {"web", "android", "ios", "unknown"}:
            platform = "unknown"

        user_agent = request.META.get("HTTP_USER_AGENT")

        # Real-world: allow multiple devices per user and mark the token active.
        FCMDevice.objects.update_or_create(
            token=fcm_token,
            defaults={
                "user": user,
                "platform": platform,
                "user_agent": user_agent,
                "is_active": True,
            },
        )
        
        return Response({'message': 'FCM Token updated successfully'}, status=status.HTTP_200_OK)


class NotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(user=request.user).order_by("-created_at")[:50]
        return Response(NotificationSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        notification_id = request.data.get("id")
        now = timezone.now()

        if notification_id:
            updated = (
                Notification.objects.filter(user=request.user, id=notification_id, is_read=False)
                .update(is_read=True, read_at=now)
            )
            return Response({"updated": updated}, status=status.HTTP_200_OK)

        # No id => mark all as read
        updated = (
            Notification.objects.filter(user=request.user, is_read=False)
            .update(is_read=True, read_at=now)
        )
        return Response({"updated": updated}, status=status.HTTP_200_OK)

    def delete(self, request):
        deleted, _ = Notification.objects.filter(user=request.user).delete()
        return Response({"deleted": deleted}, status=status.HTTP_200_OK)
