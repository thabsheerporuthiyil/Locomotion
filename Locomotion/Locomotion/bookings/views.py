import json
import random

import boto3
import requests
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Avg, Count
from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Notification
from drivers.permissions import IsActiveDriver
from drivers.tasks import sync_driver_to_qdrant

from .models import ChatMessage, RideRequest
from .serializers import (RideRatingSerializer, RideRequestCreateSerializer, RideRequestSerializer)
from .serializers import ChatMessageSerializer


def _get_active_fcm_tokens(user):
    if not user:
        return []

    tokens = list(
        user.fcm_devices.filter(is_active=True)
        .values_list("token", flat=True)
        .distinct()
    )

    legacy_token = getattr(user, "fcm_device_token", None)
    if legacy_token and legacy_token not in tokens:
        tokens.append(legacy_token)

    return [token for token in tokens if token]


 # Calculate an estimated fare for a ride before booking.
class CalculateFareView(APIView):
    permission_classes = [AllowAny]

    @swagger_auto_schema(
        operation_description="Calculate estimated fare for a ride",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                "pickup_lat": openapi.Schema(type=openapi.TYPE_NUMBER),
                "pickup_lon": openapi.Schema(type=openapi.TYPE_NUMBER),
                "dropoff_lat": openapi.Schema(type=openapi.TYPE_NUMBER),
                "dropoff_lon": openapi.Schema(type=openapi.TYPE_NUMBER),
                "vehicle_category": openapi.Schema(type=openapi.TYPE_STRING),
            },
        ),
        responses={200: "Estimated fare details", 400: "Bad Request"},
    )
    def post(self, request):
        try:
            pickup_lat = request.data.get("pickup_lat")
            pickup_lon = request.data.get("pickup_lon")
            dropoff_lat = request.data.get("dropoff_lat")
            dropoff_lon = request.data.get("dropoff_lon")

            if not all([pickup_lat, pickup_lon, dropoff_lat, dropoff_lon]):
                return Response(
                    {"error": "Missing coordinates"}, status=status.HTTP_400_BAD_REQUEST
                )

            vehicle_category = request.data.get("vehicle_category", "").lower()
            is_two_wheeler = any(
                word in vehicle_category
                for word in ["two", "2", "bike", "scooter", "motorcycle"]
            )

            if is_two_wheeler:
                BASE_FARE = 25.0
                PER_KM_RATE = 8.0
                PER_MIN_RATE = 1.0
            else:
                BASE_FARE = 50.0
                PER_KM_RATE = 15.0
                PER_MIN_RATE = 2.0

            ORS_API_KEY = getattr(settings, "ORS_API_KEY", None)
            if not ORS_API_KEY:
                return Response(
                    {
                        "error": "Please set the ORS_API_KEY in settings.py to calculate fares."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            headers = {
                "Accept": "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8",
                "Authorization": ORS_API_KEY,
                "Content-Type": "application/json; charset=utf-8",
            }
            body = {
                "coordinates": [
                    [float(pickup_lon), float(pickup_lat)],
                    [float(dropoff_lon), float(dropoff_lat)],
                ],
                "options": {
                    "avoid_features": ["ferries", "tollways"],
                },
            }
            url = "https://api.openrouteservice.org/v2/directions/driving-car"

            response = requests.post(url, json=body, headers=headers)

            print(f"ORS API STATUS: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                if "routes" in data and len(data["routes"]) > 0:
                    summary = data["routes"][0]["summary"]
                    distance_m = summary["distance"]
                    duration_s = summary["duration"]

                    distance_km = distance_m / 1000.0

                    TRAFFIC_MULTIPLIER = 1.75
                    duration_min = (duration_s / 60.0) * TRAFFIC_MULTIPLIER

                    ride_fare = (
                        BASE_FARE
                        + (distance_km * PER_KM_RATE)
                        + (duration_min * PER_MIN_RATE)
                    )

                    if distance_km <= 5.0:
                        SERVICE_CHARGE = 10.0
                    elif distance_km <= 10.0:
                        SERVICE_CHARGE = 15.0
                    elif distance_km <= 20.0:
                        SERVICE_CHARGE = 25.0
                    else:
                        SERVICE_CHARGE = 35.0

                    total_estimated_fare = ride_fare + SERVICE_CHARGE

                    return Response(
                        {
                            "distance_km": round(distance_km, 2),
                            "duration_min": round(duration_min, 0),
                            "ride_fare": round(ride_fare, 2),
                            "service_charge": round(SERVICE_CHARGE, 2),
                            "estimated_fare": round(total_estimated_fare, 2),
                        },
                        status=status.HTTP_200_OK,
                    )
                else:
                    return Response(
                        {"error": "No route found"}, status=status.HTTP_400_BAD_REQUEST
                    )
            else:
                print(f"ORS ERROR DETAILS: {response.text}")
                return Response(
                    {
                        "error": "Failed to fetch route details",
                        "details": response.text,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

# Create a new ride request for the authenticated rider.
class CreateRideRequestView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _normalize_serializer_errors(errors):
        if (
            "error" in errors
            and isinstance(errors["error"], list)
            and len(errors["error"]) == 1
        ):
            normalized = dict(errors)
            normalized["error"] = errors["error"][0]
            return normalized
        return errors

    @swagger_auto_schema(
        operation_description="Create a new ride request",
        request_body=RideRequestCreateSerializer,
        responses={201: RideRequestCreateSerializer, 400: "Bad Request"},
    )
    def post(self, request):
        user = request.user

        provided_phone = request.data.get("rider_phone_number")
        if not user.phone_number and not provided_phone:
            return Response(
                {"error": "A valid mobile number is required to book a ride."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RideRequestCreateSerializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():

            if not user.phone_number and provided_phone:
                user.phone_number = provided_phone
                user.save()

            distance_km = serializer.validated_data.get("distance_km", 0) # type: ignore

            # --- Service Charge Logic ---
            if distance_km <= 5.0:
                service_charge = 10.0
            elif distance_km <= 10.0:
                service_charge = 15.0
            elif distance_km <= 20.0:
                service_charge = 25.0
            else:
                service_charge = 35.0

            ride_otp = str(random.randint(1000, 9999))
            ride_request = serializer.save(
                rider=user, ride_otp=ride_otp, service_charge=service_charge
            )
            # --- Email Notification ---
            driver_profile = ride_request.driver # type: ignore
            if (
                driver_profile
                and hasattr(driver_profile, "user")
                and driver_profile.user.email
            ):
                try:
                    from django.conf import settings
                    from django.core.mail import send_mail

                    subject = "New Ride Request - Locomotion"
                    message = f"New ride request from {ride_request.source_location} to {ride_request.destination_location}. Please check Locomotion App." # type: ignore
                    pickup = ride_request.source_location  # type: ignore
                    dropoff = ride_request.destination_location  # type: ignore

                    html_message = f"""
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px;">
                    <h2 style="color: #3b82f6;">New Ride Request</h2>
                    <p style="font-size: 16px; color: #333;">You have a new ride request waiting in your dashboard.</p>

                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
                    <p style="margin: 5px 0;"><strong>Pickup:</strong> {pickup}</p>
                    <p style="margin: 5px 0;"><strong>Dropoff:</strong> {dropoff}</p>
                    </div>

                    <p style="color: #555;">Please log in to the <strong>Locomotion Driver Dashboard</strong> to accept or reject this ride.</p>
                    </div>
                    """
                    send_mail(
                        subject=subject,
                        message=message,
                        from_email=getattr(
                            settings, "EMAIL_HOST_USER", "locomotion@example.com"
                        ),
                        recipient_list=[driver_profile.user.email],
                        fail_silently=False,
                        html_message=html_message,
                    )
                    print(f"Email sent successfully to {driver_profile.user.email}")
                except Exception as e:
                    print(f"Failed to send Email Notification: {e}")

            # --- Push Notification via AWS SQS ---
            driver_profile = ride_request.driver # type: ignore
            if driver_profile and hasattr(driver_profile, "user"):
                tokens = _get_active_fcm_tokens(driver_profile.user)
                try:
                    sqs = boto3.client(
                        "sqs",
                        region_name=getattr(
                            settings,
                            "AWS_SQS_REGION",
                            getattr(settings, "AWS_REGION", "ap-south-1"),
                        ),
                        aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                        aws_secret_access_key=getattr(
                            settings, "AWS_SECRET_ACCESS_KEY", None
                        ),
                    )

                    queue_url = getattr(settings, "AWS_SQS_QUEUE_URL", None)

                    if queue_url and tokens:
                        message_body = {
                            "fcm_token": tokens[0],
                            "title": "New Ride Request! 🚗",
                            "body": f"From: {ride_request.source_location} To: {ride_request.destination_location}", # type: ignore
                            "data": {
                                "ride_id": str(ride_request.id), # type: ignore
                                "type": "new_ride",
                            },
                        }

                        Notification.objects.create(
                            user=driver_profile.user,
                            title=message_body.get("title") or "Ride Update",
                            body=message_body.get("body") or "",
                            data=message_body.get("data") or {},
                        )

                        for token in tokens:
                            message_body["fcm_token"] = token
                            sqs.send_message(
                                QueueUrl=queue_url, MessageBody=json.dumps(message_body)
                            )
                        print(
                            "Successfully pushed notification to SQS for "
                            f"{len(tokens)} device(s) for driver {driver_profile.user.email}"
                        )
                except Exception as e:
                    print(f"Failed to send SQS notification: {e}")

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(
            self._normalize_serializer_errors(serializer.errors),
            status=status.HTTP_400_BAD_REQUEST,
        )

# List the assigned and active ride requests for a driver.
class DriverRideRequestListView(APIView):
    permission_classes = [IsActiveDriver]

    @swagger_auto_schema(
        operation_description="List available ride requests for the driver",
        responses={200: RideRequestSerializer(many=True)},
    )
    def get(self, request):
        driver_profile = request.user.driver_profile

        # Block drivers with a wallet balance below -100
        if driver_profile.wallet_balance <= -100.00:
            return Response([])

        queryset = RideRequest.objects.filter(
            driver=driver_profile,
            status__in=["pending", "accepted", "arrived", "in_progress", "completed"],
        ).order_by("-created_at")

        serializer = RideRequestSerializer(
            queryset, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

# List the current rider's ride history.
class RiderRideRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="List all past and current ride requests for the rider",
        responses={200: RideRequestSerializer(many=True)},
    )
    def get(self, request):
        queryset = RideRequest.objects.filter(rider=request.user).order_by(
            "-created_at"
        )
        serializer = RideRequestSerializer(
            queryset, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

# Return, update, or delete a specific ride when the user is involved in it.
class RideRequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="Get details of a specific ride request",
        responses={200: RideRequestSerializer, 403: "Forbidden", 404: "Not Found"},
    )
    def get(self, request, pk):
        try:
            ride_request = RideRequest.objects.get(pk=pk)
            is_rider = request.user == ride_request.rider
            is_driver = (
                hasattr(request.user, "driver_profile")
                and request.user.driver_profile == ride_request.driver
            )

            if not (is_rider or is_driver):
                return Response(
                    {"error": "Not authorized to view this ride."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            serializer = RideRequestSerializer(
                ride_request, context={"request": request}
            )
            return Response(serializer.data, status=status.HTTP_200_OK)
        except RideRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

    @swagger_auto_schema(
        operation_description="Update a specific ride request",
        request_body=RideRequestSerializer,
        responses={200: RideRequestSerializer, 400: "Bad Request", 404: "Not Found"},
    )
    def put(self, request, pk):
        try:
            ride_request = RideRequest.objects.get(pk=pk)
            serializer = RideRequestSerializer(
                ride_request, data=request.data, context={"request": request}
            )
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except RideRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

    @swagger_auto_schema(
        operation_description="Delete a specific ride request",
        responses={204: "No Content", 404: "Not Found"},
    )
    def delete(self, request, pk):
        try:
            ride_request = RideRequest.objects.get(pk=pk)
            ride_request.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except RideRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

# Perform status-changing ride actions for the assigned driver.
class RideRequestActionView(APIView):
    permission_classes = [IsActiveDriver]

    @swagger_auto_schema(
        operation_description="Perform an action on a ride request (accept, reject, arrive, start_trip, complete, cancel, confirm_payment)",
        manual_parameters=[
            openapi.Parameter(
                "action",
                openapi.IN_PATH,
                description="Action to perform",
                type=openapi.TYPE_STRING,
            )
        ],
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                "otp": openapi.Schema(
                    type=openapi.TYPE_STRING,
                    description="Required only for start_trip action",
                )
            },
        ),
        responses={200: "Success", 400: "Bad Request", 404: "Not Found"},
    )
    def post(self, request, pk, action):
        try:
            ride_request = RideRequest.objects.get(
                pk=pk, driver=request.user.driver_profile
            )
        except RideRequest.DoesNotExist:
            return Response(
                {"error": "Ride request not found or you are not the assigned driver."},
                status=status.HTTP_404_NOT_FOUND,
            )

        valid_actions = [
            "accept",
            "reject",
            "arrive",
            "start_trip",
            "complete",
            "cancel",
            "confirm_payment",
        ]
        if action not in valid_actions:
            return Response(
                {
                    "error": f'Invalid action. Valid actions are: {", ".join(valid_actions)}'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action in ["accept", "reject"] and ride_request.status != "pending":
            return Response(
                {
                    "error": f"Cannot {action} a ride that is currently {ride_request.status}."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "arrive" and ride_request.status != "accepted":
            return Response(
                {"error": "Cannot arrive for a ride that has not been accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "start_trip" and ride_request.status != "arrived":
            return Response(
                {"error": "Cannot start a trip before arriving."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "complete" and ride_request.status != "in_progress":
            return Response(
                {"error": "Cannot complete a ride that has not started."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "confirm_payment" and ride_request.status != "completed":
            return Response(
                {"error": "Cannot confirm payment for an incomplete ride."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "accept":
            ride_request.status = "accepted"

            # --- Email Notification to Rider ---
            rider_email = getattr(ride_request.rider, 'email', None)
            print(f"[DEBUG] Ride {ride_request.id} Accepted - Attempting to email Rider at: {rider_email}") # type:ignore
            if rider_email:
                try:
                    subject = "Ride Accepted - Locomotion"
                    message = f"Hello,\n\nYour ride from {ride_request.source_location} to {ride_request.destination_location} has been accepted by {ride_request.driver.user.name}.\n\nThe driver is on their way.\n\nThank you,\nThe Locomotion Team"
                    html_message = f"""
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px;">
                        <h2 style="color: #3b82f6;">Ride Accepted! 🚗</h2>
                        <p style="font-size: 16px; color: #333;">Great news! Your ride request has been accepted.</p>
                        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;"> 
                            <p style="margin: 5px 0;"><strong>Driver:</strong> {ride_request.driver.user.name}</p>
                            <p style="margin: 5px 0;"><strong>Pickup:</strong> {ride_request.source_location}</p>
                            <p style="margin: 5px 0;"><strong>Dropoff:</strong> {ride_request.destination_location}</p>
                            <p style="margin: 5px 0;"><strong>Vehicle OTP:</strong> <span style="font-size: 18px; font-weight: bold; letter-spacing: 2px;">{ride_request.ride_otp}</span></p>
                        </div> 
                        <p style="color: #555;">To see their live location, please check the <strong>Locomotion Web Portal</strong> in the My Rides section.</p>
                    </div>
                    """
                    send_mail(
                        subject=subject,
                        message=message,
                        from_email=getattr(
                            settings, "EMAIL_HOST_USER", "locomotion@example.com"
                        ),
                        recipient_list=[rider_email],
                        fail_silently=True,
                        html_message=html_message
                    )
                except Exception as e:
                    print(f"Failed to send acceptance email to {rider_email}: {e}")
        elif action == "reject":
            ride_request.status = "rejected"
        elif action == "arrive":
            ride_request.status = "arrived"
        elif action == "start_trip":
            provided_otp = request.data.get("otp")
            if not provided_otp or provided_otp != ride_request.ride_otp:
                return Response(
                    {"error": "Invalid OTP."}, status=status.HTTP_400_BAD_REQUEST
                )
            ride_request.status = "in_progress"
        elif action == "complete":
            ride_request.status = "completed"

            # --- Prepaid Commission Wallet Deduction ---
            driver_profile = ride_request.driver
            if ride_request.service_charge:
                old_balance = driver_profile.wallet_balance
                driver_profile.wallet_balance -= ride_request.service_charge
                driver_profile.save()

                if old_balance > -100.00 and driver_profile.wallet_balance <= -100.00:
                    driver_email = getattr(driver_profile.user, 'email', None)
                    if driver_email:
                        try:
                            send_mail(
                                subject="Action Required: Locomotion Account Blocked Due to Low Balance",
                                message=f"Hello,\n\nYour driver wallet balance has dropped to {driver_profile.wallet_balance} INR, which is below the minimum required balance of -100.00 INR.\n\nAs a result, your account has been temporarily blocked from receiving new ride requests. To resume driving, please login to the Locomotion Web Portal and recharge your wallet.\n\nThank you,\nThe Locomotion Team",
                                from_email=getattr(
                            settings, "EMAIL_HOST_USER", "locomotion@example.com"
                        ),
                                recipient_list=[driver_email],
                                fail_silently=True,
                            )
                        except Exception as e:
                            print(f"Failed to send wallet block email to {driver_email}: {e}")

        elif action == "confirm_payment":
            ride_request.is_paid = True

        elif action == "cancel":
            ride_request.status = "cancelled"

        ride_request.save()

        # --- Push Notification to Rider via AWS SQS ---
        # Only notify for statuses that the rider cares about in real-time
        if action in ["accept", "arrive", "start_trip", "complete", "cancel", "confirm_payment"]:
            rider = ride_request.rider
            if rider:
                tokens = _get_active_fcm_tokens(rider)
                try:
                    sqs = boto3.client(
                        "sqs",
                        region_name=getattr(
                            settings,
                            "AWS_SQS_REGION",
                            getattr(settings, "AWS_REGION", "ap-south-1"),
                        ),
                        aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                        aws_secret_access_key=getattr(
                            settings, "AWS_SECRET_ACCESS_KEY", None
                        ),
                    )

                    queue_url = getattr(settings, "AWS_SQS_QUEUE_URL", None)

                    if queue_url and tokens:
                        # Determine message based on action
                        titles = {
                            "accept": "Ride Accepted! ✅",
                            "arrive": "Driver Arrived! 🚕",
                            "start_trip": "Trip Started! 🛣️",
                            "complete": "Trip Completed! 🏁",
                            "cancel": "Ride Cancelled ❌",
                        }
                        bodies = {
                            "accept": f"{ride_request.driver.user.name} is on the way.",
                            "arrive": f"{ride_request.driver.user.name} has arrived at the pickup location.",
                            "start_trip": "Your trip has started. Have a safe journey!",
                            "complete": f"You have reached your destination. Fare: ₹{ride_request.estimated_fare}",
                            "cancel": "Your ride has been cancelled.",
                        } 

                        message_body = {
                            "fcm_token": tokens[0],
                            "title": titles.get(action, "Ride Update"),
                            "body": bodies.get(action, "Your ride status has changed."),
                            "data": {
                                "ride_id": str(ride_request.id), # type: ignore
                                "type": "ride_update",
                                "status": ride_request.status,
                            },
                        }
                        if action == "confirm_payment":
                            message_body["title"] = "Payment Completed!"
                            message_body["body"] = (
                                f"Payment for your trip with {ride_request.driver.user.name} "
                                "has been confirmed."
                            )
                            message_body["data"]["type"] = "payment_completed"

                        Notification.objects.create(
                            user=rider,
                            title=message_body.get("title") or "Ride Update",
                            body=message_body.get("body") or "",
                            data=message_body.get("data") or {},
                        )

                        for token in tokens:
                            message_body["fcm_token"] = token
                            sqs.send_message(
                                QueueUrl=queue_url, MessageBody=json.dumps(message_body)
                            )
                        print(
                            f"Successfully pushed {action} notification to SQS for "
                            f"{len(tokens)} device(s) for rider {rider.email}"
                        )
                except Exception as e:
                    print(f"Failed to send SQS notification to rider: {e}")

        serializer = RideRequestSerializer(ride_request, context={"request": request})
        return Response(
            {
                "message": f"Ride request {action}ed successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

# Submit a rider rating and feedback for a completed ride.
class RateRideView(APIView):
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="Rate a completed ride",
        request_body=RideRatingSerializer,
        responses={
            200: "Rating submitted successfully.",
            400: "Bad Request",
            404: "Not Found",
        },
    )
    def post(self, request, pk):
        try:
            ride = RideRequest.objects.get(pk=pk, rider=request.user)
        except RideRequest.DoesNotExist:
            return Response(
                {"error": "Ride not found or unauthorized."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if ride.status != "completed":
            return Response(
                {"error": "Only completed rides can be rated."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ride.rating is not None:
            return Response(
                {"error": "This ride has already been rated."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RideRatingSerializer(data=request.data)
        if serializer.is_valid():
            ride.rating = serializer.validated_data["rating"] # type: ignore
            ride.feedback = serializer.validated_data.get("feedback", "") # type: ignore
            ride.save()

            # Update Driver's Average Rating
            driver_profile = ride.driver
            # Recalculate average based on all completed, rated rides
            stats = RideRequest.objects.filter(
                driver=driver_profile, rating__isnull=False
            ).aggregate(avg_rating=Avg("rating"), count=Count("rating"))

            driver_profile.average_rating = round(stats["avg_rating"] or 0.0, 1)
            driver_profile.total_ratings = stats["count"]
            driver_profile.save()

            # Trigger background AI synchronization to include the new review
            sync_driver_to_qdrant.delay(driver_profile.id) # type: ignore

            return Response(
                {"message": "Rating submitted successfully."}, status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# Return the chat history for a ride involving the current user.
class ChatHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="Get all chat messages for a specific ride",
        responses={
            200: ChatMessageSerializer(many=True),
            403: "Forbidden",
            404: "Not Found",
        },
    )
    def get(self, request, pk):
        try:
            ride = RideRequest.objects.get(pk=pk)
            # Verify user is involved in the ride
            is_rider = request.user == ride.rider
            is_driver = (
                hasattr(request.user, "driver_profile")
                and request.user.driver_profile == ride.driver
            )
            if not (is_rider or is_driver):
                return Response(
                    {"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN
                )

            messages = ChatMessage.objects.filter(ride_request=ride).order_by(
                "created_at"
            )
            serializer = ChatMessageSerializer(messages, many=True)
            return Response(serializer.data)
        except RideRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

# Send a ride chat message from the authenticated rider or driver.
class SendMessageView(APIView):
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="Send a message for a specific ride. Ride status must be active.",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                "message": openapi.Schema(
                    type=openapi.TYPE_STRING, description="The message text"
                )
            },
            required=["message"],
        ),
        responses={
            201: ChatMessageSerializer,
            400: "Bad Request",
            403: "Forbidden",
            404: "Not Found",
        },
    )
    def post(self, request, pk):
        try:
            ride = RideRequest.objects.get(pk=pk)
            is_rider = request.user == ride.rider
            is_driver = (
                hasattr(request.user, "driver_profile")
                and request.user.driver_profile == ride.driver
            )
            if not (is_rider or is_driver):
                return Response(
                    {"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN
                )

            if ride.status not in ["accepted", "arrived", "in_progress"]:
                return Response(
                    {"error": "Chat is only available during active rides."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            message_text = request.data.get("message")
            if not message_text:
                return Response(
                    {"error": "Message text is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Determine sender and receiver
            sender = request.user
            receiver = ride.driver.user if is_rider else ride.rider

            chat_message = ChatMessage.objects.create(
                ride_request=ride,
                sender=sender,
                receiver=receiver,
                message=message_text,
            )

            Notification.objects.create(
                user=receiver,
                title=f"New Message from {'Rider' if is_rider else 'Driver'}",
                body=message_text,
                data={
                    "ride_id": str(ride.id), # type: ignore
                    "type": "chat_message",
                    "message_id": str(chat_message.id), # type: ignore
                    "sender_name": sender.name,
                },
            )

            # --- Push Notification via AWS SQS ---
            if receiver:
                tokens = _get_active_fcm_tokens(receiver)
                try:
                    sqs = boto3.client(
                        "sqs",
                        region_name=getattr(
                            settings,
                            "AWS_SQS_REGION",
                            getattr(settings, "AWS_REGION", "ap-south-1"),
                        ),
                        aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                        aws_secret_access_key=getattr(
                            settings, "AWS_SECRET_ACCESS_KEY", None
                        ),
                    )
                    queue_url = getattr(settings, "AWS_SQS_QUEUE_URL", None)

                    if queue_url and tokens:
                        message_body = {
                            "fcm_token": tokens[0],
                            "title": f"New Message from {'Rider' if is_rider else 'Driver'}",
                            "body": message_text,
                            "data": {
                                "ride_id": str(ride.id), # type: ignore
                                "type": "chat_message",
                                "message_id": str(chat_message.id), # type: ignore
                                "sender_name": sender.name,
                                "message_text": message_text,
                            },
                        }
                        for token in tokens:
                            message_body["fcm_token"] = token
                            sqs.send_message(
                                QueueUrl=queue_url, MessageBody=json.dumps(message_body)
                            )
                except Exception as e:
                    print(f"Failed to send Chat SQS notification: {e}")

            serializer = ChatMessageSerializer(chat_message)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except RideRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
