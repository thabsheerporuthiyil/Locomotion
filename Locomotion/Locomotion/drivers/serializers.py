from rest_framework import serializers

from .models import (DriverApplication, DriverApplicationReview, DriverProfile,
                     DriverVehicle)


class DriverApplicationReviewSerializer(serializers.ModelSerializer):
    reviewed_by = serializers.StringRelatedField()

    class Meta:
        model = DriverApplicationReview
        fields = [
            "status",
            "reason",
            "reviewed_by",
            "reviewed_at",
        ]


class DriverApplicationSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    vehicle_model_name = serializers.CharField(
        source="vehicle_model.name", read_only=True
    )
    vehicle_category_name = serializers.CharField(
        source="vehicle_category.name", read_only=True
    )
    reviews = DriverApplicationReviewSerializer(many=True, read_only=True)
    panchayath_name = serializers.CharField(source="panchayath.name", read_only=True)

    taluk_name = serializers.CharField(source="panchayath.taluk.name", read_only=True)

    district_name = serializers.CharField(
        source="panchayath.taluk.district.name", read_only=True
    )

    class Meta:
        model = DriverApplication
        fields = [
            "id",
            "email",
            "phone_number",
            "experience_years",
            "service_type",
            "vehicle_category",
            "vehicle_category_name",
            "vehicle_model",
            "vehicle_model_name",
            "vehicle_registration_number",
            "profile_image",
            "license_document",
            "reviews",
            "panchayath",
            "panchayath_name",
            "taluk_name",
            "district_name",
            "status",
            "submitted_at",
            "rc_document",
            "insurance_document",
            "vehicle_image",
        ]

    def validate(self, data):
        service_type = data.get("service_type")

        if service_type == "driver_only":
            if not data.get("vehicle_category"):
                raise serializers.ValidationError(
                    {"error": "Vehicle category is required."}
                )

        if service_type == "driver_with_vehicle":
            if not data.get("vehicle_category"):
                raise serializers.ValidationError(
                    {"error": "Vehicle category is required."}
                )

            if not data.get("vehicle_model"):
                raise serializers.ValidationError(
                    {"error": "Vehicle model is required."}
                )

            if not data.get("vehicle_registration_number"):
                raise serializers.ValidationError(
                    {"error": "Registration number required."}
                )

            # Documents validation
            if (
                not data.get("vehicle_image")
                or not data.get("rc_document")
                or not data.get("insurance_document")
            ):
                raise serializers.ValidationError(
                    {
                        "error": "All vehicle documents (RC, Insurance, Photo) are required."
                    }
                )

        return data


class DriverProfileAdminSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "email",
            "phone_number",
            "experience_years",
            "service_type",
            "status",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields


class DriverListSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name")
    district = serializers.CharField(source="panchayath.taluk.district.name")
    taluk = serializers.CharField(source="panchayath.taluk.name")
    panchayath_name = serializers.CharField(source="panchayath.name")
    vehicle_full_name = serializers.SerializerMethodField()
    profile_image = serializers.ImageField(read_only=True)
    vehicle_category_name = serializers.SerializerMethodField()
    vehicle_registration_number = serializers.SerializerMethodField()
    all_vehicles = serializers.SerializerMethodField()

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "name",
            "experience_years",
            "service_type",
            "vehicle_full_name",
            "vehicle_registration_number",
            "district",
            "taluk",
            "panchayath_name",
            "panchayath_name",
            "profile_image",
            "vehicle_category_name",
            "all_vehicles",
            "is_available",
            "average_rating",
            "total_ratings",
        ]

    def get_all_vehicles(self, obj):
        vehicles_data = []

        # Approved Vehicles
        # We need the request context to build absolute URLs for images
        request = self.context.get("request")

        approved_vehicles = obj.vehicles.filter(status="approved")
        for v in approved_vehicles:
            image_url = None
            if v.vehicle_image:
                if request:
                    image_url = request.build_absolute_uri(v.vehicle_image.url)
                else:
                    image_url = v.vehicle_image.url

            vehicles_data.append(
                {
                    "model": f"{v.vehicle_model.brand.name} {v.vehicle_model.name}",
                    "category": v.vehicle_category.name,
                    "registration": v.registration_number,
                    "image": image_url,
                }
            )

        # Legacy Vehicle
        if obj.vehicle_model:
            # Check for duplicates based on registration number
            is_duplicate = False
            if obj.vehicle_registration_number:
                for v_data in vehicles_data:
                    if v_data["registration"] == obj.vehicle_registration_number:
                        is_duplicate = True
                        break

            if not is_duplicate:
                vehicles_data.append(
                    {
                        "model": f"{obj.vehicle_model.brand.name} {obj.vehicle_model.name}",
                        "category": obj.vehicle_model.brand.category.name,
                        "registration": obj.vehicle_registration_number,
                        "image": None,
                    }
                )

        return vehicles_data

    def _get_active_vehicle(self, obj):
        # Try to find a primary approved vehicle
        primary = obj.vehicles.filter(status="approved", is_primary=True).first()
        if primary:
            return primary

        # Fallback to the most recently approved vehicle
        return obj.vehicles.filter(status="approved").order_by("-created_at").first()

    def get_vehicle_full_name(self, obj):
        vehicle = self._get_active_vehicle(obj)
        if vehicle:
            return f"{vehicle.vehicle_model.brand.name} {vehicle.vehicle_model.name}"

        # Legacy fallback
        if obj.vehicle_model:
            return f"{obj.vehicle_model.brand.name} {obj.vehicle_model.name}"
        return None

    def get_vehicle_category_name(self, obj):
        # Return list of categories for all approved vehicles
        vehicles = obj.vehicles.filter(status="approved")
        categories = set()

        for v in vehicles:
            categories.add(v.vehicle_category.name)

        # Include Legacy vehicle if it exists
        if obj.vehicle_model:
            categories.add(obj.vehicle_model.brand.category.name)

        # For Driver Only, fetch the category they were approved for from their original application
        if obj.service_type == "driver_only":
            try:
                application = obj.user.driver_application
                if application and application.vehicle_category:
                    categories.add(application.vehicle_category.name)
            except Exception:
                pass

        return list(categories) if categories else None

    def get_vehicle_registration_number(self, obj):
        vehicle = self._get_active_vehicle(obj)
        if vehicle:
            return vehicle.registration_number
        return obj.vehicle_registration_number


class DriverVehicleSerializer(serializers.ModelSerializer):
    vehicle_model_name = serializers.CharField(
        source="vehicle_model.name", read_only=True
    )
    vehicle_brand_name = serializers.CharField(
        source="vehicle_model.brand.name", read_only=True
    )
    vehicle_category_name = serializers.CharField(
        source="vehicle_category.name", read_only=True
    )

    class Meta:
        model = DriverVehicle
        fields = [
            "id",
            "vehicle_category",
            "vehicle_category_name",
            "vehicle_model",
            "vehicle_model_name",
            "vehicle_brand_name",
            "registration_number",
            "vehicle_image",
            "rc_document",
            "insurance_document",
            "is_primary",
            "status",
        ]
        read_only_fields = ["status", "is_primary"]

    def validate(self, data):
        # We enforce all fields are provided when adding a new vehicle
        required_fields = [
            "vehicle_category",
            "vehicle_model",
            "registration_number",
            "vehicle_image",
            "rc_document",
            "insurance_document",
        ]

        for field in required_fields:
            if not data.get(field):
                # Generic error strings are picked up by the global UI banner handler
                raise serializers.ValidationError(
                    {"error": "All fields and documents are required."}
                )

        return data
