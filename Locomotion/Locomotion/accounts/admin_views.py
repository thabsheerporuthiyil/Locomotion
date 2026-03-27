from django.contrib.auth import get_user_model
from django.db.models import Exists, OuterRef, Q
from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from drivers.models import DriverProfile


User = get_user_model()


class AdminUserListView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_summary="Admin: list users (with block status)",
        manual_parameters=[
            openapi.Parameter("q", openapi.IN_QUERY, type=openapi.TYPE_STRING),
            openapi.Parameter(
                "role",
                openapi.IN_QUERY,
                type=openapi.TYPE_STRING,
                enum=["customer", "admin"],
            ),
            openapi.Parameter("is_active", openapi.IN_QUERY, type=openapi.TYPE_BOOLEAN),
            openapi.Parameter("limit", openapi.IN_QUERY, type=openapi.TYPE_INTEGER),
            openapi.Parameter("offset", openapi.IN_QUERY, type=openapi.TYPE_INTEGER),
        ],
    )
    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        role = (request.query_params.get("role") or "").strip()
        is_active = request.query_params.get("is_active")

        try:
            limit = int(request.query_params.get("limit") or 50)
        except ValueError:
            limit = 50
        try:
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            offset = 0

        limit = max(1, min(200, limit))
        offset = max(0, offset)

        qs = (
            User.objects.all()
            .annotate(is_driver=Exists(DriverProfile.objects.filter(user_id=OuterRef("pk"))))
            .order_by("-created_at")
        )

        if q:
            qs = qs.filter(
                Q(email__icontains=q) | Q(name__icontains=q) | Q(phone_number__icontains=q)
            )

        if role in ["customer", "admin"]:
            qs = qs.filter(role=role)

        if isinstance(is_active, str) and is_active.lower() in ["true", "false"]:
            qs = qs.filter(is_active=(is_active.lower() == "true"))

        total = qs.count()
        users = qs[offset : offset + limit]

        results = [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "phone_number": u.phone_number,
                "role": u.role,
                "is_active": u.is_active,
                "is_staff": u.is_staff,
                "is_superuser": u.is_superuser,
                "is_driver": bool(getattr(u, "is_driver", False)),
                "created_at": u.created_at,
            }
            for u in users
        ]

        return Response({"total": total, "results": results}, status=status.HTTP_200_OK)


class AdminUserBlockView(APIView):
    permission_classes = [IsAdminUser]

    @swagger_auto_schema(
        operation_summary="Admin: block/unblock a user",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                "is_active": openapi.Schema(type=openapi.TYPE_BOOLEAN),
            },
            required=["is_active"],
        ),
    )
    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        if "is_active" not in request.data:
            return Response(
                {"error": "is_active is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        user.is_active = bool(request.data.get("is_active"))
        user.save(update_fields=["is_active"])

        return Response(
            {"message": "User updated", "id": user.id, "is_active": user.is_active},
            status=status.HTTP_200_OK,
        )

