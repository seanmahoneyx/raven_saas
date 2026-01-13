# apps/api/v1/serializers/scheduling.py
"""
Serializers for Scheduling/Calendar views.

Uses the existing Order models (SalesOrder, PurchaseOrder) to provide
calendar-focused data structures.
"""
from rest_framework import serializers
from apps.orders.models import SalesOrder, PurchaseOrder
from apps.parties.models import Truck
from .base import TenantModelSerializer


class CalendarOrderSerializer(serializers.Serializer):
    """Serializer for calendar order view - unified SO/PO format."""
    id = serializers.IntegerField()
    order_type = serializers.CharField()  # 'SO' or 'PO'
    number = serializers.CharField()
    status = serializers.CharField()
    party_name = serializers.CharField()  # customer or vendor name
    scheduled_date = serializers.DateField(allow_null=True)
    scheduled_truck_id = serializers.IntegerField(allow_null=True)
    scheduled_truck_name = serializers.CharField(allow_null=True)
    num_lines = serializers.IntegerField()
    total_quantity = serializers.IntegerField()
    priority = serializers.IntegerField()
    notes = serializers.CharField(allow_blank=True)


class ScheduleUpdateSerializer(serializers.Serializer):
    """Serializer for schedule update requests."""
    scheduled_date = serializers.DateField(allow_null=True, required=False)
    scheduled_truck_id = serializers.IntegerField(allow_null=True, required=False)


class CalendarDaySerializer(serializers.Serializer):
    """Serializer for a single calendar day."""
    date = serializers.DateField()
    orders = CalendarOrderSerializer(many=True)
    total_orders = serializers.IntegerField()


class TruckCalendarSerializer(serializers.Serializer):
    """Serializer for truck-grouped calendar data."""
    truck_id = serializers.IntegerField(allow_null=True)
    truck_name = serializers.CharField(allow_null=True)
    days = CalendarDaySerializer(many=True)
