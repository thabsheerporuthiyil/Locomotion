from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (DriverApplication, DriverApplicationReview, DriverProfile,
                     DriverVehicle)
from .serializers import DriverApplicationSerializer
from .tasks import sync_driver_to_qdrant


class AdminDriverApplicationListView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_description="List all driver applications",
        responses={200: DriverApplicationSerializer(many=True)},
    )
    def get(self, request):
        applications = DriverApplication.objects.all().order_by("-submitted_at")
        serializer = DriverApplicationSerializer(
            applications, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminDriverApplicationActionView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_description="Approve or reject a driver application",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                "action": openapi.Schema(
                    type=openapi.TYPE_STRING,
                    description="Action to perform (approve/reject)",
                ),
                "reason": openapi.Schema(
                    type=openapi.TYPE_STRING,
                    description="Rejection reason if action is reject",
                ),
            },
            required=["action"],
        ),
        responses={200: "Success", 400: "Bad Request", 404: "Not Found"},
    )
    def post(self, request, pk):
        try:
            application = DriverApplication.objects.get(pk=pk)
        except DriverApplication.DoesNotExist:
            return Response({"error": "Application not found"}, status=404)

        action = request.data.get("action")

        if action not in ["approve", "reject"]:
            return Response({"error": "Invalid action"}, status=400)

        reason = request.data.get("reason")

        if action == "reject" and not reason:
            return Response({"error": "Rejection reason required"}, status=400)

        # Update current status
        application.status = "approved" if action == "approve" else "rejected"
        application.save()

        # Create review record
        DriverApplicationReview.objects.create(
            application=application,
            status=application.status,
            reason=reason if action == "reject" else None,
            reviewed_by=request.user,
        )

        # If approved → create profile
        if action == "approve":
            driver_profile, created = DriverProfile.objects.get_or_create(
                user=application.user,
                defaults={
                    "phone_number": application.phone_number,
                    "experience_years": application.experience_years,
                    "service_type": application.service_type,
                    "vehicle_model": application.vehicle_model,
                    "vehicle_registration_number": application.vehicle_registration_number,
                    "panchayath": application.panchayath,
                    "profile_image": application.profile_image,
                },
            )

            # Create DriverVehicle if applicable
            if application.service_type == "driver_with_vehicle":
                DriverVehicle.objects.create(
                    driver=driver_profile,
                    vehicle_category=application.vehicle_category,
                    vehicle_model=application.vehicle_model,
                    registration_number=application.vehicle_registration_number,
                    vehicle_image=application.vehicle_image,
                    rc_document=application.rc_document,
                    insurance_document=application.insurance_document,
                    status="approved",
                    is_primary=True,
                    is_active=True,
                )

            # Trigger background AI synchronization
            sync_driver_to_qdrant.delay(driver_profile.id)

        return Response({"message": f"Application {application.status}"})


from .serializers import DriverVehicleSerializer


class AdminVehicleListView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_description="List all vehicle applications",
        responses={200: DriverVehicleSerializer(many=True)},
    )
    def get(self, request):
        vehicles = DriverVehicle.objects.all().order_by("-created_at")
        serializer = DriverVehicleSerializer(
            vehicles, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminVehicleActionView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_description="Approve or reject a vehicle application",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                "action": openapi.Schema(
                    type=openapi.TYPE_STRING,
                    description="Action to perform (approve/reject)",
                )
            },
            required=["action"],
        ),
        responses={200: "Success", 400: "Bad Request", 404: "Not Found"},
    )
    def post(self, request, pk):
        try:
            vehicle = DriverVehicle.objects.get(pk=pk)
        except DriverVehicle.DoesNotExist:
            return Response({"error": "Vehicle not found"}, status=404)

        action = request.data.get("action")
        if action not in ["approve", "reject"]:
            return Response({"error": "Invalid action"}, status=400)

        vehicle.status = "approved" if action == "approve" else "rejected"
        vehicle.is_active = True if action == "approve" else False

        if action == "approve":
            if vehicle.driver.service_type == "driver_only":
                vehicle.driver.service_type = "driver_with_vehicle"
                vehicle.driver.save()

            current_primary = DriverVehicle.objects.filter(
                driver=vehicle.driver, is_primary=True
            ).exists()
            if not current_primary:
                vehicle.is_primary = True

        vehicle.save()

        if action == "approve":
            # Re-sync driver to update vehicle info in AI Matchmaker
            sync_driver_to_qdrant.delay(vehicle.driver.id)

        return Response({"message": f"Vehicle {vehicle.status}"})
