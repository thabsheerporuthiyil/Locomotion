from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.cache import cache
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bookings.models import RideRequest
from .location_history import enqueue_location_history_event, query_location_history
from .models import District, Panchayath, Taluk
from .serializers import (DistrictSerializer, PanchayathSerializer,
                          TalukSerializer)


LOCATION_CACHE_TTL_SECONDS = 60 * 60


def _cache_key(ride_id, role):
    return f"ride_location:{ride_id}:{role}"


def _can_access_ride(user, ride):
    is_rider = user == ride.rider
    is_driver = (
        hasattr(user, "driver_profile")
        and ride.driver_id == user.driver_profile.id
    )
    return is_rider, is_driver


def _store_location(ride_id, role, latitude, longitude, heading=0):
    payload = {
        "latitude": latitude,
        "longitude": longitude,
        "heading": heading,
        "role": role,
    }
    cache.set(
        _cache_key(ride_id, role),
        payload,
        timeout=LOCATION_CACHE_TTL_SECONDS,
    )
    return payload


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

        is_rider, is_driver = _can_access_ride(request.user, ride)

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


class RideLocationUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, ride_id):
        ride = get_object_or_404(
            RideRequest.objects.select_related("driver__user", "rider"),
            pk=ride_id,
        )

        is_rider, is_driver = _can_access_ride(request.user, ride)
        if not (is_rider or is_driver):
            return Response(
                {"detail": "You do not have permission to update this ride location."},
                status=status.HTTP_403_FORBIDDEN,
            )

        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")
        heading = request.data.get("heading", 0)

        if latitude is None or longitude is None:
            return Response(
                {"detail": "latitude and longitude are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = "driver" if is_driver else "rider"
        payload = _store_location(ride_id, role, latitude, longitude, heading)
        enqueue_location_history_event(
            ride_id=ride.id,
            role=role,
            latitude=latitude,
            longitude=longitude,
            heading=heading,
            source="api",
        )

        channel_layer = get_channel_layer()
        if channel_layer is not None:
            async_to_sync(channel_layer.group_send)(
                f"ride_{ride_id}",
                {
                    "type": "location_update",
                    **payload,
                },
            )

        return Response({"status": "ok", **payload})


class AdminRideLocationHistoryView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, ride_id):
        ride = get_object_or_404(
            RideRequest.objects.select_related("driver__user", "rider"),
            pk=ride_id,
        )

        order = (request.query_params.get("order") or "asc").strip().lower()
        if order not in {"asc", "desc"}:
            return Response(
                {"error": "order must be either 'asc' or 'desc'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            limit = int(request.query_params.get("limit") or 500)
        except ValueError:
            return Response(
                {"error": "limit must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        history = query_location_history(
            ride_id=ride.id,
            limit=limit,
            forward=(order == "asc"),
        )

        return Response(
            {
                "ride_id": ride.id,
                "booking_status": ride.status,
                "order": order,
                "limit": max(1, min(limit, 5000)),
                "count": len(history["items"]),
                "next_cursor": (
                    history["last_evaluated_key"]["event_ts"]
                    if history["last_evaluated_key"]
                    else None
                ),
                "results": history["items"],
            },
            status=status.HTTP_200_OK,
        )


class AdminRideHistoryListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit") or 50)
        except ValueError:
            return Response(
                {"error": "limit must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        limit = max(1, min(limit, 200))
        status_filter = (request.query_params.get("status") or "").strip().lower()
        query = (request.query_params.get("q") or "").strip()

        queryset = RideRequest.objects.select_related("driver__user", "rider").exclude(
            status="pending"
        )

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if query:
            filters = (
                Q(source_location__icontains=query)
                | Q(destination_location__icontains=query)
                | Q(rider__name__icontains=query)
                | Q(rider__email__icontains=query)
                | Q(driver__user__name__icontains=query)
                | Q(driver__user__email__icontains=query)
            )
            if query.isdigit():
                filters |= Q(id=int(query))
            queryset = queryset.filter(filters)

        rides = queryset.order_by("-created_at")[:limit]

        return Response(
            {
                "count": len(rides),
                "results": [
                    {
                        "id": ride.id,
                        "status": ride.status,
                        "created_at": ride.created_at,
                        "updated_at": ride.updated_at,
                        "source_location": ride.source_location,
                        "destination_location": ride.destination_location,
                        "rider_name": getattr(ride.rider, "name", ""),
                        "rider_email": getattr(ride.rider, "email", ""),
                        "driver_name": getattr(ride.driver.user, "name", ""),
                        "driver_email": getattr(ride.driver.user, "email", ""),
                    }
                    for ride in rides
                ],
            },
            status=status.HTTP_200_OK,
        )
