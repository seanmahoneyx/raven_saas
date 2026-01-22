# apps/api/v1/serializers/scheduling.py
"""
Serializers for Scheduling/Calendar views.

Uses the existing Order models (SalesOrder, PurchaseOrder) to provide
calendar-focused data structures.
"""
from rest_framework import serializers
from apps.orders.models import SalesOrder, PurchaseOrder
from apps.parties.models import Truck
from apps.scheduling.models import DeliveryRun, SchedulerNote  # app label: new_scheduling
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
    delivery_run_id = serializers.IntegerField(allow_null=True)
    delivery_run_name = serializers.CharField(allow_null=True)
    requested_date = serializers.DateField(allow_null=True)
    num_lines = serializers.IntegerField()
    total_quantity = serializers.IntegerField()
    priority = serializers.IntegerField()
    scheduler_sequence = serializers.IntegerField()
    notes = serializers.CharField(allow_blank=True)


class DeliveryRunSerializer(TenantModelSerializer):
    """Serializer for delivery runs."""
    truck_name = serializers.CharField(source='truck.name', read_only=True)
    order_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = DeliveryRun
        fields = [
            'id', 'name', 'truck', 'truck_name', 'scheduled_date',
            'sequence', 'departure_time', 'notes', 'is_complete',
            'order_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class DeliveryRunCreateSerializer(serializers.Serializer):
    """Serializer for creating delivery runs."""
    name = serializers.CharField(max_length=100)
    truck_id = serializers.IntegerField()
    scheduled_date = serializers.DateField()
    sequence = serializers.IntegerField(default=1)
    departure_time = serializers.TimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ScheduleUpdateSerializer(serializers.Serializer):
    """Serializer for schedule update requests."""
    scheduled_date = serializers.DateField(allow_null=True, required=False)
    scheduled_truck_id = serializers.IntegerField(allow_null=True, required=False)
    delivery_run_id = serializers.IntegerField(allow_null=True, required=False)
    scheduler_sequence = serializers.IntegerField(required=False)


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


class SchedulerNoteSerializer(TenantModelSerializer):
    """Serializer for scheduler notes."""
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    attachment_type = serializers.CharField(read_only=True)
    truck_id = serializers.IntegerField(source='truck.id', read_only=True, allow_null=True)
    delivery_run_id = serializers.IntegerField(source='delivery_run.id', read_only=True, allow_null=True)
    sales_order_id = serializers.IntegerField(source='sales_order.id', read_only=True, allow_null=True)
    purchase_order_id = serializers.IntegerField(source='purchase_order.id', read_only=True, allow_null=True)

    class Meta:
        model = SchedulerNote
        fields = [
            'id', 'content', 'color', 'scheduled_date',
            'truck_id', 'delivery_run_id', 'sales_order_id', 'purchase_order_id',
            'created_by', 'created_by_username', 'is_pinned',
            'attachment_type', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']


class SchedulerNoteCreateSerializer(serializers.Serializer):
    """Serializer for creating scheduler notes."""
    content = serializers.CharField()
    color = serializers.ChoiceField(
        choices=['yellow', 'blue', 'green', 'red', 'purple', 'orange'],
        default='yellow'
    )
    scheduled_date = serializers.DateField(required=False, allow_null=True)
    truck_id = serializers.IntegerField(required=False, allow_null=True)
    delivery_run_id = serializers.IntegerField(required=False, allow_null=True)
    sales_order_id = serializers.IntegerField(required=False, allow_null=True)
    purchase_order_id = serializers.IntegerField(required=False, allow_null=True)
    is_pinned = serializers.BooleanField(default=False)
