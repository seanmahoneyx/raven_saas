# apps/payments/models.py
"""
Customer Payment (Cash Receipts) models.

Models:
- CustomerPayment: A single check/ACH payment from a customer
- PaymentApplication: Links a payment to an invoice with an applied amount
"""
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone
from simple_history.models import HistoricalRecords
from shared.models import TenantMixin, TimestampMixin


class CustomerPayment(TenantMixin, TimestampMixin):
    """
    A single check/ACH payment from a customer that can be applied across multiple invoices.

    Workflow:
    1. Create in 'draft' status with total payment amount
    2. Apply to one or more invoices via PaymentApplication records
    3. Post to create GL journal entry (DEBIT bank, CREDIT AR)
    4. Can void to reverse the payment

    Example:
        Customer sends check for $5,000
        Applied to Invoice #123: $3,000
        Applied to Invoice #124: $2,000
        Unapplied: $0
    """
    PAYMENT_METHOD_CHOICES = [
        ('CHECK', 'Check'),
        ('ACH', 'ACH/Bank Transfer'),
        ('WIRE', 'Wire Transfer'),
        ('CREDIT_CARD', 'Credit Card'),
        ('CASH', 'Cash'),
        ('CREDIT_MEMO', 'Credit Memo'),
        ('OTHER', 'Other'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('void', 'Void'),
    ]

    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.PROTECT,
        related_name='customer_payments',
        help_text="Customer making the payment"
    )
    payment_number = models.CharField(
        max_length=30,
        help_text="Auto-generated (e.g., 'CR-202602-00001')"
    )
    payment_date = models.DateField(
        default=timezone.now,
        help_text="Date payment received"
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Total check/payment amount"
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='CHECK',
        help_text="Payment method"
    )
    reference_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Check number, transaction ID, etc."
    )
    deposit_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='customer_payments_deposit',
        help_text="Bank/cash account to deposit into"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="Payment status"
    )
    unapplied_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Amount not yet applied to invoices"
    )
    journal_entry = models.OneToOneField(
        'accounting.JournalEntry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customer_payment',
        help_text="Journal entry created when payment is posted"
    )
    notes = models.TextField(
        blank=True,
        help_text="Payment notes"
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_customer_payments',
        help_text="User who recorded this payment"
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "Customer Payment"
        verbose_name_plural = "Customer Payments"
        unique_together = [('tenant', 'payment_number')]
        indexes = [
            models.Index(fields=['tenant', 'customer', 'payment_date']),
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'payment_date']),
        ]
        ordering = ['-payment_date', '-payment_number']

    def __str__(self):
        return f"CR-{self.payment_number}"


class PaymentApplication(TenantMixin):
    """
    Links a customer payment to an invoice with an applied amount.

    This allows a single payment to be split across multiple invoices,
    or multiple payments to be applied to a single invoice.

    Example:
        Payment CR-202602-00001 ($5,000) applied to:
        - Invoice INV-202602-00123: $3,000
        - Invoice INV-202602-00124: $2,000
    """
    payment = models.ForeignKey(
        CustomerPayment,
        on_delete=models.CASCADE,
        related_name='applications',
        help_text="Customer payment being applied"
    )
    invoice = models.ForeignKey(
        'invoicing.Invoice',
        on_delete=models.PROTECT,
        related_name='payment_applications',
        help_text="Invoice receiving the payment"
    )
    amount_applied = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Amount of this payment applied to this invoice"
    )

    class Meta:
        verbose_name = "Payment Application"
        verbose_name_plural = "Payment Applications"
        unique_together = [('payment', 'invoice')]
        indexes = [
            models.Index(fields=['tenant', 'invoice']),
            models.Index(fields=['tenant', 'payment']),
        ]

    def __str__(self):
        return f"{self.payment.payment_number} → {self.invoice.invoice_number}: ${self.amount_applied}"


class OtherName(TenantMixin, TimestampMixin):
    """
    Outside service providers (not vendors) that checks can be written to.
    Examples: landlord, utility company, insurance provider, etc.
    """
    name = models.CharField(max_length=200, help_text="Full name")
    company_name = models.CharField(max_length=200, blank=True, help_text="Company/organization name")
    print_name = models.CharField(max_length=200, help_text="Name to print on checks")
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=50, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=50, default='US', blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    is_1099 = models.BooleanField(default=False, help_text="Subject to 1099 reporting")
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Other Name'
        verbose_name_plural = 'Other Names'

    def __str__(self):
        return self.company_name or self.name


class Check(TenantMixin, TimestampMixin):
    """
    A physical check to be printed and mailed.
    Can pay a vendor bill or be written to an Other Name.
    """
    CHECK_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('printed', 'Printed'),
        ('voided', 'Voided'),
        ('cleared', 'Cleared'),
    ]

    check_number = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Auto-assigned on print"
    )
    bank_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.PROTECT,
        related_name='checks',
        help_text="Bank account to draw from"
    )
    status = models.CharField(max_length=20, choices=CHECK_STATUS_CHOICES, default='draft')

    # Payee
    vendor = models.ForeignKey(
        'parties.Vendor', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='checks'
    )
    other_name = models.ForeignKey(
        'OtherName', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='checks'
    )
    payee_name = models.CharField(max_length=200, help_text="Name printed on check")
    payee_address = models.TextField(blank=True)

    # Details
    check_date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    memo = models.CharField(max_length=200, blank=True)

    # Links
    bill_payment = models.OneToOneField(
        'invoicing.BillPayment', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='written_check'
    )
    journal_entry = models.OneToOneField(
        'accounting.JournalEntry', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='written_check'
    )

    # Print tracking
    printed_at = models.DateTimeField(null=True, blank=True)
    printed_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='printed_checks'
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['-check_date', '-check_number']

    def __str__(self):
        num = self.check_number or 'DRAFT'
        return f"Check #{num} - {self.payee_name} - ${self.amount}"
