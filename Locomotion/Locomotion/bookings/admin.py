from django.contrib import admin

from .models import RideRequest,ChatMessage

# Register your models here.
admin.site.register(RideRequest)
admin.site.register(ChatMessage)
