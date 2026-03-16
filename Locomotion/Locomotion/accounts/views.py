import random
import pyotp
import qrcode
import base64
from io import BytesIO
from rest_framework.views import APIView
from .models import EmailOTP
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import RegisterSerializer,SendOTPSerializer,ForgotPasswordSendOTPSerializer,ResetPasswordSerializer,VerifyOTPRequestSerializer
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
                httponly=True,
                secure=True,
                samesite="Lax",
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

        refresh = RefreshToken.for_user(user)

        response = Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "role": "admin" if user.is_staff else "customer",
            "name": user.name,
        })

        response.set_cookie(
            key="refresh",
            value=str(refresh),
            httponly=True,
            secure=False,
            samesite="Lax",
        )

        return response


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
        response.delete_cookie("refresh")
        return response


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
            # Verify token with Google
            idinfo = id_token.verify_oauth2_token(
                token,
                requests.Request(),
                settings.GOOGLE_CLIENT_ID
            )

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

        # Generate JWT
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
            httponly=True,
            secure=False,
            samesite="Lax",
        )

        return response
    
class Setup2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        if user.is_2fa_enabled:
            return Response({"error": "2FA already enabled"}, status=400)

        secret = pyotp.random_base32()
        user.twofa_secret = secret
        user.save()

        totp = pyotp.TOTP(secret)

        otp_url = totp.provisioning_uri(
            name=user.email,
            issuer_name="YourApp"
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
        code = request.data.get("code")
        user = request.user

        totp = pyotp.TOTP(user.twofa_secret)

        if not totp.verify(code):
            return Response({"error": "Invalid code"}, status=400)

        user.is_2fa_enabled = True
        user.save()

        return Response({"message": "2FA enabled successfully"})


class Verify2FALoginView(APIView):
    def post(self, request):
        user_id = request.data.get("user_id")
        code = request.data.get("code")

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "Invalid user"}, status=400)

        totp = pyotp.TOTP(user.twofa_secret)

        if not totp.verify(code):
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
            httponly=True,
            secure=False,
            samesite="Lax",
        )

        return response


class Disable2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        user.is_2fa_enabled = False
        user.two_factor_secret = None
        user.save()

        return Response(
            {"message": "2FA disabled successfully"},
            status=status.HTTP_200_OK
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        driver_application = None

        if hasattr(user, "driver_application"):
            application = user.driver_application
            driver_application = DriverApplicationSerializer(
                application,
                context={"request": request}
            ).data

        return Response({
            "email": user.email,
            "name": user.name,
            "phone_number": user.phone_number,
            "role": user.role,
            "is_driver": hasattr(user, "driver_profile"),
            "has_applied": hasattr(user, "driver_application"),
            "is_2fa_enabled": user.is_2fa_enabled,
            "driver_application": driver_application,
        })


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
        user.fcm_device_token = fcm_token
        user.save()
        
        return Response({'message': 'FCM Token updated successfully'}, status=status.HTTP_200_OK)
