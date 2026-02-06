# apps/invoicing/models.py
"""
Invoice models for billing customers.

Models:
- Invoice: Customer invoice document
- InvoiceLine: Line items on an invoice
- Payment: Payment records against invoices
"""
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from simple_history.models import HistoricalRecords
from shared.models import TenantMixin, TimestampMixin


class Invoice(TenantMixin, TimestampMixin):
    """
    Customer invoice document.

    An invoice is generated from one or more sales orders after
    shipment/delivery. It represents the billing document sent
    to the customer for payment.

    Example:
        Invoice: INV-2024-00123
        Customer: ABC Corp
        Amount: $5,000.00
        Due Date: 2024-02-15
        Status: Sent
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('sent', 'Sent'),
        ('paid', 'Paid'),
        ('partial', 'Partially Paid'),
        ('overdue', 'Overdue'),
        ('void', 'Void'),
        ('written_off', 'Written Off'),
    ]

    PAYMENT_TERMS_CHOICES = [
        ('NET30', 'Net 30'),
        ('NET15', 'Net 15'),
        ('NET45', 'Net 45'),
        ('NET60', 'Net 60'),
        ('DUE_ON_RECEIPT', 'Due on Receipt'),
        ('COD', 'Cash on Delivery'),
    ]

    invoice_number = models.CharField(
        max_length=50,
        help_text="Invoice number (unique per tenant)"
    )
    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.PROTECT,
        related_name='invoices',
        help_text="Customer being billed"
    )
    sales_order = models.ForeignKey(
        'orders.SalesOrder',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoices',
        help_text="Sales order this invoice is for (optional)"
    )
    shipment = models.ForeignKey(
        'shipping.Shipment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
        help_text="Shipment this invoice is for (optional)"
    )

    # GL Integration
    journal_entry = models.OneToOneField(
        'accounting.JournalEntry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoice',
        help_text="Journal entry created when invoice is posted"
    )
    ar_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices_ar',
        help_text="A/R account for this invoice (falls back to customer/tenant default)"
    )

    # Dates
    invoice_date = models.DateField(
        default=timezone.now,
        help_text="Date invoice was created"
    )
    due_date = models.DateField(
        help_text="Payment due date"
    )
    payment_terms = models.CharField(
        max_length=20,
        choices=PAYMENT_TERMS_CHOICES,
        default='NET30',
        help_text="Payment terms"
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="Invoice status"
    )

    # Addresses
    bill_to_name = models.CharField(
        max_length=200,
        help_text="Billing name"
    )
    bill_to_address = models.TextField(
        blank=True,
        help_text="Billing address"
    )
    ship_to_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Ship-to name"
    )
    ship_to_address = models.TextField(
        blank=True,
        help_text="Ship-to address"
    )

    # Totals
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Sum of line totals"
    )
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=0,
        help_text="Tax rate (e.g., 0.08 for 8%)"
    )
    tax_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Calculated tax amount"
    )
    freight_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Freight/shipping charges"
    )
    discount_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Discount amount"
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Total invoice amount"
    )
    amount_paid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Amount paid to date"
    )

    # Customer PO reference
    customer_po = models.CharField(
        max_length=50,
        blank=True,
        help_text="Customer's PO reference number"
    )

    notes = models.TextField(
        blank=True,
        help_text="Invoice notes (internal)"
    )
    customer_notes = models.TextField(
        blank=True,
        help_text="Notes to appear on invoice"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Invoice"
        verbose_name_plural = "Invoices"
        unique_together = [('tenant', 'invoice_number')]
        indexes = [
            models.Index(fields=['tenant', 'invoice_number']),
            models.Index(fields=['tenant', 'customer', 'invoice_date']),
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'due_date']),
        ]

    def __str__(self):
        return f"INV-{self.invoice_number}"

    @property
    def balance_due(self):
        """Amount still owed."""
        return self.total_amount - self.amount_paid

    @property
    def is_paid(self):
        """True if invoice is fully paid."""
        return self.amount_paid >= self.total_amount

    @property
    def is_overdue(self):
        """True if payment is overdue."""
        if self.status in ('paid', 'void', 'written_off', 'draft'):
            return False
        return timezone.now().date() > self.due_date

    def calculate_totals(self):
        """Recalculate subtotal and total from lines."""
        self.subtotal = sum(line.line_total for line in self.lines.all())
        self.tax_amount = self.subtotal * self.tax_rate
        self.total_amount = (
            self.subtotal + self.tax_amount +
            self.freight_amount - self.discount_amount
        )

    def save(self, *args, **kwargs):
        # Immutability guard: posted/paid invoices cannot be modified
        # (except for status transitions and amount_paid updates)
        if self.pk:
            try:
                original = Invoice.objects.get(pk=self.pk)
                if original.status in ('posted', 'paid') and self.status not in ('paid', 'partial', 'void', 'written_off'):
                    raise ValidationError(
                        "Posted/paid invoices cannot be modified. Void and recreate instead."
                    )
            except Invoice.DoesNotExist:
                pass
            # Update status based on payment
            if self.amount_paid >= self.total_amount and self.total_amount > 0:
                self.status = 'paid'
            elif self.amount_paid > 0 and self.status in ('posted', 'sent', 'overdue'):
                self.status = 'partial'
        super().save(*args, **kwargs)


class InvoiceLine(TenantMixin):
    """
    Line items on an invoice.

    Each line represents a quantity of an item being billed.
    """
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent invoice"
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='invoice_lines',
        help_text="Item being billed"
    )
    description = models.CharField(
        max_length=255,
        help_text="Line description"
    )
    quantity = models.PositiveIntegerField(
        help_text="Quantity billed"
    )
    uom = models.ForeignKey(
        'items.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='invoice_lines',
        help_text="Unit of measure"
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Price per unit"
    )
    discount_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Line discount percentage"
    )
    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Line total (calculated)"
    )

    # Source tracking
    sales_order_line = models.ForeignKey(
        'orders.SalesOrderLine',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoice_lines',
        help_text="Source sales order line"
    )

    class Meta:
        verbose_name = "Invoice Line"
        verbose_name_plural = "Invoice Lines"
        unique_together = [('invoice', 'line_number')]
        ordering = ['line_number']
        indexes = [
            models.Index(fields=['invoice', 'line_number']),
            models.Index(fields=['item']),
        ]

    def __str__(self):
        return f"{self.invoice.invoice_number} Line {self.line_number}: {self.description}"

    def save(self, *args, **kwargs):
        # Calculate line total
        gross = Decimal(self.quantity) * self.unit_price
        discount = gross * (self.discount_percent / Decimal('100'))
        self.line_total = gross - discount
        super().save(*args, **kwargs)


class Payment(TenantMixin, TimestampMixin):
    """
    Payment records against invoices.

    Tracks payments received from customers.
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

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name='payments',
        help_text="Invoice being paid"
    )
    payment_date = models.DateField(
        default=timezone.now,
        help_text="Date payment received"
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Payment amount"
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
    notes = models.TextField(
        blank=True,
        help_text="Payment notes"
    )

    # For tracking who recorded the payment
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='recorded_payments',
        help_text="User who recorded this payment"
    )

    class Meta:
        verbose_name = "Payment"
        verbose_name_plural = "Payments"
        ordering = ['-payment_date']
        indexes = [
            models.Index(fields=['tenant', 'invoice']),
            models.Index(fields=['tenant', 'payment_date']),
        ]

    def __str__(self):
        return f"Payment ${self.amount} on {self.invoice.invoice_number}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update invoice amount_paid
        total_paid = self.invoice.payments.aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0')
        self.invoice.amount_paid = total_paid
        self.invoice.save()


# ─── Vendor Bill (Accounts Payable) ──────────────────────────────────────────

class VendorBill(TenantMixin, TimestampMixin):
    """
    Vendor bill / supplier invoice for tracking amounts owed (AP).

    The AP counterpart to Invoice (AR). When a vendor sends us a bill,
    we record it here. Posting creates a journal entry that credits AP
    and debits the appropriate expense/asset accounts.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('paid', 'Paid'),
        ('partial', 'Partially Paid'),
        ('void', 'Void'),
    ]

    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.PROTECT,
        related_name='bills',
        help_text="Vendor who sent this bill"
    )
    purchase_order = models.ForeignKey(
        'orders.PurchaseOrder',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bills',
        help_text="Purchase order this bill is for (optional)"
    )
    vendor_invoice_number = models.CharField(
        max_length=100,
        help_text="Vendor's invoice/reference number"
    )
    bill_number = models.CharField(
        max_length=50,
        help_text="Internal bill number (unique per tenant)"
    )

    # Dates
    bill_date = models.DateField(
        default=timezone.now,
        help_text="Date bill was received"
    )
    due_date = models.DateField(
        help_text="Payment due date"
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="Bill status"
    )

    # GL Integration
    journal_entry = models.OneToOneField(
        'accounting.JournalEntry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendor_bill',
        help_text="Journal entry created when bill is posted"
    )
    ap_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bills_ap',
        help_text="A/P account for this bill (falls back to vendor/tenant default)"
    )

    # Totals
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Sum of line totals"
    )
    tax_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Tax amount"
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Total bill amount"
    )
    amount_paid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Amount paid to date"
    )

    notes = models.TextField(
        blank=True,
        help_text="Internal notes"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Vendor Bill"
        verbose_name_plural = "Vendor Bills"
        unique_together = [('tenant', 'bill_number')]
        indexes = [
            models.Index(fields=['tenant', 'bill_number']),
            models.Index(fields=['tenant', 'vendor', 'bill_date']),
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'due_date']),
        ]

    def __str__(self):
        return f"BILL-{self.bill_number}"

    @property
    def balance_due(self):
        """Amount still owed."""
        return self.total_amount - self.amount_paid

    @property
    def is_paid(self):
        """True if bill is fully paid."""
        return self.amount_paid >= self.total_amount

    def calculate_totals(self):
        """Recalculate subtotal and total from lines."""
        self.subtotal = sum(line.amount for line in self.lines.all())
        self.total_amount = self.subtotal + self.tax_amount

    def save(self, *args, **kwargs):
        # Immutability guard: posted/paid bills cannot be modified
        if self.pk:
            try:
                original = VendorBill.objects.get(pk=self.pk)
                if original.status in ('posted', 'paid') and self.status not in ('paid', 'partial', 'void'):
                    raise ValidationError(
                        "Posted/paid bills cannot be modified. Void and recreate instead."
                    )
            except VendorBill.DoesNotExist:
                pass
            # Update status based on payment
            if self.amount_paid >= self.total_amount and self.total_amount > 0:
                self.status = 'paid'
            elif self.amount_paid > 0 and self.status in ('posted',):
                self.status = 'partial'
        super().save(*args, **kwargs)


class VendorBillLine(TenantMixin):
    """
    Line items on a vendor bill.

    Each line represents a charge from the vendor. The expense_account
    determines where the cost is posted in the GL.

    Resolution order for expense_account:
    1. Explicit expense_account on the line
    2. item.expense_account (if item is set)
    3. item.asset_account (if inventory item)
    4. Tenant default_cogs_account
    """
    bill = models.ForeignKey(
        VendorBill,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent vendor bill"
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bill_lines',
        help_text="Item being billed (optional for non-inventory charges)"
    )
    description = models.CharField(
        max_length=255,
        help_text="Line description"
    )
    expense_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bill_lines_expense',
        help_text="Expense/asset account to debit (resolved via fallback if blank)"
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=1,
        help_text="Quantity"
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Price per unit"
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Line total (calculated)"
    )

    # Source tracking
    purchase_order_line = models.ForeignKey(
        'orders.PurchaseOrderLine',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bill_lines',
        help_text="Source purchase order line"
    )

    class Meta:
        verbose_name = "Vendor Bill Line"
        verbose_name_plural = "Vendor Bill Lines"
        unique_together = [('bill', 'line_number')]
        ordering = ['line_number']
        indexes = [
            models.Index(fields=['bill', 'line_number']),
            models.Index(fields=['item']),
        ]

    def __str__(self):
        return f"{self.bill.bill_number} Line {self.line_number}: {self.description}"

    def save(self, *args, **kwargs):
        # Calculate line total
        self.amount = self.quantity * self.unit_price
        super().save(*args, **kwargs)


class BillPayment(TenantMixin, TimestampMixin):
    """
    Payment records against vendor bills.

    Tracks payments made to vendors.
    """
    PAYMENT_METHOD_CHOICES = [
        ('CHECK', 'Check'),
        ('ACH', 'ACH/Bank Transfer'),
        ('WIRE', 'Wire Transfer'),
        ('CREDIT_CARD', 'Credit Card'),
        ('CASH', 'Cash'),
        ('DEBIT_MEMO', 'Debit Memo'),
        ('OTHER', 'Other'),
    ]

    bill = models.ForeignKey(
        VendorBill,
        on_delete=models.PROTECT,
        related_name='payments',
        help_text="Vendor bill being paid"
    )
    payment_date = models.DateField(
        default=timezone.now,
        help_text="Date payment was made"
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Payment amount"
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
    notes = models.TextField(
        blank=True,
        help_text="Payment notes"
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='recorded_bill_payments',
        help_text="User who recorded this payment"
    )

    class Meta:
        verbose_name = "Bill Payment"
        verbose_name_plural = "Bill Payments"
        ordering = ['-payment_date']
        indexes = [
            models.Index(fields=['tenant', 'bill']),
            models.Index(fields=['tenant', 'payment_date']),
        ]

    def __str__(self):
        return f"Payment ${self.amount} on {self.bill.bill_number}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update bill amount_paid
        total_paid = self.bill.payments.aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0')
        self.bill.amount_paid = total_paid
        self.bill.save()
