from rest_framework import serializers
from apps.logistics.models import LicensePlate, DeliveryStop
from .base import TenantModelSerializer


class LicensePlateSerializer(TenantModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    customer_name = serializers.CharField(source='order.customer.party.display_name', read_only=True)
    run_name = serializers.CharField(source='run.name', read_only=True, allow_null=True)

    class Meta:
        model = LicensePlate
        fields = [
            'id', 'code', 'order', 'order_number', 'customer_name',
            'run', 'run_name', 'weight_lbs', 'status', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class DeliveryStopListSerializer(TenantModelSerializer):
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    address = serializers.SerializerMethodField()
    order_count = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryStop
        fields = [
            'id', 'run', 'customer', 'customer_name', 'address',
            'sequence', 'status', 'order_count',
            'signed_by', 'delivered_at',
        ]

    def get_address(self, obj):
        if obj.ship_to:
            loc = obj.ship_to
            return f"{loc.address_line1 or ''}, {loc.city or ''}, {loc.state or ''} {loc.postal_code or ''}".strip(', ')
        return ''

    def get_order_count(self, obj):
        return obj.orders.count()


class DeliveryStopDetailSerializer(TenantModelSerializer):
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    address = serializers.SerializerMethodField()
    orders = serializers.SerializerMethodField()
    lpns = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryStop
        fields = [
            'id', 'run', 'customer', 'customer_name', 'address',
            'sequence', 'status', 'orders', 'lpns',
            'signature_image', 'signed_by', 'delivered_at', 'delivery_notes',
            'created_at', 'updated_at',
        ]

    def get_address(self, obj):
        if obj.ship_to:
            loc = obj.ship_to
            return f"{loc.address_line1 or ''}, {loc.city or ''}, {loc.state or ''} {loc.postal_code or ''}".strip(', ')
        return ''

    def get_orders(self, obj):
        return [{
            'id': o.id,
            'order_number': o.order_number,
            'status': o.status,
            'customer_po': o.customer_po,
            'num_lines': o.lines.count(),
        } for o in obj.orders.all()]

    def get_lpns(self, obj):
        order_ids = obj.orders.values_list('id', flat=True)
        lpns = LicensePlate.objects.filter(order_id__in=order_ids, run=obj.run)
        return [{
            'id': lpn.id,
            'code': lpn.code,
            'weight_lbs': str(lpn.weight_lbs),
            'status': lpn.status,
        } for lpn in lpns]


class SignDeliverySerializer(serializers.Serializer):
    """Payload for POST /logistics/stops/{stop_id}/sign/"""
    signature_base64 = serializers.CharField(help_text="Base64-encoded signature PNG image")
    signed_by = serializers.CharField(max_length=100, help_text="Name of person who signed")
    photo_base64 = serializers.CharField(required=False, allow_blank=True, help_text="Base64-encoded photo JPG")
    gps_lat = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    gps_lng = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    delivery_notes = serializers.CharField(required=False, allow_blank=True, default='')


class DriverRunSerializer(serializers.Serializer):
    """Response for GET /logistics/my-run/ - Driver's manifest."""

    class StopOrderLineSerializer(serializers.Serializer):
        item_sku = serializers.CharField()
        item_name = serializers.CharField()
        quantity = serializers.IntegerField()
        uom_code = serializers.CharField()

    class StopOrderSerializer(serializers.Serializer):
        id = serializers.IntegerField()
        order_number = serializers.CharField()
        customer_po = serializers.CharField(allow_blank=True)
        lines = serializers.ListField(child=serializers.DictField())

    class ManifestStopSerializer(serializers.Serializer):
        id = serializers.IntegerField()
        sequence = serializers.IntegerField()
        status = serializers.CharField()
        customer_name = serializers.CharField()
        address = serializers.CharField()
        city = serializers.CharField()
        delivery_notes = serializers.CharField(allow_blank=True)
        pallet_count = serializers.IntegerField()
        orders = serializers.ListField()
        arrived_at = serializers.DateTimeField(allow_null=True)
        delivered_at = serializers.DateTimeField(allow_null=True)

    run_id = serializers.IntegerField()
    run_name = serializers.CharField()
    truck_name = serializers.CharField()
    scheduled_date = serializers.DateField()
    total_stops = serializers.IntegerField()
    total_weight_lbs = serializers.DecimalField(max_digits=12, decimal_places=2)
    is_complete = serializers.BooleanField()
    stops = ManifestStopSerializer(many=True)


class ArriveStopSerializer(serializers.Serializer):
    """Payload for POST /logistics/stops/{id}/arrive/"""
    gps_lat = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    gps_lng = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)


class StartRunSerializer(serializers.Serializer):
    """Payload for POST /logistics/my-run/start/"""
    pass  # No required fields
