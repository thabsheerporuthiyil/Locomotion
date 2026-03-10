from rest_framework import serializers

from .models import VehicleBrand, VehicleCategory, VehicleModel


class VehicleCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleCategory
        fields = ["id", "name"]


class VehicleBrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleBrand
        fields = ["id", "name", "category"]


class VehicleModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleModel
        fields = ["id", "name", "brand"]
