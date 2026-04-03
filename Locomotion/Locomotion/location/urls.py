from django.urls import path

from .admin_views import (AdminRideHistoryListView,
                          AdminRideLocationHistoryView)
from .views import (DistrictListView, PanchayathListView,
                    RideLatestLocationView, RideLocationUpdateView,
                    TalukListView)

urlpatterns = [
    path("districts/", DistrictListView.as_view(), name="district-list"),
    path("taluks/", TalukListView.as_view(), name="taluk-list"),
    path("panchayaths/", PanchayathListView.as_view(), name="panchayath-list"),
    path("rides/<int:ride_id>/latest/", RideLatestLocationView.as_view(), name="ride-latest-location"),
    path("rides/<int:ride_id>/update/", RideLocationUpdateView.as_view(), name="ride-location-update"),
    path("admin/rides/", AdminRideHistoryListView.as_view(), name="admin-ride-history-list"),
    path("admin/rides/<int:ride_id>/history/", AdminRideLocationHistoryView.as_view(), name="admin-ride-location-history"),
]
