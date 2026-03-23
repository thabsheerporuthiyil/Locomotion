from django.contrib import admin

from .models import ChatMessage, RideRequest

# Register your models here.
admin.site.register(RideRequest)
admin.site.register(ChatMessage)
