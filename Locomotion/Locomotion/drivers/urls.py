from django.urls import path

from .admin_views import (AdminDriverApplicationActionView,
                          AdminDriverApplicationListView,
                          AdminDashboardView, AdminStatsView,
                          AdminVehicleActionView, AdminVehicleListView)
from .views import (ApplyDriverView, DriverAvailabilityView,
                    DriverCoachApplyView, DriverCoachPlanView,
                    DriverCoachPreviewView, DriverCoachRemindersView,
                    DriverDetailView, DriverListView, DriverVehicleDataView)

urlpatterns = [
    path("apply/", ApplyDriverView.as_view()),
    path("admin/stats/", AdminStatsView.as_view()),
    path("admin/dashboard/", AdminDashboardView.as_view()),
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
    path(
        "coach/preview/", DriverCoachPreviewView.as_view(), name="driver-coach-preview"
    ),
    path("coach/plan/", DriverCoachPlanView.as_view(), name="driver-coach-plan"),
    path("coach/apply/", DriverCoachApplyView.as_view(), name="driver-coach-apply"),
    path(
        "coach/reminders/",
        DriverCoachRemindersView.as_view(),
        name="driver-coach-reminders",
    ),
]
