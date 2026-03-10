from django.urls import path

from .admin_views import AdminVehicleCategoryAPIView
from .views import (VehicleBrandListAPIView, VehicleCategoryListAPIView,
                    VehicleModelListAPIView)

urlpatterns = [
    # Public APIs
    path("categories/", VehicleCategoryListAPIView.as_view()),
    path("brands/", VehicleBrandListAPIView.as_view()),
    path("models/", VehicleModelListAPIView.as_view()),
    # Admin APIs
    path("admin/categories/", AdminVehicleCategoryAPIView.as_view()),
    path("admin/categories/<int:pk>/", AdminVehicleCategoryAPIView.as_view()),
]
