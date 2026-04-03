from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from bookings.models import RideRequest
from drivers.models import DriverProfile
from location.location_history import (
    build_location_history_item,
    enqueue_location_history_event,
    query_location_history,
    should_sample_location_history_event,
    write_location_history_event,
)
from location.models import District, Panchayath, Taluk
from location.tasks import record_location_history_event

User = get_user_model()


class LocationHistoryTests(TestCase):
    def setUp(self):
        district = District.objects.create(name="Malappuram")
        taluk = Taluk.objects.create(district=district, name="Perinthalmanna")
        panchayath = Panchayath.objects.create(taluk=taluk, name="Puzhakkattiri")

        self.rider = User.objects.create_user(
            email="rider@example.com",
            name="Rider",
            password="StrongPass123!",
        )
        self.driver_user = User.objects.create_user(
            email="driver@example.com",
            name="Driver",
            password="StrongPass123!",
        )
        self.driver = DriverProfile.objects.create(
            user=self.driver_user,
            phone_number="9876543210",
            experience_years=3,
            service_type="driver_only",
            panchayath=panchayath,
        )
        self.ride = RideRequest.objects.create(
            rider=self.rider,
            driver=self.driver,
            source_location="Source",
            source_lat=10.9981,
            source_lng=76.2273,
            destination_location="Destination",
            destination_lat=11.0025,
            destination_lng=76.2454,
            status="accepted",
        )

    @override_settings(
        LOCATION_HISTORY_ENABLED=True,
        DYNAMODB_LOCATION_TABLE="locomotion-location-history",
        AWS_DYNAMODB_REGION="ap-south-1",
        LOCATION_HISTORY_TTL_DAYS=180,
    )
    def test_build_location_history_item_contains_expected_fields(self):
        recorded_at = timezone.make_aware(datetime(2026, 4, 3, 9, 0, 0))

        item = build_location_history_item(
            ride=self.ride,
            role="driver",
            latitude="11.123456",
            longitude="76.654321",
            heading="135",
            source="websocket",
            recorded_at=recorded_at,
        )

        self.assertEqual(item["ride_id"], str(self.ride.id))
        self.assertEqual(item["role"], "driver")
        self.assertEqual(item["actor_user_id"], self.driver_user.id)
        self.assertEqual(item["rider_id"], self.rider.id)
        self.assertEqual(item["driver_profile_id"], self.driver.id)
        self.assertEqual(item["driver_user_id"], self.driver_user.id)
        self.assertEqual(item["booking_status"], "accepted")
        self.assertEqual(item["source"], "websocket")
        self.assertEqual(item["latitude"], Decimal("11.123456"))
        self.assertEqual(item["longitude"], Decimal("76.654321"))
        self.assertEqual(item["heading"], Decimal("135"))
        self.assertEqual(item["event_ts"], "2026-04-03T03:30:00+00:00")
        self.assertEqual(
            item["expires_at"],
            int((recorded_at + timedelta(days=180)).timestamp()),
        )

    @override_settings(
        LOCATION_HISTORY_ENABLED=False,
        DYNAMODB_LOCATION_TABLE="locomotion-location-history",
        AWS_DYNAMODB_REGION="ap-south-1",
    )
    @patch("location.location_history.boto3.resource")
    def test_write_location_history_event_skips_when_disabled(self, mock_resource):
        item = write_location_history_event(
            ride=self.ride,
            role="rider",
            latitude=10.0,
            longitude=76.0,
        )

        self.assertIsNone(item)
        mock_resource.assert_not_called()

    @override_settings(
        LOCATION_HISTORY_ENABLED=True,
        DYNAMODB_LOCATION_TABLE="locomotion-location-history",
        AWS_DYNAMODB_REGION="ap-south-1",
    )
    @patch("location.location_history.boto3.resource")
    def test_write_location_history_event_writes_to_dynamodb(self, mock_resource):
        mock_table = MagicMock()
        mock_resource.return_value.Table.return_value = mock_table

        item = write_location_history_event(
            ride=self.ride,
            role="driver",
            latitude=11.1,
            longitude=76.2,
            heading=90,
            source="api",
        )

        mock_resource.assert_called_once_with("dynamodb", region_name="ap-south-1")
        mock_resource.return_value.Table.assert_called_once_with(
            "locomotion-location-history"
        )
        mock_table.put_item.assert_called_once_with(Item=item)

    @override_settings(
        LOCATION_HISTORY_ENABLED=True,
        DYNAMODB_LOCATION_TABLE="locomotion-location-history",
        AWS_DYNAMODB_REGION="ap-south-1",
    )
    @patch("location.location_history.get_location_history_table")
    def test_query_location_history_reads_and_normalizes_results(self, mock_get_table):
        mock_table = MagicMock()
        mock_get_table.return_value = mock_table
        mock_table.query.return_value = {
            "Items": [
                {
                    "ride_id": str(self.ride.id),
                    "event_ts": "2026-04-03T03:30:00+00:00",
                    "latitude": Decimal("11.123456"),
                    "longitude": Decimal("76.654321"),
                    "heading": Decimal("90"),
                    "role": "driver",
                }
            ],
            "LastEvaluatedKey": {
                "ride_id": str(self.ride.id),
                "event_ts": "2026-04-03T03:30:00+00:00",
            },
        }

        result = query_location_history(self.ride.id, limit=100, forward=False)

        self.assertEqual(result["items"][0]["latitude"], 11.123456)
        self.assertEqual(result["items"][0]["longitude"], 76.654321)
        self.assertEqual(result["items"][0]["heading"], 90)
        self.assertEqual(
            result["last_evaluated_key"]["event_ts"], "2026-04-03T03:30:00+00:00"
        )
        mock_table.query.assert_called_once()
        query_kwargs = mock_table.query.call_args.kwargs
        self.assertEqual(query_kwargs["Limit"], 100)
        self.assertFalse(query_kwargs["ScanIndexForward"])

    @override_settings(
        LOCATION_HISTORY_ENABLED=True,
        DYNAMODB_LOCATION_TABLE="locomotion-location-history",
        AWS_DYNAMODB_REGION="ap-south-1",
    )
    @patch("location.tasks.write_location_history_event")
    def test_record_location_history_event_task_uses_helper(self, mock_write):
        mock_write.return_value = {"event_ts": "2026-04-03T03:30:00+00:00"}

        result = record_location_history_event(
            ride_id=self.ride.id,
            role="driver",
            latitude=11.1,
            longitude=76.2,
            heading=90,
            source="websocket",
        )

        mock_write.assert_called_once()
        self.assertEqual(result["saved"], True)
        self.assertEqual(result["ride_id"], str(self.ride.id))
        self.assertEqual(result["event_ts"], "2026-04-03T03:30:00+00:00")

    @override_settings(
        LOCATION_HISTORY_ENABLED=True,
        DYNAMODB_LOCATION_TABLE="locomotion-location-history",
        AWS_DYNAMODB_REGION="ap-south-1",
        LOCATION_HISTORY_SAMPLE_SECONDS=5,
    )
    @patch("location.location_history.cache.add")
    def test_should_sample_location_history_event_uses_cache_guard(self, mock_cache_add):
        mock_cache_add.return_value = True

        allowed = should_sample_location_history_event(self.ride.id, "driver")

        self.assertTrue(allowed)
        mock_cache_add.assert_called_once_with(
            f"ride_location_history:last_sample:{self.ride.id}:driver",
            "1",
            timeout=5,
        )

    @override_settings(
        LOCATION_HISTORY_ENABLED=True,
        DYNAMODB_LOCATION_TABLE="locomotion-location-history",
        AWS_DYNAMODB_REGION="ap-south-1",
        LOCATION_HISTORY_SAMPLE_SECONDS=5,
    )
    @patch("location.location_history._dispatch_location_history_task")
    @patch("location.location_history.cache.add")
    def test_enqueue_location_history_event_dispatches_when_sample_allowed(
        self,
        mock_cache_add,
        mock_dispatch,
    ):
        mock_cache_add.return_value = True

        queued = enqueue_location_history_event(
            ride_id=self.ride.id,
            role="driver",
            latitude=11.1,
            longitude=76.2,
            heading=45,
            source="api",
        )

        self.assertTrue(queued)
        mock_dispatch.assert_called_once_with(
            ride_id=self.ride.id,
            role="driver",
            latitude=11.1,
            longitude=76.2,
            heading=45,
            source="api",
        )

    @override_settings(
        LOCATION_HISTORY_ENABLED=True,
        DYNAMODB_LOCATION_TABLE="locomotion-location-history",
        AWS_DYNAMODB_REGION="ap-south-1",
        LOCATION_HISTORY_SAMPLE_SECONDS=5,
    )
    @patch("location.location_history._dispatch_location_history_task")
    @patch("location.location_history.cache.add")
    def test_enqueue_location_history_event_skips_when_sample_blocked(
        self,
        mock_cache_add,
        mock_dispatch,
    ):
        mock_cache_add.return_value = False

        queued = enqueue_location_history_event(
            ride_id=self.ride.id,
            role="rider",
            latitude=11.1,
            longitude=76.2,
            source="websocket",
        )

        self.assertFalse(queued)
        mock_dispatch.assert_not_called()
