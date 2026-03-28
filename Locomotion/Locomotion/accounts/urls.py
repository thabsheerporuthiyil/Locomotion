from django.urls import path

from .views import (Confirm2FAView, CookieTokenRefreshView,
                    CustomTokenObtainPairView, Disable2FAView,
                    DriverMobileGoogleLoginView, DriverMobileLoginView,
                    ForgotPasswordSendOTPView, GoogleLoginView, LogoutView,
                    MeView, RegisterView, ResetPasswordView, SendOTPView,
                    NotificationsView,
                    Setup2FAView, UpdateFCMTokenView, Verify2FALoginView,
                    VerifyOTPView)
from .admin_views import AdminUserBlockView, AdminUserListView

urlpatterns = [
    # Registration & OTP
    path("register/", RegisterView.as_view(), name="register"),
    path("send-otp/", SendOTPView.as_view(), name="send-otp"),
    path("verify-otp/", VerifyOTPView.as_view(), name="verify-otp"),
    # JWT Authentication
    path("login/", CustomTokenObtainPairView.as_view(), name="login"),
    path("logout/", LogoutView.as_view()),
    path("token/refresh/", CookieTokenRefreshView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
    # forget-password
    path(
        "forgot-password/", ForgotPasswordSendOTPView.as_view(), name="forgot-password"
    ),
    path("reset-password/", ResetPasswordView.as_view(), name="reset-password"),
    path("auth/google/", GoogleLoginView.as_view(), name="google-login"),
    path("mobile/driver/login/", DriverMobileLoginView.as_view(), name="mobile-driver-login"),
    path(
        "mobile/driver/auth/google/",
        DriverMobileGoogleLoginView.as_view(),
        name="mobile-driver-google-login",
    ),
    path("2fa/setup/", Setup2FAView.as_view(), name="2fa-setup"),
    path("2fa/confirm/", Confirm2FAView.as_view(), name="2fa-confirm"),
    path("2fa/verify-login/", Verify2FALoginView.as_view(), name="2fa-verify-login"),
    path("2fa/disable/", Disable2FAView.as_view(), name="disable-2fa"),
    path("update-fcm-token/", UpdateFCMTokenView.as_view(), name="update-fcm-token"),
    path("notifications/", NotificationsView.as_view(), name="notifications"),
    # Admin
    path("admin/users/", AdminUserListView.as_view(), name="admin-users"),
    path("admin/users/<int:pk>/block/", AdminUserBlockView.as_view(), name="admin-user-block"),
]
