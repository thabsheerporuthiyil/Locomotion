from django.shortcuts import get_object_or_404
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import VehicleCategory
from .serializers import VehicleCategorySerializer

# List, create, update, or delete vehicle categories as an admin.
class AdminVehicleCategoryAPIView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        categories = VehicleCategory.objects.all()
        serializer = VehicleCategorySerializer(categories, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @swagger_auto_schema(
        operation_description="Create a new vehicle category",
        request_body=VehicleCategorySerializer,
        responses={201: VehicleCategorySerializer, 400: "Bad Request"},
    )
    def post(self, request):
        serializer = VehicleCategorySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @swagger_auto_schema(
        operation_description="Update a vehicle category",
        request_body=VehicleCategorySerializer,
        responses={
            200: VehicleCategorySerializer,
            400: "Bad Request",
            404: "Not Found",
        },
    )
    def put(self, request, pk):
        category = get_object_or_404(VehicleCategory, pk=pk)
        serializer = VehicleCategorySerializer(category, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    @swagger_auto_schema(
        operation_description="Delete a vehicle category",
        responses={204: "No Content", 404: "Not Found"},
    )
    def delete(self, request, pk):
        category = get_object_or_404(VehicleCategory, pk=pk)
        category.delete()
        return Response({"message": "Deleted"}, status=204)
