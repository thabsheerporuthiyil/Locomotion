from django.contrib import admin

from .models import District, Panchayath, Taluk

# Register your models here.
admin.site.register(District)
admin.site.register(Taluk)
admin.site.register(Panchayath)
