from django.urls import path

from .views import (CalculateFareView, ChatHistoryView, CreateRideRequestView,
                    DriverRideRequestListView, RateRideView,
                    RideRequestActionView, RideRequestDetailView,
                    RiderRideRequestListView, SendMessageView)

urlpatterns = [
    path("request/", CreateRideRequestView.as_view(), name="create-ride-request"),
    path(
        "driver-requests/", DriverRideRequestListView.as_view(), name="driver-requests"
    ),
    path("my-requests/", RiderRideRequestListView.as_view(), name="rider-requests"),
    path("<int:pk>/", RideRequestDetailView.as_view(), name="ride-request-detail"),
    path("<int:pk>/rate/", RateRideView.as_view(), name="rate-ride"),
    path("<int:pk>/chat/", ChatHistoryView.as_view(), name="chat-history"),
    path("<int:pk>/chat/send/", SendMessageView.as_view(), name="send-message"),
    path(
        "<int:pk>/<str:action>/",
        RideRequestActionView.as_view(),
        name="ride-request-action",
    ),
    path("calculate-fare/", CalculateFareView.as_view(), name="calculate-fare"),
]
