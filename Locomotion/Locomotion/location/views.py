from django.core.cache import cache
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bookings.models import RideRequest
from .models import District, Panchayath, Taluk
from .serializers import (DistrictSerializer, PanchayathSerializer,
                          TalukSerializer)


LOCATION_CACHE_TTL_SECONDS = 60 * 60


def _cache_key(ride_id, role):
    return f"ride_location:{ride_id}:{role}"


class DistrictListView(ListAPIView):
    queryset = District.objects.all()
    serializer_class = DistrictSerializer


class TalukListView(ListAPIView):
    serializer_class = TalukSerializer

    def get_queryset(self):
        district = self.request.query_params.get("district")
        return Taluk.objects.filter(district_id=district)


class PanchayathListView(ListAPIView):
    serializer_class = PanchayathSerializer

    def get_queryset(self):
        taluk = self.request.query_params.get("taluk")
        return Panchayath.objects.filter(taluk_id=taluk)


class RideLatestLocationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, ride_id):
        ride = get_object_or_404(
            RideRequest.objects.select_related("driver__user", "rider"),
            pk=ride_id,
        )

        is_rider = request.user == ride.rider
        is_driver = (
            hasattr(request.user, "driver_profile")
            and ride.driver_id == request.user.driver_profile.id
        )

        if not (is_rider or is_driver):
            return Response(
                {"detail": "You do not have permission to access this ride location."},
                status=status.HTTP_403_FORBIDDEN,
            )

        driver_location = cache.get(_cache_key(ride_id, "driver"))
        rider_location = cache.get(_cache_key(ride_id, "rider"))

        return Response(
            {
                "ride_id": ride_id,
                "driver_location": driver_location,
                "rider_location": rider_location,
                "cache_ttl_seconds": LOCATION_CACHE_TTL_SECONDS,
            }
        )
