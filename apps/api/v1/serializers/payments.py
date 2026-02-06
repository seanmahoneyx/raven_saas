# apps/api/v1/serializers/payments.py
"""
Serializers for Customer Payments (Cash Receipts).
"""
from rest_framework import serializers
from decimal import Decimal

from .base import TenantModelSerializer
from apps.payments.models import CustomerPayment, PaymentApplication


class PaymentApplicationSerializer(TenantModelSerializer):
    """Serializer for PaymentApplication (read-only, nested in payment detail)."""
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    invoice_total = serializers.DecimalField(
        source='invoice.total_amount',
        max_digits=12,
        decimal_places=2,
        read_only=True
    )
    invoice_balance = serializers.SerializerMethodField()

    class Meta:
        model = PaymentApplication
        fields = [
            'id',
            'invoice',
            'invoice_number',
            'invoice_total',
            'invoice_balance',
            'amount_applied',
        ]

    def get_invoice_balance(self, obj):
        """Calculate invoice balance due."""
        return obj.invoice.total_amount - obj.invoice.amount_paid


class CustomerPaymentListSerializer(TenantModelSerializer):
    """Serializer for CustomerPayment list view."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)

    class Meta:
        model = CustomerPayment
        fields = [
            'id',
            'customer',
            'customer_name',
            'payment_number',
            'payment_date',
            'amount',
            'payment_method',
            'reference_number',
            'status',
            'unapplied_amount',
            'created_at',
        ]


class CustomerPaymentDetailSerializer(TenantModelSerializer):
    """Serializer for CustomerPayment detail view."""
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    applications = PaymentApplicationSerializer(many=True, read_only=True)

    class Meta:
        model = CustomerPayment
        fields = [
            'id',
            'customer',
            'customer_name',
            'payment_number',
            'payment_date',
            'amount',
            'payment_method',
            'reference_number',
            'deposit_account',
            'status',
            'unapplied_amount',
            'journal_entry',
            'notes',
            'recorded_by',
            'applications',
            'created_at',
            'updated_at',
        ]


class CreatePaymentSerializer(serializers.Serializer):
    """Serializer for creating a draft payment."""
    customer = serializers.IntegerField(help_text="Customer ID")
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.CharField(default='CHECK')
    reference_number = serializers.CharField(required=False, default='', allow_blank=True)
    payment_date = serializers.DateField(required=False, allow_null=True)
    deposit_account = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, default='', allow_blank=True)


class ApplicationInputSerializer(serializers.Serializer):
    """Input for a single payment application."""
    invoice_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class PostPaymentSerializer(serializers.Serializer):
    """Serializer for posting a payment with applications."""
    applications = ApplicationInputSerializer(many=True)

    def validate_applications(self, value):
        """Validate at least one application."""
        if not value:
            raise serializers.ValidationError("Must specify at least one invoice application")
        return value


class OpenInvoiceSerializer(serializers.Serializer):
    """Serializer for open invoices (for application selection)."""
    id = serializers.IntegerField(read_only=True)
    invoice_number = serializers.CharField(read_only=True)
    invoice_date = serializers.DateField(read_only=True)
    due_date = serializers.DateField(read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance_due = serializers.SerializerMethodField()
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)

    def get_balance_due(self, obj):
        """Calculate balance due."""
        return obj.total_amount - obj.amount_paid
