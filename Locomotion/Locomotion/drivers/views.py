import time as time_module
from datetime import datetime, time, timedelta

import requests
from django.conf import settings
from django.utils import timezone
from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .coach_fallback import build_coach_plan_fallback
from .coach_stats import build_driver_earnings_coach_stats
from .models import DriverProfile, DriverReminder, DriverVehicle
from .permissions import IsActiveDriver
from .serializers import (DriverApplicationSerializer, DriverListSerializer,
                          DriverVehicleSerializer)
from .tasks import send_driver_reminder

# Submit or resubmit a driver application for the authenticated user.
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

# List available drivers with optional location filters and caching.
class DriverListView(APIView):
    permission_classes = [AllowAny]

    def _exclude_requesting_driver(self, request, drivers_data):
        if not getattr(request.user, "is_authenticated", False):
            return drivers_data

        driver_profile = getattr(request.user, "driver_profile", None)
        if not driver_profile:
            return drivers_data

        return [driver for driver in drivers_data if driver.get("id") != driver_profile.id]

    def get(self, request):
        from django.core.cache import cache

        district = request.query_params.get("district", "")
        taluk = request.query_params.get("taluk", "")
        panchayath = request.query_params.get("panchayath", "")

        # Generate a unique cache key based on filters
        cache_key = f"driver_list_{district}_{taluk}_{panchayath}"

        cached_data = cache.get(cache_key)
        if cached_data:
            print(f"DEBUG: Redis Cache HIT for key {cache_key}")
            response_data = self._exclude_requesting_driver(request, cached_data)
            return Response(
                response_data,
                status=status.HTTP_200_OK,
                headers={
                    "X-Cache": "HIT",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            )

        print(f"DEBUG: Redis Cache MISS for key {cache_key}. Fetching from DB.")
        queryset = DriverProfile.objects.filter(
            is_active=True, wallet_balance__gt=-100.00, is_available=True
        )

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
        serialized_data = serializer.data

        # Cache the serialized data for 60 seconds
        cache.set(cache_key, serialized_data, timeout=60)
        response_data = self._exclude_requesting_driver(request, serialized_data)

        return Response(
            response_data,
            status=status.HTTP_200_OK,
            headers={
                "X-Cache": "MISS",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )

# Return the public details for a single active driver.
class DriverDetailView(APIView):
    permission_classes = [AllowAny]

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

# List or create driver vehicle data for the active driver dashboard.
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

# Show or toggle the active driver's availability state.
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

        # Lockout check: Drivers with debt >= 100 cannot go online
        if not driver.is_available and driver.wallet_balance <= -100:
            return Response(
                {
                    "error": "Account restricted due to low balance. Please recharge your wallet.",
                    "is_available": False,
                    "wallet_balance": driver.wallet_balance,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        driver.is_available = not driver.is_available
        driver.save()

        # Invalidate the driver list cache and sync to AI Matchmaker
        try:
            from django.core.cache import cache

            from .tasks import sync_driver_to_qdrant

            # Use wildcards or clear all driver_list keys.
            # Since we don't know the specific filters used, we can use cache.delete_pattern if using django-redis,
            # but standard cache doesn't support wildcards. We can just clear the general keys or accept the 60s delay
            # for filtered lists, or clear the main ones.
            # Best approach: trigger AI sync immediately.
            sync_driver_to_qdrant.delay(driver.id)

            # For standard cache, we can't easily delete by pattern.
            # We clear the entire cache to guarantee all filtered variations update instantly.
            cache.clear()
        except Exception as e:
            print(f"Sync/Cache error: {e}")

        return Response(
            {
                "is_available": driver.is_available,
                "wallet_balance": driver.wallet_balance,
                "message": "Availability updated",
            }
        )

# Preview earnings coach statistics for the active driver.
class DriverCoachPreviewView(APIView):
    permission_classes = [IsActiveDriver]

    @swagger_auto_schema(
        operation_description="Preview earnings coach stats for the authenticated driver (development/testing payload).",
        manual_parameters=[
            openapi.Parameter(
                "days",
                openapi.IN_QUERY,
                description="Number of days to include (1-90). Default 14.",
                type=openapi.TYPE_INTEGER,
            )
        ],
        responses={200: openapi.Schema(type=openapi.TYPE_OBJECT)},
    )
    def get(self, request):
        raw_days = request.query_params.get("days", "14")
        try:
            days = int(raw_days)
        except (TypeError, ValueError):
            days = 14

        payload = build_driver_earnings_coach_stats(
            driver=request.user.driver_profile, days=days
        )
        return Response(payload, status=status.HTTP_200_OK)

# Generate an AI-backed coach plan for the active driver.
class DriverCoachPlanView(APIView):
    permission_classes = [IsActiveDriver]

    @swagger_auto_schema(
        operation_description="Generate an earnings coach plan for the authenticated driver (stats -> AI service -> plan).",
        manual_parameters=[
            openapi.Parameter(
                "days",
                openapi.IN_QUERY,
                description="Number of days to include (1-90). Default 14.",
                type=openapi.TYPE_INTEGER,
            ),
            openapi.Parameter(
                "goal",
                openapi.IN_QUERY,
                description='Optional coaching goal (e.g. "maximize earnings", "short shift").',
                type=openapi.TYPE_STRING,
            ),
        ],
        responses={200: openapi.Schema(type=openapi.TYPE_OBJECT)},
    )
    def get(self, request):
        include_debug = str(request.query_params.get("debug", "")).lower() in (
            "1",
            "true",
            "yes",
        )
        raw_days = request.query_params.get("days", "14")
        goal = request.query_params.get("goal")
        force_fallback = str(
            request.query_params.get("force_fallback", "")
        ).lower() in (
            "1",
            "true",
            "yes",
        )
        try:
            days = int(raw_days)
        except (TypeError, ValueError):
            days = 14

        stats_payload = build_driver_earnings_coach_stats(
            driver=request.user.driver_profile, days=days
        )

        ai_base = getattr(settings, "AI_SERVICE_URL", "").rstrip("/")
        if not ai_base:
            plan = build_coach_plan_fallback(stats_payload, max_hotspots=5)
            return Response(
                {
                    "stats": stats_payload,
                    "plan": plan,
                    "llm_used": False,
                    "llm_provider": None,
                    "debug": (
                        "AI_SERVICE_URL is not configured; used local fallback."
                        if include_debug
                        else ""
                    ),
                },
                status=status.HTTP_200_OK,
            )

        if force_fallback:
            plan = build_coach_plan_fallback(stats_payload, max_hotspots=5)
            return Response(
                {
                    "stats": stats_payload,
                    "plan": plan,
                    "llm_used": False,
                    "llm_provider": None,
                    "debug": (
                        "force_fallback=1; used local fallback."
                        if include_debug
                        else ""
                    ),
                },
                status=status.HTTP_200_OK,
            )

        # Try a couple of internal URLs in case the primary is temporarily unreachable.
        #
        # In docker-compose, the stable internal service name is `fastapi-ai:8000`. If AI_SERVICE_URL is pointed at
        # nginx (or some other proxy), it can return 502 HTML pages during startup/reloads. Prefer the service name
        # first unless the user explicitly points to a local dev URL.
        local_dev_prefixes = (
            "http://localhost",
            "http://127.0.0.1",
            "https://localhost",
            "https://127.0.0.1",
            "http://host.docker.internal",
            "https://host.docker.internal",
        )

        candidate_ai_bases: list[str] = []
        if ai_base.startswith(local_dev_prefixes):
            candidate_ai_bases.append(ai_base)
        else:
            candidate_ai_bases.append("http://fastapi-ai:8000")
            if ai_base != "http://fastapi-ai:8000":
                candidate_ai_bases.append(ai_base)

        # Avoid routing through nginx from backend-to-backend calls; it can introduce 502s and HTML error pages.

        try:
            resp = None
            last_err: Exception | None = None
            for base in candidate_ai_bases:
                url = f"{base.rstrip('/')}/api/ai/coach-plan"
                # Retry a few times on connection errors (container restarting, model loading, DNS warm-up, etc.)
                # FastAPI can take a few seconds to start because it loads embedding models on import.
                retry_delays_s = (0.5, 0.5, 1.0, 1.0, 2.0, 2.0)
                for delay_s in retry_delays_s:
                    try:
                        resp = requests.post(
                            url,
                            json={
                                "stats": stats_payload,
                                "goal": goal,
                                "max_hotspots": 5,
                                "debug": include_debug,
                            },
                            timeout=20,
                        )
                        last_err = None
                        break
                    except (requests.ConnectionError, requests.Timeout) as e:
                        last_err = e
                        time_module.sleep(delay_s)
                        continue
                if resp is not None:
                    # Treat 5xx as transient and try the next base.
                    if resp.status_code >= 500:
                        resp = None
                        continue
                    break
            if resp is None:
                raise requests.RequestException(
                    str(last_err or "AI service unreachable")
                )
        except requests.RequestException as e:
            plan = build_coach_plan_fallback(stats_payload, max_hotspots=5)
            return Response(
                {
                    "stats": stats_payload,
                    "plan": plan,
                    "llm_used": False,
                    "llm_provider": None,
                    "debug": (
                        f"AI service unavailable; used local fallback. Error: {str(e)[:300]}"
                        if include_debug
                        else ""
                    ),
                },
                status=status.HTTP_200_OK,
            )

        if resp.status_code >= 400:
            plan = build_coach_plan_fallback(stats_payload, max_hotspots=5)
            content_type = (resp.headers.get("content-type") or "").lower()
            details = resp.text
            if "text/html" in content_type or "<html" in (details or "").lower():
                details = "Upstream returned an HTML error page (likely a proxy error)."
            return Response(
                {
                    "stats": stats_payload,
                    "plan": plan,
                    "llm_used": False,
                    "llm_provider": None,
                    "debug": (
                        f"AI service error {resp.status_code}; used local fallback. Details: {details[:300]}"
                        if include_debug
                        else ""
                    ),
                },
                status=status.HTTP_200_OK,
            )

        data = resp.json()
        return Response(
            {
                "stats": stats_payload,
                "plan": data.get("plan"),
                "llm_used": data.get("llm_used", False),
                "llm_provider": data.get("llm_provider"),
                "debug": data.get("debug", "") if include_debug else "",
            },
            status=status.HTTP_200_OK,
        )

# Apply coach actions such as reminder creation for the active driver.
class DriverCoachApplyView(APIView):
    permission_classes = [IsActiveDriver]

    @swagger_auto_schema(
        operation_description=(
            "Apply coach actions for the authenticated driver. "
            "Currently supports creating reminder actions and scheduling Celery tasks."
        ),
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                "actions": openapi.Schema(
                    type=openapi.TYPE_ARRAY,
                    items=openapi.Schema(
                        type=openapi.TYPE_OBJECT,
                        properties={
                            "type": openapi.Schema(
                                type=openapi.TYPE_STRING, example="reminder"
                            ),
                            "at": openapi.Schema(
                                type=openapi.TYPE_STRING, example="17:30"
                            ),
                            "message": openapi.Schema(
                                type=openapi.TYPE_STRING,
                                example="Go online near Kakkanchery for peak demand.",
                            ),
                        },
                        required=["type", "at", "message"],
                    ),
                ),
                "plan": openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    description="Optional full plan object; if provided, actions are read from plan.actions.",
                ),
            },
            required=[],
        ),
        responses={201: openapi.Schema(type=openapi.TYPE_OBJECT), 400: "Bad Request"},
    )
    def post(self, request):
        data = request.data or {}
        actions = data.get("actions")
        if actions is None and isinstance(data.get("plan"), dict):
            actions = data["plan"].get("actions")

        if not isinstance(actions, list):
            return Response(
                {"error": "actions must be a list (or provide plan.actions)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created: list[dict] = []
        errors: list[dict] = []

        now = timezone.localtime(timezone.now())

        for idx, action in enumerate(actions):
            if not isinstance(action, dict):
                errors.append({"index": idx, "error": "Action must be an object."})
                continue

            action_type = (action.get("type") or "").strip().lower()
            if action_type != "reminder":
                errors.append(
                    {"index": idx, "error": f"Unsupported action type: {action_type}"}
                )
                continue

            at = (action.get("at") or "").strip()
            message = (action.get("message") or "").strip()
            if not at or not message:
                errors.append(
                    {"index": idx, "error": "reminder requires at and message."}
                )
                continue

            try:
                hh, mm = at.split(":")
                remind_time = time(hour=int(hh), minute=int(mm))
            except Exception:
                errors.append(
                    {
                        "index": idx,
                        "error": f"Invalid time format for at: {at} (expected HH:MM).",
                    }
                )
                continue

            remind_at = timezone.make_aware(datetime.combine(now.date(), remind_time))
            if remind_at <= now:
                remind_at = remind_at + timedelta(days=1)

            reminder = DriverReminder.objects.create(
                driver=request.user.driver_profile,
                remind_at=remind_at,
                message=message,
            )

            # Schedule the Celery task at the reminder time.
            try:
                send_driver_reminder.apply_async(args=[reminder.id], eta=remind_at)
            except Exception as e:
                reminder.status = "failed"
                reminder.last_error = f"Failed to schedule Celery task: {e}"
                reminder.save(update_fields=["status", "last_error"])
                errors.append(
                    {"index": idx, "error": f"Failed to schedule reminder: {e}"}
                )
                continue

            created.append(
                {
                    "id": reminder.id,
                    "remind_at": timezone.localtime(reminder.remind_at).isoformat(),
                    "message": reminder.message,
                    "status": reminder.status,
                }
            )

        status_code = (
            status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST
        )
        return Response({"created": created, "errors": errors}, status=status_code)

# List coach reminders created for the active driver.
class DriverCoachRemindersView(APIView):
    permission_classes = [IsActiveDriver]

    @swagger_auto_schema(
        operation_description="List coach reminders for the authenticated driver.",
        manual_parameters=[
            openapi.Parameter(
                "status",
                openapi.IN_QUERY,
                description="Optional filter (pending/sent/failed/cancelled).",
                type=openapi.TYPE_STRING,
            )
        ],
        responses={
            200: openapi.Schema(
                type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_OBJECT)
            )
        },
    )
    def get(self, request):
        status_filter = request.query_params.get("status")
        qs = DriverReminder.objects.filter(driver=request.user.driver_profile)
        if status_filter:
            qs = qs.filter(status=status_filter)

        qs = qs.order_by("-remind_at", "-created_at")[:50]

        return Response(
            [
                {
                    "id": r.id,
                    "remind_at": timezone.localtime(r.remind_at).isoformat(),
                    "message": r.message,
                    "status": r.status,
                    "sent_at": (
                        timezone.localtime(r.sent_at).isoformat() if r.sent_at else None
                    ),
                    "last_error": r.last_error or "",
                }
                for r in qs
            ],
            status=status.HTTP_200_OK,
        )
