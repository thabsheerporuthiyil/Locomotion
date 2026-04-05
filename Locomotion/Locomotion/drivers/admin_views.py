from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (DriverApplication, DriverApplicationReview, DriverProfile,
                     DriverVehicle)
from .serializers import DriverApplicationSerializer, DriverVehicleSerializer
from .tasks import sync_driver_to_qdrant

# List driver applications for admin review with optional filters.
class AdminDriverApplicationListView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_description="List all driver applications",
        responses={200: DriverApplicationSerializer(many=True)},
    )
    def get(self, request):
        applications = DriverApplication.objects.all().order_by("-submitted_at")

        status_filter = request.query_params.get("status")
        if status_filter in ["pending", "approved", "rejected"]:
            applications = applications.filter(status=status_filter)

        raw_limit = request.query_params.get("limit")
        if raw_limit:
            try:
                limit = max(1, min(200, int(raw_limit)))
                applications = applications[:limit]
            except ValueError:
                pass

        serializer = DriverApplicationSerializer(
            applications, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

# Approve or reject a specific driver application as an admin.
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

# List vehicle submissions for admin review with optional filters.
class AdminVehicleListView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_description="List all vehicle applications",
        responses={200: DriverVehicleSerializer(many=True)},
    )
    def get(self, request):
        vehicles = DriverVehicle.objects.all().order_by("-created_at")

        status_filter = request.query_params.get("status")
        if status_filter in ["pending", "approved", "rejected"]:
            vehicles = vehicles.filter(status=status_filter)

        raw_limit = request.query_params.get("limit")
        if raw_limit:
            try:
                limit = max(1, min(200, int(raw_limit)))
                vehicles = vehicles[:limit]
            except ValueError:
                pass

        serializer = DriverVehicleSerializer(
            vehicles, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

# Approve or reject a specific driver vehicle as an admin.
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

# Return count-based admin stats for drivers and vehicles.
class AdminStatsView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_description="Admin dashboard stats (counts only)",
        responses={
            200: openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "users_total": openapi.Schema(type=openapi.TYPE_INTEGER),
                    "drivers_total": openapi.Schema(type=openapi.TYPE_INTEGER),
                    "drivers_active": openapi.Schema(type=openapi.TYPE_INTEGER),
                    "pending_driver_applications": openapi.Schema(type=openapi.TYPE_INTEGER),
                    "pending_vehicle_requests": openapi.Schema(type=openapi.TYPE_INTEGER),
                },
            )
        },
    )
    def get(self, request):
        User = get_user_model()
        users_total = User.objects.count()
        drivers_total = DriverProfile.objects.count()
        drivers_active = DriverProfile.objects.filter(is_active=True).count()
        pending_driver_applications = DriverApplication.objects.filter(status="pending").count()
        pending_vehicle_requests = DriverVehicle.objects.filter(status="pending").count()

        return Response(
            {
                "users_total": users_total,
                "drivers_total": drivers_total,
                "drivers_active": drivers_active,
                "pending_driver_applications": pending_driver_applications,
                "pending_vehicle_requests": pending_vehicle_requests,
            },
            status=status.HTTP_200_OK,
        )

# Return the cached admin dashboard payload for driver operations.
class AdminDashboardView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_description="Admin dashboard payload (counts + recent pending items).",
        manual_parameters=[
            openapi.Parameter(
                "force",
                openapi.IN_QUERY,
                description="Set to 1 to bypass cache",
                type=openapi.TYPE_INTEGER,
            )
        ],
    )
    def get(self, request):
        force = str(request.query_params.get("force") or "0") == "1"
        cache_key = "admin_dashboard_v1"

        if not force:
            cached = cache.get(cache_key)
            if cached:
                return Response(cached, status=status.HTTP_200_OK)

        User = get_user_model()

        users_total = User.objects.count()
        drivers_total = DriverProfile.objects.count()
        drivers_active = DriverProfile.objects.filter(is_active=True).count()
        pending_driver_applications = DriverApplication.objects.filter(status="pending").count()
        pending_vehicle_requests = DriverVehicle.objects.filter(status="pending").count()

        recent_apps_qs = (
            DriverApplication.objects.filter(status="pending")
            .select_related(
                "user",
                "panchayath",
                "panchayath__taluk",
                "panchayath__taluk__district",
            )
            .order_by("-submitted_at")[:5]
        )
        recent_apps = [
            {
                "id": a.id,
                "status": a.status,
                "email": a.user.email,
                "phone_number": a.phone_number,
                "service_type": a.service_type,
                "panchayath_name": a.panchayath.name,
                "taluk_name": a.panchayath.taluk.name,
                "district_name": a.panchayath.taluk.district.name,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            }
            for a in recent_apps_qs
        ]

        recent_vehicles_qs = (
            DriverVehicle.objects.filter(status="pending")
            .select_related(
                "driver__user",
                "vehicle_model",
                "vehicle_model__brand",
                "vehicle_category",
            )
            .order_by("-created_at")[:5]
        )
        recent_vehicles = [
            {
                "id": v.id,
                "status": v.status,
                "vehicle_brand_name": v.vehicle_model.brand.name,
                "vehicle_model_name": v.vehicle_model.name,
                "vehicle_category_name": v.vehicle_category.name,
                "registration_number": v.registration_number,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in recent_vehicles_qs
        ]

        payload = {
            "stats": {
                "users_total": users_total,
                "drivers_total": drivers_total,
                "drivers_active": drivers_active,
                "pending_driver_applications": pending_driver_applications,
                "pending_vehicle_requests": pending_vehicle_requests,
            },
            "recent_driver_applications": recent_apps,
            "recent_vehicle_requests": recent_vehicles,
        }

        cache.set(cache_key, payload, timeout=10)
        return Response(payload, status=status.HTTP_200_OK)
