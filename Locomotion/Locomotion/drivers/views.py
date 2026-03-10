from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile, DriverVehicle
from .permissions import IsActiveDriver
from .serializers import (DriverApplicationSerializer, DriverListSerializer,
                          DriverVehicleSerializer)


class ApplyDriverView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @swagger_auto_schema(
        request_body=DriverApplicationSerializer,
        responses={201: DriverApplicationSerializer},
        operation_description="Apply as driver",
    )
    def post(self, request):
        user = request.user

        if hasattr(user, "driver_profile"):
            return Response(
                {"error": "You are already a driver"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_application = getattr(user, "driver_application", None)

        if existing_application:
            if existing_application.status == "pending":
                return Response({"error": "Application already pending"}, status=400)

            if existing_application.status == "approved":
                return Response({"error": "You are already a driver"}, status=400)

            if existing_application.status == "rejected":
                existing_application.status = "pending"
                existing_application.save()
                return Response({"message": "Application resubmitted"})

        serializer = DriverApplicationSerializer(data=request.data)

        if serializer.is_valid():
            serializer.save(user=user)
            return Response(
                {"message": "Application submitted successfully"},
                status=status.HTTP_201_CREATED,
            )

        return Response(serializer.errors, status=400)


class DriverListView(APIView):

    def get(self, request):

        queryset = DriverProfile.objects.filter(
            is_active=True, wallet_balance__gt=-100.00
        )

        district = request.query_params.get("district")
        taluk = request.query_params.get("taluk")
        panchayath = request.query_params.get("panchayath")

        if district:
            queryset = queryset.filter(panchayath__taluk__district_id=district)

        if taluk:
            queryset = queryset.filter(panchayath__taluk_id=taluk)

        if panchayath:
            queryset = queryset.filter(panchayath_id=panchayath)

        queryset = queryset.select_related(
            "user",
            "panchayath",
            "panchayath__taluk",
            "panchayath__taluk__district",
            "vehicle_model",
        ).prefetch_related(
            "vehicles",
            "vehicles__vehicle_model",
            "vehicles__vehicle_model__brand",
            "vehicles__vehicle_category",
        )

        serializer = DriverListSerializer(
            queryset, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class DriverDetailView(APIView):

    def get(self, request, id):
        try:
            driver = (
                DriverProfile.objects.select_related(
                    "user",
                    "panchayath",
                    "panchayath__taluk",
                    "panchayath__taluk__district",
                    "vehicle_model",
                )
                .prefetch_related(
                    "vehicles",
                    "vehicles__vehicle_model",
                    "vehicles__vehicle_model__brand",
                    "vehicles__vehicle_category",
                )
                .get(id=id, is_active=True)
            )

        except DriverProfile.DoesNotExist:
            return Response(
                {"detail": "Driver not found"}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = DriverListSerializer(driver, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


# for driver's dashboard
class DriverVehicleDataView(APIView):
    permission_classes = [IsActiveDriver]

    def get(self, request):
        vehicles = DriverVehicle.objects.filter(driver=request.user.driver_profile)
        serializer = DriverVehicleSerializer(
            vehicles, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = DriverVehicleSerializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():
            serializer.save(driver=request.user.driver_profile, status="pending")
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Toggle availability
class DriverAvailabilityView(APIView):
    permission_classes = [IsActiveDriver]

    def get(self, request):
        driver = request.user.driver_profile
        return Response(
            {
                "is_available": driver.is_available,
                "wallet_balance": driver.wallet_balance,
            }
        )

    def post(self, request):
        driver = request.user.driver_profile
        driver.is_available = not driver.is_available
        driver.save()

        return Response(
            {
                "is_available": driver.is_available,
                "wallet_balance": driver.wallet_balance,
                "message": "Availability updated",
            }
        )
