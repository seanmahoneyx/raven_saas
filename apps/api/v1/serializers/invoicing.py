# apps/api/v1/serializers/invoicing.py
"""
Serializers for Invoicing models: Invoice, InvoiceLine, Payment.
"""
from rest_framework import serializers
from apps.invoicing.models import Invoice, InvoiceLine, Payment, TaxZone, TaxRule
from .base import TenantModelSerializer


class InvoiceLineSerializer(TenantModelSerializer):
    """Serializer for InvoiceLine model."""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)

    class Meta:
        model = InvoiceLine
        fields = [
            'id', 'invoice', 'line_number', 'item', 'item_sku',
            'description', 'quantity', 'uom', 'uom_code',
            'unit_price', 'discount_percent', 'line_total',
            'sales_order_line',
        ]
        read_only_fields = ['line_total']


class PaymentSerializer(TenantModelSerializer):
    """Serializer for Payment model."""
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.username', read_only=True, allow_null=True)

    class Meta:
        model = Payment
        fields = [
            'id', 'invoice', 'invoice_number', 'payment_date', 'amount',
            'payment_method', 'reference_number', 'notes',
            'recorded_by', 'recorded_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class InvoiceListSerializer(TenantModelSerializer):
    """Lightweight serializer for Invoice list views."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'customer', 'customer_name',
            'invoice_date', 'due_date', 'status', 'payment_terms',
            'total_amount', 'amount_paid', 'balance_due', 'is_overdue',
        ]


class InvoiceSerializer(TenantModelSerializer):
    """Standard serializer for Invoice model."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_paid = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'customer', 'customer_name',
            'sales_order', 'shipment', 'invoice_date', 'due_date',
            'payment_terms', 'status',
            'bill_to_name', 'bill_to_address', 'ship_to_name', 'ship_to_address',
            'subtotal', 'tax_rate', 'tax_amount', 'freight_amount', 'discount_amount',
            'total_amount', 'amount_paid', 'balance_due', 'is_paid', 'is_overdue',
            'customer_po', 'notes', 'customer_notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'subtotal', 'tax_amount', 'total_amount']


class InvoiceDetailSerializer(TenantModelSerializer):
    """Detailed serializer for Invoice with nested lines and payments."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_paid = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'customer', 'customer_name',
            'sales_order', 'shipment', 'invoice_date', 'due_date',
            'payment_terms', 'status',
            'bill_to_name', 'bill_to_address', 'ship_to_name', 'ship_to_address',
            'subtotal', 'tax_rate', 'tax_amount', 'freight_amount', 'discount_amount',
            'total_amount', 'amount_paid', 'balance_due', 'is_paid', 'is_overdue',
            'customer_po', 'notes', 'customer_notes',
            'lines', 'payments',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'subtotal', 'tax_amount', 'total_amount']


# ─── Tax Zone Serializers ────────────────────────────────────────────────────

class TaxRuleSerializer(TenantModelSerializer):
    """Serializer for TaxRule model."""
    tax_zone_name = serializers.CharField(source='tax_zone.name', read_only=True)

    class Meta:
        model = TaxRule
        fields = ['id', 'tax_zone', 'tax_zone_name', 'postal_code']


class TaxZoneSerializer(TenantModelSerializer):
    """Serializer for TaxZone model."""
    rules = TaxRuleSerializer(many=True, read_only=True)
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True, allow_null=True)
    rate_display = serializers.SerializerMethodField()

    class Meta:
        model = TaxZone
        fields = [
            'id', 'name', 'rate', 'rate_display', 'gl_account', 'gl_account_code',
            'is_active', 'rules', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_rate_display(self, obj):
        return f"{obj.rate * 100:.2f}%"
