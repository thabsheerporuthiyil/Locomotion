from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from bookings.models import RideRequest

from .location_history import query_location_history


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
