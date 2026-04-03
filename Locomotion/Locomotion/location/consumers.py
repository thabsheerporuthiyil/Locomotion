import json

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.cache import cache

from .location_history import enqueue_location_history_event


LOCATION_CACHE_TTL_SECONDS = 60 * 60


class LocationConsumer(AsyncWebsocketConsumer):
    def _cache_key(self, role):
        return f"ride_location:{self.ride_id}:{role}"

    async def connect(self):
        self.ride_id = self.scope["url_route"]["kwargs"]["ride_id"]  # type: ignore
        self.room_group_name = f"ride_{self.ride_id}"

        # Join the ride's room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # Late joiners should immediately receive the most recent cached locations.
        for role in ("driver", "rider"):
            cached_location = await sync_to_async(cache.get)(self._cache_key(role))
            if cached_location:
                await self.send(text_data=json.dumps(cached_location))

    async def disconnect(self, close_code):
        # Leave the ride's room group
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    # Receive message from WebSocket (Typically from Driver app)
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        latitude = text_data_json.get("latitude")
        longitude = text_data_json.get("longitude")
        heading = text_data_json.get("heading", 0)
        role = text_data_json.get("role", "unknown")  # e.g. 'driver' or 'rider'

        payload = {
            "latitude": latitude,
            "longitude": longitude,
            "heading": heading,
            "role": role,
        }

        if role in {"driver", "rider"} and latitude is not None and longitude is not None:
            await sync_to_async(cache.set)(
                self._cache_key(role),
                payload,
                timeout=LOCATION_CACHE_TTL_SECONDS,
            )
            await sync_to_async(enqueue_location_history_event)(
                ride_id=self.ride_id,
                role=role,
                latitude=latitude,
                longitude=longitude,
                heading=heading,
                source="websocket",
            )

        # Broadcast message to room group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "location_update",
                **payload,
            },
        )

    # Receive message from room group and forward it to the connected client
    async def location_update(self, event):
        latitude = event.get("latitude")
        longitude = event.get("longitude")
        heading = event.get("heading")
        role = event.get("role")

        # Send location payload to the web socket client
        await self.send(
            text_data=json.dumps(
                {
                    "latitude": latitude,
                    "longitude": longitude,
                    "heading": heading,
                    "role": role,
                }
            )
        )
