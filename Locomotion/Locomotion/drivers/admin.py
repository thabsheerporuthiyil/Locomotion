from django.contrib import admin

from .models import (DriverApplication, DriverApplicationReview, DriverProfile,
                     DriverVehicle)

# Register your models here.
admin.site.register(DriverProfile)
admin.site.register(DriverApplicationReview)
admin.site.register(DriverApplication)
admin.site.register(DriverVehicle)
