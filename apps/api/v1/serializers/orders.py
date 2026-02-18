# apps/api/v1/serializers/orders.py
"""
Serializers for Order models: PurchaseOrder, SalesOrder, and their lines.
"""
from rest_framework import serializers
from apps.orders.models import (
    PurchaseOrder, PurchaseOrderLine,
    SalesOrder, SalesOrderLine,
    Estimate, EstimateLine,
    RFQ, RFQLine,
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
    po_number = serializers.CharField(max_length=50, required=False, allow_blank=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'status', 'vendor',
            'order_date', 'expected_date', 'scheduled_date',
            'scheduled_truck', 'ship_to', 'notes', 'priority', 'lines',
        ]

    def _generate_po_number(self, tenant):
        """Generate next PO number for the tenant."""
        import re
        from django.db.models import Max

        # Get all PO numbers for this tenant and find the highest numeric value
        po_numbers = PurchaseOrder.objects.filter(tenant=tenant).values_list('po_number', flat=True)
        max_num = 0
        for po_num in po_numbers:
            # Extract numeric portion (handles both "PO-000001" and "000001" formats)
            match = re.search(r'(\d+)', po_num or '')
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num

        next_num = max_num + 1
        return f"PO-{str(next_num).zfill(6)}"

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])

        # Auto-generate PO number if not provided
        if not validated_data.get('po_number'):
            tenant = self.context['request'].tenant
            validated_data['po_number'] = self._generate_po_number(tenant)

        purchase_order = super().create(validated_data)

        for idx, line_data in enumerate(lines_data):
            if 'line_number' not in line_data:
                line_data['line_number'] = (idx + 1) * 10
            # Auto-fill unit_cost from CostingService if not provided
            if not line_data.get('unit_cost') and line_data.get('item') and purchase_order.vendor:
                from apps.costing.services import CostingService
                cost = CostingService(purchase_order.tenant).get_cost(
                    vendor=purchase_order.vendor,
                    item=line_data['item'],
                    quantity=line_data.get('quantity_ordered', 1),
                )
                if cost is not None:
                    line_data['unit_cost'] = cost
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
    order_number = serializers.CharField(max_length=50, required=False, allow_blank=True)

    class Meta:
        model = SalesOrder
        fields = [
            'id', 'order_number', 'status', 'customer',
            'order_date', 'scheduled_date', 'scheduled_truck',
            'ship_to', 'bill_to', 'customer_po', 'notes', 'priority', 'lines',
        ]

    def _generate_order_number(self, tenant):
        """Generate next order number for the tenant."""
        import re

        # Get all order numbers for this tenant and find the highest numeric value
        order_numbers = SalesOrder.objects.filter(tenant=tenant).values_list('order_number', flat=True)
        max_num = 0
        for order_num in order_numbers:
            # Extract numeric portion (handles both "SO-000001" and "000001" formats)
            match = re.search(r'(\d+)', order_num or '')
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num

        next_num = max_num + 1
        return f"SO-{str(next_num).zfill(6)}"

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])

        # Auto-generate order number if not provided
        if not validated_data.get('order_number'):
            tenant = self.context['request'].tenant
            validated_data['order_number'] = self._generate_order_number(tenant)

        sales_order = super().create(validated_data)

        for idx, line_data in enumerate(lines_data):
            if 'line_number' not in line_data:
                line_data['line_number'] = (idx + 1) * 10
            # Auto-fill unit_price from PricingService if not provided
            if not line_data.get('unit_price') and line_data.get('item') and sales_order.customer:
                from apps.pricing.services import PricingService
                price = PricingService(sales_order.tenant).get_price(
                    customer=sales_order.customer,
                    item=line_data['item'],
                    quantity=line_data.get('quantity_ordered', 1),
                )
                if price is not None:
                    line_data['unit_price'] = price
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


# ==================== Estimate Serializers ====================

class EstimateLineSerializer(TenantModelSerializer):
    """Serializer for EstimateLine model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)

    class Meta:
        model = EstimateLine
        fields = [
            'id', 'estimate', 'line_number',
            'item', 'item_sku', 'item_name',
            'description', 'quantity', 'uom', 'uom_code',
            'unit_price', 'amount',
            'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['amount', 'created_at', 'updated_at']


class EstimateListSerializer(TenantModelSerializer):
    """Lightweight serializer for Estimate list views."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    num_lines = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'status', 'customer', 'customer_name',
            'date', 'expiration_date', 'total_amount', 'num_lines', 'is_expired',
        ]

    def get_num_lines(self, obj):
        return obj.lines.count()


class EstimateSerializer(TenantModelSerializer):
    """Standard serializer for Estimate model."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    is_convertible = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'status', 'customer', 'customer_name',
            'date', 'expiration_date',
            'ship_to', 'bill_to',
            'subtotal', 'tax_rate', 'tax_amount', 'total_amount',
            'design_request', 'customer_po',
            'notes', 'terms_and_conditions',
            'is_editable', 'is_convertible', 'is_expired',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['subtotal', 'tax_amount', 'total_amount', 'created_at', 'updated_at']


class EstimateDetailSerializer(TenantModelSerializer):
    """Detailed serializer for Estimate with nested lines."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    ship_to_name = serializers.CharField(source='ship_to.name', read_only=True, allow_null=True)
    bill_to_name = serializers.CharField(source='bill_to.name', read_only=True, allow_null=True)
    lines = EstimateLineSerializer(many=True, read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    is_convertible = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    converted_order_number = serializers.SerializerMethodField()

    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'status', 'customer', 'customer_name',
            'date', 'expiration_date',
            'ship_to', 'ship_to_name', 'bill_to', 'bill_to_name',
            'subtotal', 'tax_rate', 'tax_amount', 'total_amount',
            'design_request', 'customer_po',
            'notes', 'terms_and_conditions',
            'lines', 'is_editable', 'is_convertible', 'is_expired',
            'converted_order_number',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['subtotal', 'tax_amount', 'total_amount', 'created_at', 'updated_at']

    def get_converted_order_number(self, obj):
        order = obj.converted_orders.first()
        return order.order_number if order else None


class EstimateWriteSerializer(TenantModelSerializer):
    """Serializer for creating/updating Estimates with nested lines."""
    lines = EstimateLineSerializer(many=True, required=False)
    estimate_number = serializers.CharField(max_length=50, required=False, allow_blank=True)

    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'status', 'customer',
            'date', 'expiration_date',
            'ship_to', 'bill_to', 'tax_rate',
            'design_request', 'customer_po',
            'notes', 'terms_and_conditions', 'lines',
        ]

    def _generate_estimate_number(self, tenant):
        """Generate next estimate number for the tenant."""
        import re
        estimate_numbers = Estimate.objects.filter(tenant=tenant).values_list('estimate_number', flat=True)
        max_num = 0
        for est_num in estimate_numbers:
            match = re.search(r'(\d+)', est_num or '')
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
        return f"EST-{str(max_num + 1).zfill(6)}"

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])

        if not validated_data.get('estimate_number'):
            tenant = self.context['request'].tenant
            validated_data['estimate_number'] = self._generate_estimate_number(tenant)

        estimate = super().create(validated_data)

        for idx, line_data in enumerate(lines_data):
            if 'line_number' not in line_data:
                line_data['line_number'] = (idx + 1) * 10
            EstimateLine.objects.create(
                estimate=estimate,
                tenant=estimate.tenant,
                **line_data
            )

        estimate.calculate_totals()
        estimate.save()
        return estimate

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)

        if lines_data is not None:
            instance.lines.all().delete()
            for idx, line_data in enumerate(lines_data):
                if 'line_number' not in line_data:
                    line_data['line_number'] = (idx + 1) * 10
                EstimateLine.objects.create(
                    estimate=instance,
                    tenant=instance.tenant,
                    **line_data
                )

        instance.calculate_totals()
        instance.save()
        return instance


# ==================== RFQ Serializers ====================

class RFQLineSerializer(TenantModelSerializer):
    """Serializer for RFQLine model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=4, read_only=True)

    class Meta:
        model = RFQLine
        fields = [
            'id', 'rfq', 'line_number',
            'item', 'item_sku', 'item_name',
            'description', 'quantity', 'uom', 'uom_code',
            'target_price', 'quoted_price', 'line_total',
            'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class RFQListSerializer(TenantModelSerializer):
    """Lightweight serializer for RFQ list views."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    num_lines = serializers.SerializerMethodField()
    has_all_quotes = serializers.BooleanField(read_only=True)

    class Meta:
        model = RFQ
        fields = [
            'id', 'rfq_number', 'status', 'vendor', 'vendor_name',
            'date', 'expected_date', 'num_lines', 'has_all_quotes',
        ]

    def get_num_lines(self, obj):
        return obj.lines.count()


class RFQSerializer(TenantModelSerializer):
    """Standard serializer for RFQ model."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    is_convertible = serializers.BooleanField(read_only=True)
    has_all_quotes = serializers.BooleanField(read_only=True)

    class Meta:
        model = RFQ
        fields = [
            'id', 'rfq_number', 'status', 'vendor', 'vendor_name',
            'date', 'expected_date', 'ship_to',
            'notes',
            'is_editable', 'is_convertible', 'has_all_quotes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class RFQDetailSerializer(TenantModelSerializer):
    """Detailed serializer for RFQ with nested lines."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    ship_to_name = serializers.CharField(source='ship_to.name', read_only=True, allow_null=True)
    lines = RFQLineSerializer(many=True, read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    is_convertible = serializers.BooleanField(read_only=True)
    has_all_quotes = serializers.BooleanField(read_only=True)
    converted_po_number = serializers.SerializerMethodField()

    class Meta:
        model = RFQ
        fields = [
            'id', 'rfq_number', 'status', 'vendor', 'vendor_name',
            'date', 'expected_date', 'ship_to', 'ship_to_name',
            'notes', 'lines',
            'is_editable', 'is_convertible', 'has_all_quotes',
            'converted_po_number',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_converted_po_number(self, obj):
        po = obj.converted_purchase_orders.first()
        return po.po_number if po else None


class RFQWriteSerializer(TenantModelSerializer):
    """Serializer for creating/updating RFQs with nested lines."""
    lines = RFQLineSerializer(many=True, required=False)
    rfq_number = serializers.CharField(max_length=50, required=False, allow_blank=True)

    class Meta:
        model = RFQ
        fields = [
            'id', 'rfq_number', 'status', 'vendor',
            'date', 'expected_date', 'ship_to',
            'notes', 'lines',
        ]

    def _generate_rfq_number(self, tenant):
        """Generate next RFQ number for the tenant."""
        import re
        rfq_numbers = RFQ.objects.filter(tenant=tenant).values_list('rfq_number', flat=True)
        max_num = 0
        for rfq_num in rfq_numbers:
            match = re.search(r'(\d+)', rfq_num or '')
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
        return f"RFQ-{str(max_num + 1).zfill(6)}"

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])

        if not validated_data.get('rfq_number'):
            tenant = self.context['request'].tenant
            validated_data['rfq_number'] = self._generate_rfq_number(tenant)

        rfq = super().create(validated_data)

        for idx, line_data in enumerate(lines_data):
            if 'line_number' not in line_data:
                line_data['line_number'] = (idx + 1) * 10
            RFQLine.objects.create(
                rfq=rfq,
                tenant=rfq.tenant,
                **line_data
            )
        return rfq

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)

        if lines_data is not None:
            instance.lines.all().delete()
            for idx, line_data in enumerate(lines_data):
                if 'line_number' not in line_data:
                    line_data['line_number'] = (idx + 1) * 10
                RFQLine.objects.create(
                    rfq=instance,
                    tenant=instance.tenant,
                    **line_data
                )
        return instance
