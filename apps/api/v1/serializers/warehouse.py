# apps/api/v1/serializers/warehouse.py
"""
Serializers for WMS (Warehouse Management System) endpoints.

Handles location-based inventory tracking with lot support.
"""
from rest_framework import serializers
from apps.warehousing.models import (
    WarehouseLocation, Lot, StockQuant, StockMoveLog,
    CycleCount, CycleCountLine,
)
from .base import TenantModelSerializer


class WarehouseLocationSerializer(TenantModelSerializer):
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)

    class Meta:
        model = WarehouseLocation
        fields = [
            'id', 'warehouse', 'warehouse_code', 'name', 'barcode',
            'type', 'parent', 'parent_name', 'parent_path', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class LotSerializer(TenantModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)

    class Meta:
        model = Lot
        fields = [
            'id', 'item', 'item_sku', 'lot_number',
            'vendor_batch', 'manufacturer_batch_id', 'expiry_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class StockQuantSerializer(TenantModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    location_barcode = serializers.CharField(source='location.barcode', read_only=True)
    warehouse_code = serializers.CharField(source='location.warehouse.code', read_only=True)
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True, allow_null=True)
    available_quantity = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)

    class Meta:
        model = StockQuant
        fields = [
            'id', 'item', 'item_sku', 'item_name',
            'location', 'location_name', 'location_barcode', 'warehouse_code',
            'lot', 'lot_number', 'quantity', 'reserved_quantity', 'available_quantity',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class StockMoveSerializer(serializers.Serializer):
    """Serializer for the POST /warehouse/move/ endpoint."""
    item = serializers.IntegerField(help_text="Item ID")
    quantity = serializers.DecimalField(max_digits=14, decimal_places=4, help_text="Quantity to move")
    source_location = serializers.IntegerField(help_text="Source WarehouseLocation ID")
    destination_location = serializers.IntegerField(help_text="Destination WarehouseLocation ID")
    lot = serializers.IntegerField(required=False, allow_null=True, help_text="Lot ID (optional)")
    reference = serializers.CharField(required=False, default='', help_text="Reference note")


class StockMoveLogSerializer(TenantModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    source_name = serializers.CharField(source='source_location.name', read_only=True)
    dest_name = serializers.CharField(source='destination_location.name', read_only=True)
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True, allow_null=True)
    moved_by_name = serializers.CharField(source='moved_by.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = StockMoveLog
        fields = [
            'id', 'item', 'item_sku',
            'source_location', 'source_name',
            'destination_location', 'dest_name',
            'lot', 'lot_number', 'quantity',
            'moved_by', 'moved_by_name', 'reference',
            'created_at',
        ]
        read_only_fields = ['created_at']


# ─── Scanner Lookup Serializers ──────────────────────────────────────────────

class ScannerLocationLookupSerializer(serializers.Serializer):
    """Response for barcode-based location lookup."""
    id = serializers.IntegerField()
    name = serializers.CharField()
    barcode = serializers.CharField()
    warehouse_code = serializers.CharField()
    type = serializers.CharField()


class ScannerItemLookupSerializer(serializers.Serializer):
    """Response for SKU-based item lookup."""
    id = serializers.IntegerField()
    sku = serializers.CharField()
    name = serializers.CharField()
    lots = LotSerializer(many=True)


# ─── Cycle Count Serializers ─────────────────────────────────────────────────

class CycleCountLineSerializer(TenantModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True, allow_null=True)

    class Meta:
        model = CycleCountLine
        fields = [
            'id', 'cycle_count', 'item', 'item_sku', 'item_name',
            'location', 'location_name', 'lot', 'lot_number',
            'expected_quantity', 'counted_quantity', 'variance', 'is_counted',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'cycle_count', 'item', 'location', 'lot',
            'expected_quantity', 'variance', 'is_counted',
            'created_at', 'updated_at',
        ]


class CycleCountListSerializer(TenantModelSerializer):
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    zone_name = serializers.CharField(source='zone.name', read_only=True, allow_null=True)
    counted_by_name = serializers.CharField(source='counted_by.get_full_name', read_only=True, allow_null=True)
    total_lines = serializers.IntegerField(read_only=True)
    counted_lines = serializers.IntegerField(read_only=True)

    class Meta:
        model = CycleCount
        fields = [
            'id', 'count_number', 'warehouse', 'warehouse_code', 'warehouse_name',
            'zone', 'zone_name', 'status',
            'counted_by', 'counted_by_name',
            'total_lines', 'counted_lines',
            'started_at', 'completed_at',
            'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['count_number', 'status', 'started_at', 'completed_at', 'created_at', 'updated_at']


class CycleCountDetailSerializer(CycleCountListSerializer):
    lines = CycleCountLineSerializer(many=True, read_only=True)

    class Meta(CycleCountListSerializer.Meta):
        fields = CycleCountListSerializer.Meta.fields + ['lines']


class RecordCountSerializer(serializers.Serializer):
    """Serializer for recording a single count line."""
    line_id = serializers.IntegerField(help_text="CycleCountLine ID")
    counted_quantity = serializers.DecimalField(
        max_digits=14, decimal_places=4,
        help_text="Actual counted quantity"
    )
