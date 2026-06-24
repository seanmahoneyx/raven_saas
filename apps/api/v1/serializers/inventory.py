# apps/api/v1/serializers/inventory.py
"""
Serializers for Inventory models: InventoryLot, InventoryPallet, InventoryBalance,
InventoryTransaction, ItemReceipt, ItemReceiptLine.
"""
from rest_framework import serializers
from apps.inventory.models import (
    InventoryLot, InventoryPallet, InventoryBalance, InventoryTransaction,
    ItemReceipt, ItemReceiptLine,
    PickTicket, PickTicketLine,
)
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


# ─── Item Receipt Serializers ────────────────────────────────────────────────

class ItemReceiptLineSerializer(TenantModelSerializer):
    """Serializer for ItemReceiptLine."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)
    quantity_remaining_to_bill = serializers.IntegerField(read_only=True)

    class Meta:
        model = ItemReceiptLine
        fields = [
            'id', 'receipt', 'line_number',
            'purchase_order_line',
            'item', 'item_sku', 'item_name',
            'quantity', 'unit_cost', 'amount',
            'quantity_billed', 'quantity_remaining_to_bill',
            'notes',
        ]
        read_only_fields = ['quantity_billed']


class ItemReceiptListSerializer(TenantModelSerializer):
    """Lightweight serializer for list views."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.party.code', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    purchase_order_number = serializers.CharField(
        source='purchase_order.po_number', read_only=True, allow_null=True,
    )
    num_lines = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)

    class Meta:
        model = ItemReceipt
        fields = [
            'id', 'receipt_number', 'status',
            'vendor', 'vendor_name', 'vendor_code',
            'warehouse', 'warehouse_code',
            'purchase_order', 'purchase_order_number',
            'received_date', 'num_lines', 'subtotal',
        ]


class ItemReceiptDetailSerializer(TenantModelSerializer):
    """Full receipt with nested lines."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.party.code', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    purchase_order_number = serializers.CharField(
        source='purchase_order.po_number', read_only=True, allow_null=True,
    )
    received_by_name = serializers.CharField(
        source='received_by.username', read_only=True, allow_null=True,
    )
    lines = ItemReceiptLineSerializer(many=True, read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)

    class Meta:
        model = ItemReceipt
        fields = [
            'id', 'receipt_number', 'status',
            'vendor', 'vendor_name', 'vendor_code',
            'warehouse', 'warehouse_code',
            'purchase_order', 'purchase_order_number',
            'received_date',
            'received_by', 'received_by_name',
            'journal_entry', 'notes',
            'lines', 'subtotal',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'receipt_number', 'status', 'journal_entry', 'received_by',
            'created_at', 'updated_at',
        ]


# ─── Pick Ticket Serializers ─────────────────────────────────────────────────

class PickTicketLineSerializer(TenantModelSerializer):
    """Serializer for PickTicketLine."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)
    quantity_remaining_to_invoice = serializers.IntegerField(read_only=True)

    class Meta:
        model = PickTicketLine
        fields = [
            'id', 'pick_ticket', 'line_number',
            'sales_order_line',
            'item', 'item_sku', 'item_name',
            'quantity', 'unit_price', 'amount',
            'quantity_invoiced', 'quantity_remaining_to_invoice',
            'notes',
        ]
        read_only_fields = ['quantity_invoiced']


class PickTicketListSerializer(TenantModelSerializer):
    """Lightweight serializer for list views."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    customer_code = serializers.CharField(source='customer.party.code', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    sales_order_number = serializers.CharField(
        source='sales_order.order_number', read_only=True, allow_null=True,
    )
    num_lines = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)

    class Meta:
        model = PickTicket
        fields = [
            'id', 'pick_number', 'status',
            'customer', 'customer_name', 'customer_code',
            'warehouse', 'warehouse_code',
            'sales_order', 'sales_order_number',
            'picked_date', 'num_lines', 'subtotal',
        ]


class PickTicketDetailSerializer(TenantModelSerializer):
    """Full pick ticket with nested lines."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    customer_code = serializers.CharField(source='customer.party.code', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    sales_order_number = serializers.CharField(
        source='sales_order.order_number', read_only=True, allow_null=True,
    )
    picked_by_name = serializers.CharField(
        source='picked_by.username', read_only=True, allow_null=True,
    )
    lines = PickTicketLineSerializer(many=True, read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)

    class Meta:
        model = PickTicket
        fields = [
            'id', 'pick_number', 'status',
            'customer', 'customer_name', 'customer_code',
            'warehouse', 'warehouse_code',
            'sales_order', 'sales_order_number',
            'picked_date',
            'picked_by', 'picked_by_name',
            'notes',
            'lines', 'subtotal',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'pick_number', 'status', 'picked_by',
            'created_at', 'updated_at',
        ]
