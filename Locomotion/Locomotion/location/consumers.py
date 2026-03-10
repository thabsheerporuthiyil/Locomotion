import json
from channels.generic.websocket import AsyncWebsocketConsumer

class LocationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.ride_id = self.scope['url_route']['kwargs']['ride_id']
        self.room_group_name = f'ride_{self.ride_id}'

        # Join the ride's room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        # Leave the ride's room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    # Receive message from WebSocket (Typically from Driver app)
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        latitude = text_data_json.get('latitude')
        longitude = text_data_json.get('longitude')
        heading = text_data_json.get('heading', 0)

        # Broadcast message to room group (To be received by Rider app)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'location_update',
                'latitude': latitude,
                'longitude': longitude,
                'heading': heading
            }
        )

    # Receive message from room group and forward it to the connected client
    async def location_update(self, event):
        latitude = event.get('latitude')
        longitude = event.get('longitude')
        heading = event.get('heading')

        # Send location payload to the web socket client
        await self.send(text_data=json.dumps({
            'latitude': latitude,
            'longitude': longitude,
            'heading': heading
        }))
