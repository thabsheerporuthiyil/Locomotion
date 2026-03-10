from django.urls import path

from .admin_views import (AdminDriverApplicationActionView,
                          AdminDriverApplicationListView,
                          AdminVehicleActionView, AdminVehicleListView)
from .views import (ApplyDriverView, DriverAvailabilityView, DriverDetailView,
                    DriverListView, DriverVehicleDataView)

urlpatterns = [
    path("apply/", ApplyDriverView.as_view()),
    path("admin/applications/", AdminDriverApplicationListView.as_view()),
    path(
        "admin/applications/<int:pk>/action/",
        AdminDriverApplicationActionView.as_view(),
    ),
    path("admin/vehicles/", AdminVehicleListView.as_view()),
    path("admin/vehicles/<int:pk>/action/", AdminVehicleActionView.as_view()),
    path("", DriverListView.as_view(), name="driver-list"),
    path("<int:id>/", DriverDetailView.as_view(), name="driver-detail"),
    path("vehicles/", DriverVehicleDataView.as_view()),
    path("availability/", DriverAvailabilityView.as_view(), name="driver-availability"),
]
