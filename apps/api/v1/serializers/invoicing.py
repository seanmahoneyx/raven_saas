# apps/api/v1/serializers/invoicing.py
"""
Serializers for Invoicing models: Invoice, InvoiceLine, Payment,
VendorBill, VendorBillLine, BillPayment.
"""
from rest_framework import serializers
from apps.invoicing.models import (
    Invoice, InvoiceLine, Payment, TaxZone, TaxRule,
    VendorBill, VendorBillLine, BillPayment,
)
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
    invoice_type = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'invoice_type', 'customer', 'customer_name',
            'invoice_date', 'due_date', 'status', 'payment_terms',
            'total_amount', 'amount_paid', 'balance_due', 'is_overdue',
        ]

    def get_invoice_type(self, obj):
        return 'AR'


class InvoiceSerializer(TenantModelSerializer):
    """Standard serializer for Invoice model."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_paid = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    invoice_type = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'invoice_type', 'customer', 'customer_name',
            'sales_order', 'shipment', 'invoice_date', 'due_date',
            'payment_terms', 'status',
            'bill_to_name', 'bill_to_address', 'ship_to_name', 'ship_to_address',
            'subtotal', 'tax_rate', 'tax_amount', 'freight_amount', 'discount_amount',
            'total_amount', 'amount_paid', 'balance_due', 'is_paid', 'is_overdue',
            'customer_po', 'notes', 'customer_notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'subtotal', 'tax_amount', 'total_amount']

    def get_invoice_type(self, obj):
        return 'AR'


class InvoiceDetailSerializer(TenantModelSerializer):
    """Detailed serializer for Invoice with nested lines and payments."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_paid = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    invoice_type = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'invoice_type', 'customer', 'customer_name',
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

    def get_invoice_type(self, obj):
        return 'AR'


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


# ─── Vendor Bill (AP) Serializers ────────────────────────────────────────────

class VendorBillLineSerializer(TenantModelSerializer):
    """Serializer for VendorBillLine model (AP counterpart to InvoiceLine)."""
    item_sku = serializers.CharField(source='item.sku', read_only=True, allow_null=True)
    expense_account_code = serializers.CharField(
        source='expense_account.code', read_only=True, allow_null=True,
    )

    class Meta:
        model = VendorBillLine
        fields = [
            'id', 'bill', 'line_number', 'item', 'item_sku',
            'description', 'expense_account', 'expense_account_code',
            'quantity', 'unit_price', 'amount',
            'purchase_order_line',
        ]
        read_only_fields = ['amount']


class BillPaymentSerializer(TenantModelSerializer):
    """Serializer for BillPayment model (AP counterpart to PaymentSerializer)."""
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True)
    vendor_name = serializers.CharField(
        source='bill.vendor.party.display_name', read_only=True,
    )
    recorded_by_name = serializers.CharField(
        source='recorded_by.username', read_only=True, allow_null=True,
    )

    class Meta:
        model = BillPayment
        fields = [
            'id', 'bill', 'bill_number', 'vendor_name',
            'payment_date', 'amount', 'payment_method',
            'reference_number', 'notes',
            'recorded_by', 'recorded_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class VendorBillListSerializer(TenantModelSerializer):
    """Lightweight serializer for VendorBill list views (mirrors InvoiceListSerializer)."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.party.code', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    invoice_type = serializers.SerializerMethodField()

    class Meta:
        model = VendorBill
        fields = [
            'id', 'bill_number', 'invoice_type',
            'vendor', 'vendor_name', 'vendor_code',
            'vendor_invoice_number',
            'bill_date', 'due_date', 'status',
            'total_amount', 'amount_paid', 'balance_due',
        ]

    def get_invoice_type(self, obj):
        return 'AP'


class VendorBillSerializer(TenantModelSerializer):
    """Standard serializer for VendorBill model (AP counterpart to InvoiceSerializer)."""
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.party.code', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_paid = serializers.BooleanField(read_only=True)
    invoice_type = serializers.SerializerMethodField()

    class Meta:
        model = VendorBill
        fields = [
            'id', 'bill_number', 'invoice_type',
            'vendor', 'vendor_name', 'vendor_code',
            'vendor_invoice_number', 'purchase_order',
            'bill_date', 'due_date', 'status',
            'ap_account',
            'subtotal', 'tax_amount', 'total_amount', 'amount_paid',
            'balance_due', 'is_paid',
            'journal_entry', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'created_at', 'updated_at',
            'bill_number', 'journal_entry',
            'subtotal', 'total_amount', 'amount_paid',
        ]

    def get_invoice_type(self, obj):
        return 'AP'


class VendorBillDetailSerializer(VendorBillSerializer):
    """Detailed serializer for VendorBill with nested lines and payments."""
    lines = VendorBillLineSerializer(many=True, read_only=True)
    payments = BillPaymentSerializer(many=True, read_only=True)

    class Meta(VendorBillSerializer.Meta):
        fields = VendorBillSerializer.Meta.fields + ['lines', 'payments']
