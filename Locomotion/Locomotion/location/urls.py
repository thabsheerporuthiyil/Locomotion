from django.urls import path

from .views import DistrictListView, PanchayathListView, TalukListView

urlpatterns = [
    path("districts/", DistrictListView.as_view(), name="district-list"),
    path("taluks/", TalukListView.as_view(), name="taluk-list"),
    path("panchayaths/", PanchayathListView.as_view(), name="panchayath-list"),
]
