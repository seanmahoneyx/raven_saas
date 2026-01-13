# apps/api/v1/serializers/inventory.py
"""
Serializers for Inventory models: InventoryLot, InventoryPallet, InventoryBalance, InventoryTransaction.
"""
from rest_framework import serializers
from apps.inventory.models import InventoryLot, InventoryPallet, InventoryBalance, InventoryTransaction
from .base import TenantModelSerializer


class InventoryPalletSerializer(TenantModelSerializer):
    """Serializer for InventoryPallet model."""
    item_sku = serializers.CharField(source='lot.item.sku', read_only=True)
    warehouse_code = serializers.CharField(source='lot.warehouse.code', read_only=True)
    bin_code = serializers.CharField(source='bin.code', read_only=True, allow_null=True)

    class Meta:
        model = InventoryPallet
        fields = [
            'id', 'lot', 'pallet_number', 'license_plate',
            'item_sku', 'warehouse_code', 'bin', 'bin_code',
            'quantity_received', 'quantity_on_hand', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'license_plate']


class InventoryLotListSerializer(TenantModelSerializer):
    """Lightweight serializer for InventoryLot list views."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True, allow_null=True)
    quantity_on_hand = serializers.IntegerField(read_only=True)

    class Meta:
        model = InventoryLot
        fields = [
            'id', 'lot_number', 'item', 'item_sku', 'item_name',
            'warehouse', 'warehouse_code', 'vendor', 'vendor_name',
            'received_date', 'total_quantity', 'quantity_on_hand', 'unit_cost',
        ]


class InventoryLotSerializer(TenantModelSerializer):
    """Standard serializer for InventoryLot model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True, allow_null=True)
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    quantity_on_hand = serializers.IntegerField(read_only=True)

    class Meta:
        model = InventoryLot
        fields = [
            'id', 'lot_number', 'item', 'item_sku', 'item_name',
            'warehouse', 'warehouse_code', 'vendor', 'vendor_name',
            'purchase_order', 'received_date', 'unit_cost',
            'total_quantity', 'quantity_on_hand', 'total_value', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class InventoryLotDetailSerializer(TenantModelSerializer):
    """Detailed serializer for InventoryLot with nested pallets."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True, allow_null=True)
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    quantity_on_hand = serializers.IntegerField(read_only=True)
    pallets = InventoryPalletSerializer(many=True, read_only=True)

    class Meta:
        model = InventoryLot
        fields = [
            'id', 'lot_number', 'item', 'item_sku', 'item_name',
            'warehouse', 'warehouse_code', 'vendor', 'vendor_name',
            'purchase_order', 'received_date', 'unit_cost',
            'total_quantity', 'quantity_on_hand', 'total_value', 'notes',
            'pallets', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class InventoryBalanceSerializer(TenantModelSerializer):
    """Serializer for InventoryBalance model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    available = serializers.IntegerField(read_only=True)
    projected = serializers.IntegerField(read_only=True)

    class Meta:
        model = InventoryBalance
        fields = [
            'id', 'item', 'item_sku', 'item_name',
            'warehouse', 'warehouse_code', 'warehouse_name',
            'on_hand', 'allocated', 'on_order', 'available', 'projected',
            'last_updated',
        ]
        read_only_fields = ['last_updated']


class InventoryTransactionSerializer(TenantModelSerializer):
    """Serializer for InventoryTransaction model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True, allow_null=True)
    pallet_license_plate = serializers.CharField(source='pallet.license_plate', read_only=True, allow_null=True)
    user_name = serializers.CharField(source='user.username', read_only=True, allow_null=True)

    class Meta:
        model = InventoryTransaction
        fields = [
            'id', 'transaction_type', 'item', 'item_sku',
            'warehouse', 'warehouse_code', 'lot', 'lot_number',
            'pallet', 'pallet_license_plate', 'quantity',
            'transaction_date', 'reference_type', 'reference_id', 'reference_number',
            'user', 'user_name', 'notes',
            'balance_on_hand', 'balance_allocated',
        ]
        read_only_fields = ['transaction_date', 'balance_on_hand', 'balance_allocated']
