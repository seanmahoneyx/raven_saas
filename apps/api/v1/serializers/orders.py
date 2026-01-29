# apps/api/v1/serializers/orders.py
"""
Serializers for Order models: PurchaseOrder, SalesOrder, and their lines.
"""
from rest_framework import serializers
from apps.orders.models import (
    PurchaseOrder, PurchaseOrderLine,
    SalesOrder, SalesOrderLine,
)
from apps.contracts.models import ContractRelease
from .base import TenantModelSerializer


# ==================== Purchase Order Serializers ====================

class PurchaseOrderLineSerializer(TenantModelSerializer):
    """Serializer for PurchaseOrderLine model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    quantity_in_base_uom = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = [
            'id', 'purchase_order', 'line_number',
            'item', 'item_sku', 'item_name',
            'quantity_ordered', 'uom', 'uom_code',
            'unit_cost', 'line_total', 'quantity_in_base_uom',
            'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PurchaseOrderListSerializer(TenantModelSerializer):
    """Lightweight serializer for PurchaseOrder list views."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    num_lines = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'status', 'vendor', 'vendor_name',
            'order_date', 'expected_date', 'scheduled_date',
            'scheduled_truck', 'num_lines', 'subtotal', 'priority',
        ]


class PurchaseOrderSerializer(TenantModelSerializer):
    """Standard serializer for PurchaseOrder model."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    ship_to_name = serializers.CharField(source='ship_to.name', read_only=True)
    num_lines = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_editable = serializers.BooleanField(read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'status', 'vendor', 'vendor_name',
            'order_date', 'expected_date', 'scheduled_date',
            'scheduled_truck', 'ship_to', 'ship_to_name',
            'notes', 'priority', 'num_lines', 'subtotal', 'is_editable',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PurchaseOrderDetailSerializer(TenantModelSerializer):
    """Detailed serializer for PurchaseOrder with nested lines."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    ship_to_name = serializers.CharField(source='ship_to.name', read_only=True)
    lines = PurchaseOrderLineSerializer(many=True, read_only=True)
    num_lines = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_editable = serializers.BooleanField(read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'status', 'vendor', 'vendor_name',
            'order_date', 'expected_date', 'scheduled_date',
            'scheduled_truck', 'ship_to', 'ship_to_name',
            'notes', 'priority', 'lines', 'num_lines', 'subtotal', 'is_editable',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PurchaseOrderWriteSerializer(TenantModelSerializer):
    """Serializer for creating/updating PurchaseOrder with nested lines."""
    lines = PurchaseOrderLineSerializer(many=True, required=False)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'status', 'vendor',
            'order_date', 'expected_date', 'scheduled_date',
            'scheduled_truck', 'ship_to', 'notes', 'priority', 'lines',
        ]

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        purchase_order = super().create(validated_data)

        for idx, line_data in enumerate(lines_data):
            if 'line_number' not in line_data:
                line_data['line_number'] = (idx + 1) * 10
            PurchaseOrderLine.objects.create(
                purchase_order=purchase_order,
                tenant=purchase_order.tenant,
                **line_data
            )
        return purchase_order

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)

        if lines_data is not None:
            # Replace all lines
            instance.lines.all().delete()
            for idx, line_data in enumerate(lines_data):
                if 'line_number' not in line_data:
                    line_data['line_number'] = (idx + 1) * 10
                PurchaseOrderLine.objects.create(
                    purchase_order=instance,
                    tenant=instance.tenant,
                    **line_data
                )
        return instance


# ==================== Sales Order Serializers ====================

class SalesOrderLineSerializer(TenantModelSerializer):
    """Serializer for SalesOrderLine model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    quantity_in_base_uom = serializers.IntegerField(read_only=True)
    # Contract reference fields (from linked ContractRelease)
    contract_number = serializers.CharField(
        source='contract_release.contract_line.contract.contract_number',
        read_only=True,
        allow_null=True,
        default=None
    )
    contract_id = serializers.IntegerField(
        source='contract_release.contract_line.contract.id',
        read_only=True,
        allow_null=True,
        default=None
    )

    class Meta:
        model = SalesOrderLine
        fields = [
            'id', 'sales_order', 'line_number',
            'item', 'item_sku', 'item_name',
            'quantity_ordered', 'uom', 'uom_code',
            'unit_price', 'line_total', 'quantity_in_base_uom',
            'notes', 'contract_number', 'contract_id',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class SalesOrderListSerializer(TenantModelSerializer):
    """Lightweight serializer for SalesOrder list views."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    num_lines = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = SalesOrder
        fields = [
            'id', 'order_number', 'status', 'customer', 'customer_name',
            'order_date', 'scheduled_date', 'scheduled_truck',
            'customer_po', 'num_lines', 'subtotal', 'priority',
        ]


class SalesOrderSerializer(TenantModelSerializer):
    """Standard serializer for SalesOrder model."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    ship_to_name = serializers.CharField(source='ship_to.name', read_only=True)
    bill_to_name = serializers.CharField(source='bill_to.name', read_only=True, allow_null=True)
    num_lines = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_editable = serializers.BooleanField(read_only=True)

    class Meta:
        model = SalesOrder
        fields = [
            'id', 'order_number', 'status', 'customer', 'customer_name',
            'order_date', 'scheduled_date', 'scheduled_truck',
            'ship_to', 'ship_to_name', 'bill_to', 'bill_to_name',
            'customer_po', 'notes', 'priority', 'num_lines', 'subtotal', 'is_editable',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class SalesOrderDetailSerializer(TenantModelSerializer):
    """Detailed serializer for SalesOrder with nested lines."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    ship_to_name = serializers.CharField(source='ship_to.name', read_only=True)
    bill_to_name = serializers.CharField(source='bill_to.name', read_only=True, allow_null=True)
    lines = SalesOrderLineSerializer(many=True, read_only=True)
    num_lines = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    contract_reference = serializers.SerializerMethodField()

    class Meta:
        model = SalesOrder
        fields = [
            'id', 'order_number', 'status', 'customer', 'customer_name',
            'order_date', 'scheduled_date', 'scheduled_truck',
            'ship_to', 'ship_to_name', 'bill_to', 'bill_to_name',
            'customer_po', 'notes', 'priority', 'lines', 'num_lines', 'subtotal', 'is_editable',
            'contract_reference',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_contract_reference(self, obj):
        """Get contract info from the first line's contract release (if any)."""
        first_line = obj.lines.first()
        if first_line:
            try:
                release = first_line.contract_release
                contract = release.contract_line.contract
                return {
                    'contract_id': contract.id,
                    'contract_number': contract.contract_number,
                    'blanket_po': contract.blanket_po,
                }
            except ContractRelease.DoesNotExist:
                pass
        return None


class SalesOrderWriteSerializer(TenantModelSerializer):
    """Serializer for creating/updating SalesOrder with nested lines."""
    lines = SalesOrderLineSerializer(many=True, required=False)

    class Meta:
        model = SalesOrder
        fields = [
            'id', 'order_number', 'status', 'customer',
            'order_date', 'scheduled_date', 'scheduled_truck',
            'ship_to', 'bill_to', 'customer_po', 'notes', 'priority', 'lines',
        ]

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        sales_order = super().create(validated_data)

        for idx, line_data in enumerate(lines_data):
            if 'line_number' not in line_data:
                line_data['line_number'] = (idx + 1) * 10
            SalesOrderLine.objects.create(
                sales_order=sales_order,
                tenant=sales_order.tenant,
                **line_data
            )
        return sales_order

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)

        if lines_data is not None:
            # Replace all lines
            instance.lines.all().delete()
            for idx, line_data in enumerate(lines_data):
                if 'line_number' not in line_data:
                    line_data['line_number'] = (idx + 1) * 10
                SalesOrderLine.objects.create(
                    sales_order=instance,
                    tenant=instance.tenant,
                    **line_data
                )
        return instance
