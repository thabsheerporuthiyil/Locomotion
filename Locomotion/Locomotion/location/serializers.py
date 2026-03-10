from rest_framework import serializers

from .models import District, Panchayath, Taluk


class DistrictSerializer(serializers.ModelSerializer):
    class Meta:
        model = District
        fields = ["id", "name"]


class TalukSerializer(serializers.ModelSerializer):
    class Meta:
        model = Taluk
        fields = ["id", "name", "district"]


class PanchayathSerializer(serializers.ModelSerializer):
    class Meta:
        model = Panchayath
        fields = ["id", "name", "taluk"]
