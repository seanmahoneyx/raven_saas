# apps/api/v1/serializers/shipping.py
"""
Serializers for Shipping models: Shipment, ShipmentLine, BillOfLading, BOLLine.
"""
from rest_framework import serializers
from apps.shipping.models import Shipment, ShipmentLine, BillOfLading, BOLLine
from .base import TenantModelSerializer


class ShipmentLineSerializer(TenantModelSerializer):
    """Serializer for ShipmentLine model."""
    order_number = serializers.CharField(source='sales_order.order_number', read_only=True)
    customer_name = serializers.CharField(source='sales_order.customer.party.display_name', read_only=True)
    ship_to_name = serializers.CharField(source='sales_order.ship_to.name', read_only=True)

    class Meta:
        model = ShipmentLine
        fields = [
            'id', 'shipment', 'sales_order', 'order_number',
            'customer_name', 'ship_to_name', 'delivery_sequence',
            'delivery_status', 'delivered_at', 'signature_name', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ShipmentListSerializer(TenantModelSerializer):
    """Lightweight serializer for Shipment list views."""
    truck_name = serializers.CharField(source='truck.name', read_only=True)
    total_orders = serializers.IntegerField(read_only=True)

    class Meta:
        model = Shipment
        fields = [
            'id', 'shipment_number', 'ship_date', 'truck', 'truck_name',
            'driver_name', 'status', 'total_orders',
        ]


class ShipmentSerializer(TenantModelSerializer):
    """Standard serializer for Shipment model."""
    truck_name = serializers.CharField(source='truck.name', read_only=True)
    total_orders = serializers.IntegerField(read_only=True)
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Shipment
        fields = [
            'id', 'shipment_number', 'ship_date', 'truck', 'truck_name',
            'driver_name', 'status', 'departure_time', 'arrival_time',
            'notes', 'total_orders', 'total_value',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ShipmentDetailSerializer(TenantModelSerializer):
    """Detailed serializer for Shipment with nested lines."""
    truck_name = serializers.CharField(source='truck.name', read_only=True)
    total_orders = serializers.IntegerField(read_only=True)
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    lines = ShipmentLineSerializer(many=True, read_only=True)

    class Meta:
        model = Shipment
        fields = [
            'id', 'shipment_number', 'ship_date', 'truck', 'truck_name',
            'driver_name', 'status', 'departure_time', 'arrival_time',
            'notes', 'total_orders', 'total_value', 'lines',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class BOLLineSerializer(TenantModelSerializer):
    """Serializer for BOLLine model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)

    class Meta:
        model = BOLLine
        fields = [
            'id', 'bol', 'line_number', 'item', 'item_sku',
            'description', 'quantity', 'uom', 'uom_code',
            'num_packages', 'weight', 'freight_class', 'nmfc_code',
        ]


class BillOfLadingListSerializer(TenantModelSerializer):
    """Lightweight serializer for BillOfLading list views."""
    shipment_number = serializers.CharField(source='shipment.shipment_number', read_only=True)

    class Meta:
        model = BillOfLading
        fields = [
            'id', 'bol_number', 'shipment', 'shipment_number',
            'status', 'issue_date', 'carrier_name', 'total_pieces', 'total_weight',
        ]


class BillOfLadingSerializer(TenantModelSerializer):
    """Standard serializer for BillOfLading model."""
    shipment_number = serializers.CharField(source='shipment.shipment_number', read_only=True)

    class Meta:
        model = BillOfLading
        fields = [
            'id', 'bol_number', 'shipment', 'shipment_number', 'status', 'issue_date',
            'carrier_name', 'carrier_scac', 'trailer_number', 'seal_number',
            'shipper_name', 'shipper_address',
            'shipper_signature', 'shipper_signed_date',
            'carrier_signature', 'carrier_signed_date',
            'consignee_signature', 'consignee_signed_date',
            'total_pieces', 'total_weight', 'weight_uom', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class BillOfLadingDetailSerializer(TenantModelSerializer):
    """Detailed serializer for BillOfLading with nested lines."""
    shipment_number = serializers.CharField(source='shipment.shipment_number', read_only=True)
    lines = BOLLineSerializer(many=True, read_only=True)

    class Meta:
        model = BillOfLading
        fields = [
            'id', 'bol_number', 'shipment', 'shipment_number', 'status', 'issue_date',
            'carrier_name', 'carrier_scac', 'trailer_number', 'seal_number',
            'shipper_name', 'shipper_address',
            'shipper_signature', 'shipper_signed_date',
            'carrier_signature', 'carrier_signed_date',
            'consignee_signature', 'consignee_signed_date',
            'total_pieces', 'total_weight', 'weight_uom', 'notes', 'lines',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
