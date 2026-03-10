from rest_framework import serializers

from drivers.serializers import DriverListSerializer

from .models import RideRequest


class RideRatingSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    feedback = serializers.CharField(required=False, allow_blank=True, max_length=1000)


from drivers.serializers import DriverListSerializer


class RideRequestSerializer(serializers.ModelSerializer):
    rider_name = serializers.CharField(source="rider.name", read_only=True)
    rider_phone = serializers.CharField(
        source="rider.phone_number", read_only=True
    )  # Assuming User has phone_number or similar

    driver_name = serializers.CharField(source="driver.user.name", read_only=True)
    driver_phone = serializers.SerializerMethodField()
    ride_otp = serializers.SerializerMethodField()

    class Meta:
        model = RideRequest
        fields = [
            "id",
            "rider",
            "rider_name",
            "rider_phone",
            "driver",
            "driver_name",
            "driver_phone",
            "source_location",
            "source_lat",
            "source_lng",
            "destination_location",
            "destination_lat",
            "destination_lng",
            "vehicle_details",
            "distance_km",
            "estimated_fare",
            "status",
            "ride_otp",
            "is_paid",
            "rating",
            "feedback",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "rider",
            "status",
            "created_at",
            "updated_at",
            "rating",
            "feedback",
        ]

    def get_driver_phone(self, obj):
        # Only reveal phone number if status is accepted, arrived, or in_progress
        if obj.status in ["accepted", "arrived", "in_progress"]:
            return obj.driver.phone_number
        return None

    def get_ride_otp(self, obj):
        request = self.context.get("request")
        # Only expose OTP to the rider who requested the ride
        if request and request.user == obj.rider:
            return obj.ride_otp
        return None


class RideRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RideRequest
        fields = [
            "driver",
            "source_location",
            "source_lat",
            "source_lng",
            "destination_location",
            "destination_lat",
            "destination_lng",
            "vehicle_details",
            "distance_km",
            "estimated_fare",
        ]

    def validate(self, data):
        required_fields = {
            "source_lat": "Pickup location",
            "source_lng": "Pickup location",
            "destination_lat": "Drop-off location",
            "destination_lng": "Drop-off location",
            "distance_km": "Calculated distance",
            "estimated_fare": "Estimated fare",
        }

        for field, name in required_fields.items():
            if data.get(field) is None:
                raise serializers.ValidationError(
                    {
                        "error": f"Please calculate the fare before confirming. {name} is missing."
                    }
                )

        if data.get("estimated_fare", 0) <= 0:
            raise serializers.ValidationError({"error": "Invalid estimated fare."})

        return data


from .models import ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True)
    sender_role = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = [
            "id",
            "ride_request",
            "sender",
            "sender_name",
            "sender_role",
            "receiver",
            "message",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "sender",
            "sender_name",
            "sender_role",
            "receiver",
            "created_at",
        ]

    def get_sender_role(self, obj):
        # Determine if the sender was the rider or the driver for this specific ride
        if obj.sender == obj.ride_request.rider:
            return "rider"
        elif (
            hasattr(obj.sender, "driver_profile")
            and obj.sender.driver_profile == obj.ride_request.driver
        ):
            return "driver"
        return "system"
