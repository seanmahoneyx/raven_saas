# apps/payments/services.py
"""
Payment service for managing customer cash receipts.

PaymentService handles:
- Creating draft payments
- Posting payments (apply to invoices and create GL entries)
- Voiding payments
- Querying open invoices
"""
from decimal import Decimal
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.models import ContentType

from .models import CustomerPayment, PaymentApplication
from apps.accounting.models import AccountingSettings, JournalEntry, JournalEntryLine
from apps.accounting.services import AccountingService


class PaymentService:
    """
    Service for managing customer payments (cash receipts).

    Usage:
        service = PaymentService(tenant, user)

        # Create draft payment
        payment = service.create_draft(
            customer=customer,
            amount=Decimal('5000.00'),
            payment_method='CHECK',
            reference_number='12345'
        )

        # Post payment with applications
        service.post_payment(
            payment_id=payment.id,
            applications=[
                {'invoice_id': 1, 'amount': Decimal('3000.00')},
                {'invoice_id': 2, 'amount': Decimal('2000.00')},
            ]
        )

        # Void payment
        service.void_payment(payment.id)
    """

    def __init__(self, tenant, user=None):
        """
        Initialize payment service.

        Args:
            tenant: Tenant instance to scope operations
            user: User performing operations (for audit trail)
        """
        self.tenant = tenant
        self.user = user

    # ===== PAYMENT CREATION =====

    def create_draft(
        self,
        customer,
        amount,
        payment_method='CHECK',
        reference_number='',
        payment_date=None,
        deposit_account=None,
        notes='',
    ):
        """
        Create a draft customer payment.

        Args:
            customer: Customer instance
            amount: Total payment amount (Decimal)
            payment_method: Payment method (CHECK, ACH, etc.)
            reference_number: Check number, transaction ID, etc.
            payment_date: Date of payment (defaults to today)
            deposit_account: Account instance for deposit (falls back to tenant default)
            notes: Payment notes

        Returns:
            CustomerPayment instance in draft status
        """
        if payment_date is None:
            payment_date = timezone.now().date()

        # Resolve deposit account
        if not deposit_account:
            acct_settings = AccountingSettings.get_for_tenant(self.tenant)
            deposit_account = acct_settings.default_cash_account

        # Generate payment number
        payment_number = self._generate_payment_number()

        return CustomerPayment.objects.create(
            tenant=self.tenant,
            customer=customer,
            payment_number=payment_number,
            payment_date=payment_date,
            amount=amount,
            payment_method=payment_method,
            reference_number=reference_number,
            deposit_account=deposit_account,
            status='draft',
            unapplied_amount=amount,
            notes=notes,
            recorded_by=self.user,
        )

    # ===== POSTING =====

    @transaction.atomic
    def post_payment(self, payment_id, applications):
        """
        Post a payment: apply to invoices and create GL journal entry.

        Creates a balanced journal entry:
        - DEBIT: Bank/Cash account (money received)
        - CREDIT: A/R account (reduce receivable)

        Args:
            payment_id: ID of the CustomerPayment to post
            applications: List of dicts: [{'invoice_id': int, 'amount': Decimal}, ...]

        Returns:
            CustomerPayment instance with status='posted'

        Raises:
            ValidationError: If validation fails
        """
        from apps.invoicing.models import Invoice

        # Lock payment for update
        payment = CustomerPayment.objects.select_for_update().get(
            id=payment_id,
            tenant=self.tenant
        )

        # Validate status
        if payment.status != 'draft':
            raise ValidationError(
                f"Cannot post payment {payment.payment_number}: status is '{payment.status}', expected 'draft'"
            )

        # Validate applications exist
        if not applications:
            raise ValidationError("Must specify at least one invoice to apply payment to")

        # Validate sum of applications
        total_applied = sum(Decimal(str(app['amount'])) for app in applications)
        if total_applied > payment.amount:
            raise ValidationError(
                f"Total applied amount ({total_applied}) exceeds payment amount ({payment.amount})"
            )

        # Load accounting settings
        acct_settings = AccountingSettings.get_for_tenant(self.tenant)

        # Validate deposit account
        deposit_account = payment.deposit_account
        if not deposit_account:
            deposit_account = acct_settings.default_cash_account
        if not deposit_account:
            raise ValidationError(
                "No deposit account specified and no default configured in Accounting Settings."
            )

        # Validate all invoices and collect them
        invoices = []
        ar_account = None
        for app in applications:
            invoice = Invoice.objects.select_for_update().get(
                id=app['invoice_id'],
                tenant=self.tenant
            )

            # Validate same customer
            if invoice.customer_id != payment.customer_id:
                raise ValidationError(
                    f"Invoice {invoice.invoice_number} belongs to a different customer"
                )

            # Validate amount
            amount = Decimal(str(app['amount']))
            if amount <= 0:
                raise ValidationError(
                    f"Application amount must be positive for invoice {invoice.invoice_number}"
                )

            balance_due = invoice.total_amount - invoice.amount_paid
            if amount > balance_due:
                raise ValidationError(
                    f"Cannot apply {amount} to invoice {invoice.invoice_number}: "
                    f"balance due is only {balance_due}"
                )

            invoices.append((invoice, amount))

            # Get AR account from first invoice
            if ar_account is None:
                ar_account = (
                    invoice.ar_account
                    or getattr(payment.customer, 'receivable_account', None)
                    or acct_settings.default_ar_account
                )

        # Validate AR account resolved
        if not ar_account:
            raise ValidationError(
                "Cannot determine A/R account for this payment."
            )

        # Create PaymentApplication records and update invoices
        for invoice, amount in invoices:
            PaymentApplication.objects.create(
                tenant=self.tenant,
                payment=payment,
                invoice=invoice,
                amount_applied=amount,
            )

            # Update invoice amount_paid (plain arithmetic so save() status logic works)
            invoice.amount_paid += amount
            invoice.save()  # Triggers status auto-update (paid/partial)

        # Calculate unapplied amount
        unapplied = payment.amount - total_applied

        # Create GL journal entry
        je_number = self._generate_je_number()

        je = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number=je_number,
            date=payment.payment_date,
            memo=f"Cash receipt {payment.payment_number} - {payment.customer}",
            reference_number=payment.reference_number,
            entry_type='standard',
            status='posted',
            source_type=ContentType.objects.get_for_model(CustomerPayment),
            source_id=payment.pk,
            posted_at=timezone.now(),
            posted_by=self.user,
            created_by=self.user,
        )

        # DEBIT: Bank/Cash (money in)
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=je,
            line_number=10,
            account=deposit_account,
            description=f"Cash receipt {payment.payment_number}",
            debit=payment.amount,
            credit=Decimal('0.00'),
        )

        # CREDIT: A/R (reduce what customer owes)
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=je,
            line_number=20,
            account=ar_account,
            description=f"A/R - Customer payment {payment.payment_number}",
            debit=Decimal('0.00'),
            credit=payment.amount,
        )

        # Update payment
        payment.status = 'posted'
        payment.unapplied_amount = unapplied
        payment.journal_entry = je
        payment.deposit_account = deposit_account
        payment.save(update_fields=['status', 'unapplied_amount', 'journal_entry', 'deposit_account'])

        return payment

    # ===== VOIDING =====

    @transaction.atomic
    def void_payment(self, payment_id):
        """
        Void a posted payment: reverse applications and GL entry.

        Args:
            payment_id: ID of the CustomerPayment to void

        Returns:
            CustomerPayment instance with status='void'

        Raises:
            ValidationError: If payment is not posted
        """
        from apps.invoicing.models import Invoice

        # Lock payment for update
        payment = CustomerPayment.objects.select_for_update().get(
            id=payment_id,
            tenant=self.tenant
        )

        # Validate status
        if payment.status != 'posted':
            raise ValidationError(
                f"Cannot void payment {payment.payment_number}: status is '{payment.status}', expected 'posted'"
            )

        # Reverse each application
        for application in payment.applications.select_related('invoice').all():
            invoice = Invoice.objects.select_for_update().get(pk=application.invoice_id)
            invoice.amount_paid -= application.amount_applied
            # Explicitly handle status reversal (save() only transitions forward)
            if invoice.amount_paid <= 0:
                invoice.amount_paid = Decimal('0.00')
                invoice.status = 'posted'
            elif invoice.amount_paid < invoice.total_amount:
                invoice.status = 'partial'
            invoice.save()

        # Delete all applications
        payment.applications.all().delete()

        # Reverse the GL journal entry
        if payment.journal_entry:
            acct_service = AccountingService(self.tenant)
            acct_service.reverse_entry(
                entry_id=payment.journal_entry.id,
                memo=f"Void customer payment {payment.payment_number}",
                created_by=self.user
            )

        # Update payment status
        payment.status = 'void'
        payment.unapplied_amount = Decimal('0.00')
        payment.save(update_fields=['status', 'unapplied_amount'])

        return payment

    # ===== QUERIES =====

    def get_open_invoices(self, customer_id):
        """
        Get all open invoices for a customer (have balance due).

        Args:
            customer_id: ID of the customer

        Returns:
            QuerySet of Invoice objects with balance_due annotation
        """
        from apps.invoicing.models import Invoice

        return Invoice.objects.filter(
            tenant=self.tenant,
            customer_id=customer_id,
            status__in=['posted', 'sent', 'partial', 'overdue']
        ).filter(
            total_amount__gt=F('amount_paid')
        ).annotate(
            balance_due=F('total_amount') - F('amount_paid')
        ).order_by('due_date')

    # ===== HELPERS =====

    def _generate_payment_number(self):
        """Generate unique payment number: CR-{YYYYMM}-{seq:05d}"""
        date_part = timezone.now().strftime('%Y%m')
        count = CustomerPayment.objects.filter(
            tenant=self.tenant,
            payment_number__startswith=date_part,
        ).count() + 1
        return f"{date_part}-{count:05d}"

    def _generate_je_number(self):
        """Generate unique journal entry number for cash receipts."""
        date_part = timezone.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"CR-JE-{date_part}",
        ).count() + 1
        return f"CR-JE-{date_part}-{count:05d}"
