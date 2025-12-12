from django.contrib import admin
from .models import Truck

@admin.register(Truck)
class TruckAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active')