# apps/invoicing/services.py
"""
Invoicing service for generating and managing invoices.

InvoicingService handles:
- Generating invoices from sales orders
- Generating invoices from shipments
- Managing invoice status
- Recording payments
- Calculating due dates based on payment terms
"""
from decimal import Decimal
from datetime import timedelta
from django.db import models, transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.models import ContentType

from .models import Invoice, InvoiceLine, Payment, VendorBill, VendorBillLine, BillPayment, TaxZone, TaxRule
from apps.accounting.models import AccountingSettings, JournalEntry, JournalEntryLine


class InvoicingService:
    """
    Service for generating and managing invoices.

    Usage:
        service = InvoicingService(tenant, user)

        # Generate invoice from sales order
        invoice = service.create_invoice_from_order(sales_order)

        # Generate invoice from shipment (all orders)
        invoice = service.create_invoice_from_shipment(shipment)

        # Record payment
        payment = service.record_payment(invoice, amount=1000, method='CHECK', reference='1234')

        # Send invoice
        service.mark_sent(invoice)
    """

    # Payment terms to days mapping
    PAYMENT_TERMS_DAYS = {
        'NET30': 30,
        'NET15': 15,
        'NET45': 45,
        'NET60': 60,
        'DUE_ON_RECEIPT': 0,
        'COD': 0,
    }

    def __init__(self, tenant, user=None):
        """
        Initialize invoicing service.

        Args:
            tenant: Tenant instance to scope operations
            user: User performing operations (for audit trail)
        """
        self.tenant = tenant
        self.user = user

    # ===== INVOICE CREATION =====

    def create_invoice_from_order(
        self,
        sales_order,
        payment_terms='NET30',
        tax_rate=Decimal('0'),
        freight_amount=Decimal('0'),
        invoice_number=None,
        invoice_date=None,
    ):
        """
        Create an invoice from a sales order.

        Args:
            sales_order: SalesOrder instance
            payment_terms: Payment terms (default NET30)
            tax_rate: Tax rate as decimal (e.g., 0.08 for 8%)
            freight_amount: Freight charges
            invoice_number: Optional custom number
            invoice_date: Optional date (defaults to today)

        Returns:
            Invoice instance
        """
        if invoice_number is None:
            invoice_number = self._generate_invoice_number()

        if invoice_date is None:
            invoice_date = timezone.now().date()

        due_date = self._calculate_due_date(invoice_date, payment_terms)

        with transaction.atomic():
            # Extract ship-to postal code for tax zone lookup
            ship_to_postal = ''
            if sales_order.ship_to and hasattr(sales_order.ship_to, 'postal_code'):
                ship_to_postal = sales_order.ship_to.postal_code or ''

            # Auto-resolve tax zone if tax_rate not explicitly provided
            resolved_tax_zone = None
            if tax_rate == Decimal('0'):
                resolved_tax_zone = self._resolve_tax_zone(ship_to_postal, sales_order.customer)
                if resolved_tax_zone:
                    tax_rate = resolved_tax_zone.rate

            # Create invoice
            invoice = Invoice.objects.create(
                tenant=self.tenant,
                invoice_number=invoice_number,
                customer=sales_order.customer,
                sales_order=sales_order,
                invoice_date=invoice_date,
                due_date=due_date,
                payment_terms=payment_terms,
                status='draft',
                bill_to_name=sales_order.customer.party.display_name,
                bill_to_address=self._format_address(sales_order.bill_to or sales_order.ship_to),
                ship_to_name=sales_order.customer.party.display_name,
                ship_to_address=self._format_address(sales_order.ship_to),
                ship_to_postal_code=ship_to_postal,
                tax_zone=resolved_tax_zone,
                customer_po=sales_order.customer_po,
                tax_rate=tax_rate,
                freight_amount=freight_amount,
            )

            # Create invoice lines from order lines
            line_number = 10
            for order_line in sales_order.lines.all():
                InvoiceLine.objects.create(
                    tenant=self.tenant,
                    invoice=invoice,
                    line_number=line_number,
                    item=order_line.item,
                    description=order_line.item.name,
                    quantity=order_line.quantity_ordered,
                    uom=order_line.uom,
                    unit_price=order_line.unit_price,
                    sales_order_line=order_line,
                )
                line_number += 10

            # Calculate totals
            invoice.calculate_totals()
            invoice.save()

            return invoice

    def create_invoice_from_shipment(
        self,
        shipment,
        payment_terms='NET30',
        tax_rate=Decimal('0'),
        freight_amount=Decimal('0'),
        invoice_number=None,
        invoice_date=None,
    ):
        """
        Create an invoice from a shipment (all orders in shipment).

        Creates a consolidated invoice for all orders in the shipment.
        All orders must be for the same customer.

        Args:
            shipment: Shipment instance
            payment_terms: Payment terms
            tax_rate: Tax rate
            freight_amount: Freight charges
            invoice_number: Optional custom number
            invoice_date: Optional date

        Returns:
            Invoice instance
        """
        # Validate all orders are same customer
        customers = set()
        for line in shipment.lines.all():
            customers.add(line.sales_order.customer_id)

        if len(customers) > 1:
            raise ValidationError(
                "Cannot create single invoice for shipment with multiple customers"
            )

        if not customers:
            raise ValidationError("Shipment has no orders")

        if invoice_number is None:
            invoice_number = self._generate_invoice_number()

        if invoice_date is None:
            invoice_date = timezone.now().date()

        due_date = self._calculate_due_date(invoice_date, payment_terms)

        # Get first order for customer info
        first_order = shipment.lines.first().sales_order

        with transaction.atomic():
            invoice = Invoice.objects.create(
                tenant=self.tenant,
                invoice_number=invoice_number,
                customer=first_order.customer,
                shipment=shipment,
                invoice_date=invoice_date,
                due_date=due_date,
                payment_terms=payment_terms,
                status='draft',
                bill_to_name=first_order.customer.party.display_name,
                bill_to_address=self._format_address(first_order.bill_to or first_order.ship_to),
                ship_to_name=first_order.customer.party.display_name,
                ship_to_address=self._format_address(first_order.ship_to),
                customer_po=first_order.customer_po,
                tax_rate=tax_rate,
                freight_amount=freight_amount,
            )

            # Create lines from all orders in shipment
            line_number = 10
            for shipment_line in shipment.lines.all():
                for order_line in shipment_line.sales_order.lines.all():
                    InvoiceLine.objects.create(
                        tenant=self.tenant,
                        invoice=invoice,
                        line_number=line_number,
                        item=order_line.item,
                        description=order_line.item.name,
                        quantity=order_line.quantity_ordered,
                        uom=order_line.uom,
                        unit_price=order_line.unit_price,
                        sales_order_line=order_line,
                    )
                    line_number += 10

            invoice.calculate_totals()
            invoice.save()

            return invoice

    def create_blank_invoice(
        self,
        customer,
        payment_terms='NET30',
        tax_rate=Decimal('0'),
        invoice_number=None,
        invoice_date=None,
    ):
        """
        Create a blank invoice (no associated order).

        Useful for miscellaneous charges.

        Args:
            customer: Customer instance
            payment_terms: Payment terms
            tax_rate: Tax rate
            invoice_number: Optional custom number
            invoice_date: Optional date

        Returns:
            Invoice instance
        """
        if invoice_number is None:
            invoice_number = self._generate_invoice_number()

        if invoice_date is None:
            invoice_date = timezone.now().date()

        due_date = self._calculate_due_date(invoice_date, payment_terms)

        return Invoice.objects.create(
            tenant=self.tenant,
            invoice_number=invoice_number,
            customer=customer,
            invoice_date=invoice_date,
            due_date=due_date,
            payment_terms=payment_terms,
            status='draft',
            bill_to_name=customer.party.display_name,
            tax_rate=tax_rate,
        )

    def add_line(
        self,
        invoice,
        item,
        quantity,
        unit_price,
        uom,
        description=None,
        discount_percent=Decimal('0'),
    ):
        """
        Add a line to an invoice.

        Args:
            invoice: Invoice instance
            item: Item instance
            quantity: Quantity
            unit_price: Price per unit
            uom: UnitOfMeasure instance
            description: Optional description (defaults to item name)
            discount_percent: Optional line discount

        Returns:
            InvoiceLine instance
        """
        if invoice.status not in ('draft',):
            raise ValidationError("Cannot modify invoice that has been sent")

        max_line = invoice.lines.aggregate(
            max_line=models.Max('line_number')
        )['max_line'] or 0
        line_number = max_line + 10

        line = InvoiceLine.objects.create(
            tenant=self.tenant,
            invoice=invoice,
            line_number=line_number,
            item=item,
            description=description or item.name,
            quantity=quantity,
            uom=uom,
            unit_price=unit_price,
            discount_percent=discount_percent,
        )

        invoice.calculate_totals()
        invoice.save()

        return line

    # ===== STATUS MANAGEMENT =====

    def post_invoice(self, invoice):
        """
        Post an invoice to the General Ledger.

        Creates a balanced journal entry:
        - DEBIT: A/R account (for total invoice amount)
        - CREDIT: Income accounts (per line item)
        - CREDIT: Sales tax liability (if applicable)

        The A/R account resolves via fallback chain:
        invoice.ar_account -> customer.receivable_account -> tenant default

        Args:
            invoice: Invoice instance in DRAFT status

        Returns:
            Invoice with status='posted' and linked journal_entry

        Raises:
            ValidationError: If invoice is not draft, or GL accounts cannot be resolved
        """
        if invoice.status != 'draft':
            raise ValidationError(
                f"Cannot post invoice {invoice.invoice_number}: status is '{invoice.status}', expected 'draft'"
            )

        # Load accounting defaults once
        acct_settings = AccountingSettings.get_for_tenant(self.tenant)

        # Resolve A/R account (fallback chain)
        ar_account = (
            invoice.ar_account
            or getattr(invoice.customer, 'receivable_account', None)
            or acct_settings.default_ar_account
        )
        if not ar_account:
            raise ValidationError(
                "Cannot post invoice: No A/R account configured. "
                "Set it on the invoice, customer, or in Accounting Settings."
            )

        # Resolve income accounts per line (validate before creating anything)
        line_accounts = []
        for line in invoice.lines.select_related('item').all():
            income_acct = (
                line.item.income_account
                or acct_settings.default_income_account
            )
            if not income_acct:
                raise ValidationError(
                    f"Missing income account for Item '{line.item.name}' (SKU: {line.item.sku}). "
                    "Set it on the item or in Accounting Settings."
                )
            line_accounts.append((line, income_acct))

        if not line_accounts:
            raise ValidationError("Cannot post invoice with no lines")

        with transaction.atomic():
            # Generate JE number
            from django.utils import timezone as tz
            je_date = invoice.invoice_date
            je_number = self._generate_je_number()

            # Create the journal entry
            je = JournalEntry.objects.create(
                tenant=self.tenant,
                entry_number=je_number,
                date=je_date,
                memo=f"Invoice {invoice.invoice_number} - {invoice.customer}",
                reference_number=invoice.invoice_number,
                entry_type='standard',
                status='posted',
                source_type=ContentType.objects.get_for_model(Invoice),
                source_id=invoice.pk,
                posted_at=tz.now(),
                posted_by=self.user,
                created_by=self.user,
            )

            line_num = 10

            # DEBIT: Accounts Receivable for total amount
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=line_num,
                account=ar_account,
                description=f"A/R - Invoice {invoice.invoice_number}",
                debit=invoice.total_amount,
                credit=Decimal('0.00'),
            )
            line_num += 10

            # CREDIT: Income accounts per invoice line
            for inv_line, income_acct in line_accounts:
                JournalEntryLine.objects.create(
                    tenant=self.tenant,
                    entry=je,
                    line_number=line_num,
                    account=income_acct,
                    description=f"{inv_line.item.name} x{inv_line.quantity}",
                    debit=Decimal('0.00'),
                    credit=inv_line.line_total,
                )
                line_num += 10

            # CREDIT: Sales tax liability (if applicable)
            # TODO: Add sales_tax_liability_account to AccountingSettings
            # For now, tax is included in the AR debit but not split to a tax account
            if invoice.tax_amount > 0:
                tax_acct = getattr(acct_settings, 'default_sales_tax_account', None)
                if tax_acct:
                    JournalEntryLine.objects.create(
                        tenant=self.tenant,
                        entry=je,
                        line_number=line_num,
                        account=tax_acct,
                        description=f"Sales tax - Invoice {invoice.invoice_number}",
                        debit=Decimal('0.00'),
                        credit=invoice.tax_amount,
                    )
                    line_num += 10

            # CREDIT: Freight income (if applicable)
            if invoice.freight_amount and invoice.freight_amount > 0:
                freight_acct = getattr(acct_settings, 'default_freight_income_account', None)
                if freight_acct:
                    JournalEntryLine.objects.create(
                        tenant=self.tenant,
                        entry=je,
                        line_number=line_num,
                        account=freight_acct,
                        description=f"Freight - Invoice {invoice.invoice_number}",
                        debit=Decimal('0.00'),
                        credit=invoice.freight_amount,
                    )
                    line_num += 10

            # Verify the entry balances
            if not je.is_balanced:
                raise ValidationError(
                    f"Journal entry is not balanced: DR={je.total_debit} CR={je.total_credit}"
                )

            # Lock the invoice to AR account used and link JE
            invoice.ar_account = ar_account
            invoice.journal_entry = je
            invoice.status = 'posted'
            Invoice.objects.filter(pk=invoice.pk).update(
                ar_account=ar_account,
                journal_entry=je,
                status='posted',
            )
            # Refresh in-memory object
            invoice.refresh_from_db()

            # Broadcast invoice update via WebSocket
            try:
                from apps.api.ws_signals import broadcast_invoice_update
                broadcast_invoice_update(
                    tenant_id=self.tenant.pk,
                    invoice_id=invoice.pk,
                    status='posted',
                    data={'invoice_number': invoice.invoice_number},
                )
            except Exception:
                pass  # Never break the main flow

            return invoice

    def mark_sent(self, invoice):
        """
        Mark invoice as sent to customer.

        Args:
            invoice: Invoice instance
        """
        if invoice.status != 'draft':
            raise ValidationError("Can only send draft invoices")

        invoice.status = 'sent'
        invoice.save()
        return invoice

    def void_invoice(self, invoice, reason=''):
        """
        Void an invoice.

        Args:
            invoice: Invoice instance
            reason: Reason for voiding
        """
        if invoice.status == 'paid':
            raise ValidationError("Cannot void a paid invoice")

        invoice.status = 'void'
        if reason:
            invoice.notes = f"{invoice.notes}\nVOIDED: {reason}".strip()
        invoice.save()

        # Broadcast invoice update via WebSocket
        try:
            from apps.api.ws_signals import broadcast_invoice_update
            broadcast_invoice_update(
                tenant_id=self.tenant.pk,
                invoice_id=invoice.pk,
                status='void',
                data={'invoice_number': invoice.invoice_number},
            )
        except Exception:
            pass  # Never break the main flow

        return invoice

    def write_off(self, invoice, reason=''):
        """
        Write off an uncollectable invoice with GL journal entry.

        Creates a balanced journal entry:
        - DEBIT: Bad Debt Expense (or general expense)
        - CREDIT: A/R account (remove receivable)

        Args:
            invoice: Invoice instance
            reason: Reason for write-off
        """
        if invoice.status in ('draft', 'void', 'paid', 'written_off'):
            raise ValidationError(
                f"Cannot write off invoice with status '{invoice.status}'"
            )

        balance_due = invoice.total_amount - invoice.amount_paid
        if balance_due <= 0:
            raise ValidationError("Invoice has no outstanding balance to write off.")

        acct_settings = AccountingSettings.get_for_tenant(self.tenant)

        # Resolve A/R account
        ar_account = (
            invoice.ar_account
            or getattr(invoice.customer, 'receivable_account', None)
            or acct_settings.default_ar_account
        )

        # Resolve bad debt expense account (fall back to general COGS if no specific one)
        bad_debt_account = getattr(acct_settings, 'default_bad_debt_account', None)
        if not bad_debt_account:
            # Fall back: look for an EXPENSE_OTHER account, or use COGS
            from apps.accounting.models import Account, AccountType
            bad_debt_account = Account.objects.filter(
                tenant=self.tenant,
                account_type=AccountType.EXPENSE_OTHER,
                is_active=True,
            ).first()
        if not bad_debt_account:
            bad_debt_account = acct_settings.default_cogs_account

        with transaction.atomic():
            if ar_account and bad_debt_account:
                je_number = self._generate_writeoff_je_number()

                je = JournalEntry.objects.create(
                    tenant=self.tenant,
                    entry_number=je_number,
                    date=timezone.now().date(),
                    memo=f"Write-off Invoice {invoice.invoice_number} - {reason or 'Uncollectable'}",
                    reference_number=invoice.invoice_number,
                    entry_type='standard',
                    status='posted',
                    source_type=ContentType.objects.get_for_model(Invoice),
                    source_id=invoice.pk,
                    posted_at=timezone.now(),
                    posted_by=self.user,
                    created_by=self.user,
                )

                # DEBIT: Bad Debt Expense
                JournalEntryLine.objects.create(
                    tenant=self.tenant,
                    entry=je,
                    line_number=10,
                    account=bad_debt_account,
                    description=f"Bad debt write-off - {invoice.invoice_number}",
                    debit=balance_due,
                    credit=Decimal('0.00'),
                )

                # CREDIT: A/R (remove receivable)
                JournalEntryLine.objects.create(
                    tenant=self.tenant,
                    entry=je,
                    line_number=20,
                    account=ar_account,
                    description=f"A/R write-off - {invoice.invoice_number}",
                    debit=Decimal('0.00'),
                    credit=balance_due,
                )

            invoice.status = 'written_off'
            if reason:
                invoice.notes = f"{invoice.notes}\nWRITTEN OFF: {reason}".strip()
            invoice.save()
            return invoice

    def check_overdue(self, invoice):
        """
        Check if invoice is overdue and update status.

        Args:
            invoice: Invoice instance

        Returns:
            bool: True if overdue
        """
        if invoice.is_overdue and invoice.status == 'sent':
            invoice.status = 'overdue'
            invoice.save()
            try:
                from apps.notifications.services import notify_group
                notify_group(
                    tenant=self.tenant,
                    group_name='Accounting',
                    title=f'Invoice {invoice.invoice_number} is Overdue',
                    message=f'Amount due: ${invoice.balance_due}',
                    link=f'/invoices/{invoice.id}',
                    notification_type='WARNING',
                )
            except Exception:
                pass
            return True
        return False

    def update_all_overdue(self):
        """
        Update status on all overdue invoices.

        Returns:
            int: Number of invoices marked overdue
        """
        today = timezone.now().date()
        count = Invoice.objects.filter(
            tenant=self.tenant,
            status='sent',
            due_date__lt=today,
        ).update(status='overdue')
        return count

    # ===== PAYMENTS =====

    def record_payment(
        self,
        invoice,
        amount,
        payment_method='CHECK',
        reference_number='',
        payment_date=None,
        notes='',
        bank_account=None,
    ):
        """
        Record a payment against an invoice and create GL journal entry.

        Creates a balanced journal entry:
        - DEBIT: Bank/Cash account (money received)
        - CREDIT: A/R account from the invoice (reduce receivable)

        Args:
            invoice: Invoice instance (must be posted/sent/partial/overdue)
            amount: Payment amount (Decimal)
            payment_method: Method (CHECK, ACH, etc.)
            reference_number: Check number, transaction ID, etc.
            payment_date: Date of payment (defaults to today)
            notes: Payment notes
            bank_account: Account instance for cash/bank (falls back to tenant default)

        Returns:
            Payment instance

        Raises:
            ValidationError: If invoice is not in payable status or no bank account
        """
        if invoice.status in ('draft', 'void', 'written_off'):
            raise ValidationError(
                f"Cannot record payment on invoice with status '{invoice.status}'"
            )

        if amount <= 0:
            raise ValidationError("Payment amount must be positive")

        if payment_date is None:
            payment_date = timezone.now().date()

        # Resolve bank account
        if not bank_account:
            acct_settings = AccountingSettings.get_for_tenant(self.tenant)
            bank_account = acct_settings.default_cash_account
        if not bank_account:
            raise ValidationError(
                "No bank/cash account specified and no default configured in Accounting Settings."
            )

        # Resolve AR account from the invoice (should have been set at posting)
        ar_account = invoice.ar_account
        if not ar_account:
            acct_settings = AccountingSettings.get_for_tenant(self.tenant)
            ar_account = (
                getattr(invoice.customer, 'receivable_account', None)
                or acct_settings.default_ar_account
            )
        if not ar_account:
            raise ValidationError(
                "Cannot determine A/R account for this invoice."
            )

        with transaction.atomic():
            # Create GL journal entry for the payment
            from django.utils import timezone as tz
            je_number = self._generate_payment_je_number()

            je = JournalEntry.objects.create(
                tenant=self.tenant,
                entry_number=je_number,
                date=payment_date,
                memo=f"Payment received - Invoice {invoice.invoice_number}",
                reference_number=reference_number or invoice.invoice_number,
                entry_type='standard',
                status='posted',
                source_type=ContentType.objects.get_for_model(Payment),
                source_id=None,  # Will update after payment created
                posted_at=tz.now(),
                posted_by=self.user,
                created_by=self.user,
            )

            # DEBIT: Bank/Cash (money in)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=10,
                account=bank_account,
                description=f"Payment received - {invoice.invoice_number}",
                debit=amount,
                credit=Decimal('0.00'),
            )

            # CREDIT: A/R (reduce what customer owes)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=20,
                account=ar_account,
                description=f"A/R payment - {invoice.invoice_number}",
                debit=Decimal('0.00'),
                credit=amount,
            )

            # Create Payment record
            payment = Payment.objects.create(
                tenant=self.tenant,
                invoice=invoice,
                payment_date=payment_date,
                amount=amount,
                payment_method=payment_method,
                reference_number=reference_number,
                notes=notes,
                recorded_by=self.user,
            )

            # Link JE source to the payment
            je.source_id = payment.pk
            je.source_type = ContentType.objects.get_for_model(Payment)
            je.save(update_fields=['source_id', 'source_type'])

            # Broadcast payment received via WebSocket
            try:
                from apps.api.ws_signals import broadcast_invoice_payment
                invoice.refresh_from_db()
                broadcast_invoice_payment(
                    tenant_id=self.tenant.pk,
                    invoice_id=invoice.pk,
                    invoice_number=invoice.invoice_number,
                    amount=amount,
                    new_status=invoice.status,
                )
            except Exception:
                pass  # Never break the main flow

            return payment

    def refund_payment(self, payment, reason=''):
        """
        Reverse a payment with GL journal entry.

        Creates a reversing journal entry:
        - DEBIT: A/R account (restore receivable)
        - CREDIT: Bank/Cash account (money returned)

        Then deletes the payment record and recalculates invoice totals.

        Args:
            payment: Payment instance
            reason: Reason for refund
        """
        invoice = payment.invoice

        acct_settings = AccountingSettings.get_for_tenant(self.tenant)

        # Resolve accounts (same as record_payment but reversed)
        ar_account = (
            invoice.ar_account
            or getattr(invoice.customer, 'receivable_account', None)
            or acct_settings.default_ar_account
        )
        bank_account = acct_settings.default_cash_account

        with transaction.atomic():
            if ar_account and bank_account:
                je_number = self._generate_refund_je_number()

                je = JournalEntry.objects.create(
                    tenant=self.tenant,
                    entry_number=je_number,
                    date=timezone.now().date(),
                    memo=f"Payment reversal - Invoice {invoice.invoice_number} - {reason or 'Refund'}",
                    reference_number=payment.reference_number or invoice.invoice_number,
                    entry_type='reversing',
                    status='posted',
                    posted_at=timezone.now(),
                    posted_by=self.user,
                    created_by=self.user,
                )

                # DEBIT: A/R (restore what customer owes)
                JournalEntryLine.objects.create(
                    tenant=self.tenant,
                    entry=je,
                    line_number=10,
                    account=ar_account,
                    description=f"Payment reversal - {invoice.invoice_number}",
                    debit=payment.amount,
                    credit=Decimal('0.00'),
                )

                # CREDIT: Bank/Cash (money out)
                JournalEntryLine.objects.create(
                    tenant=self.tenant,
                    entry=je,
                    line_number=20,
                    account=bank_account,
                    description=f"Payment reversal - {invoice.invoice_number}",
                    debit=Decimal('0.00'),
                    credit=payment.amount,
                )

            # Delete the payment
            payment.delete()

            # Recalculate amount paid
            total_paid = invoice.payments.aggregate(
                total=models.Sum('amount')
            )['total'] or Decimal('0')
            invoice.amount_paid = total_paid

            # Update status based on remaining balance
            if total_paid <= 0 and invoice.status == 'paid':
                invoice.status = 'posted'
            elif total_paid > 0 and total_paid < invoice.total_amount:
                invoice.status = 'partial'

            invoice.save()
            return invoice

    # ===== QUERIES =====

    def get_unpaid_invoices(self, customer=None):
        """Get all unpaid invoices."""
        qs = Invoice.objects.filter(
            tenant=self.tenant,
            status__in=['sent', 'partial', 'overdue'],
        )
        if customer:
            qs = qs.filter(customer=customer)
        return qs.order_by('due_date')

    def get_overdue_invoices(self, customer=None):
        """Get all overdue invoices."""
        today = timezone.now().date()
        qs = Invoice.objects.filter(
            tenant=self.tenant,
            status__in=['sent', 'partial', 'overdue'],
            due_date__lt=today,
        )
        if customer:
            qs = qs.filter(customer=customer)
        return qs.order_by('due_date')

    def get_customer_balance(self, customer):
        """
        Get total balance due for a customer.

        Returns:
            Decimal: Total balance due
        """
        from django.db.models import Sum, F
        result = Invoice.objects.filter(
            tenant=self.tenant,
            customer=customer,
            status__in=['sent', 'partial', 'overdue'],
        ).aggregate(
            balance=Sum(F('total_amount') - F('amount_paid'))
        )
        return result['balance'] or Decimal('0')

    def get_invoices_for_period(self, start_date, end_date, customer=None):
        """Get invoices for a date range."""
        qs = Invoice.objects.filter(
            tenant=self.tenant,
            invoice_date__gte=start_date,
            invoice_date__lte=end_date,
        )
        if customer:
            qs = qs.filter(customer=customer)
        return qs.order_by('invoice_date')

    # ===== HELPERS =====

    def _generate_invoice_number(self):
        """Generate unique invoice number."""
        date_part = timezone.now().strftime('%Y%m')
        seq = Invoice.objects.filter(
            tenant=self.tenant,
            invoice_number__startswith=date_part,
        ).count() + 1
        return f"{date_part}-{seq:05d}"

    def _calculate_due_date(self, invoice_date, payment_terms):
        """Calculate due date based on payment terms."""
        days = self.PAYMENT_TERMS_DAYS.get(payment_terms, 30)
        return invoice_date + timedelta(days=days)

    def _resolve_tax_zone(self, postal_code, customer):
        """
        Resolve tax zone from ship-to postal code or customer default.

        Lookup order:
        1. Exact postal code match in TaxRule
        2. Prefix match (longest match wins)
        3. Customer's default_tax_zone
        4. None (no tax)

        Args:
            postal_code: Ship-to zip/postal code
            customer: Customer instance

        Returns:
            TaxZone instance or None
        """
        if postal_code:
            postal_code = postal_code.strip()
            # Try exact match first
            exact = TaxRule.objects.filter(
                tenant=self.tenant,
                postal_code=postal_code,
                tax_zone__is_active=True,
            ).select_related('tax_zone').first()
            if exact:
                return exact.tax_zone

            # Try prefix match (longest prefix wins)
            for length in range(len(postal_code) - 1, 0, -1):
                prefix = postal_code[:length]
                prefix_match = TaxRule.objects.filter(
                    tenant=self.tenant,
                    postal_code=prefix,
                    tax_zone__is_active=True,
                ).select_related('tax_zone').first()
                if prefix_match:
                    return prefix_match.tax_zone

        # Fallback to customer default
        if hasattr(customer, 'default_tax_zone') and customer.default_tax_zone:
            return customer.default_tax_zone

        return None

    def _format_address(self, location):
        """Format a Location into an address string."""
        if not location:
            return ''

        parts = []
        if location.address_line1:
            parts.append(location.address_line1)
        if location.address_line2:
            parts.append(location.address_line2)

        city_state_zip = []
        if location.city:
            city_state_zip.append(location.city)
        if location.state:
            city_state_zip.append(location.state)
        if location.postal_code:
            city_state_zip.append(location.postal_code)

        if city_state_zip:
            parts.append(', '.join(city_state_zip))

        return '\n'.join(parts)

    def _generate_je_number(self):
        """Generate unique journal entry number for invoicing."""
        from django.utils import timezone as tz
        date_part = tz.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"INV-JE-{date_part}",
        ).count() + 1
        return f"INV-JE-{date_part}-{count:05d}"

    def _generate_payment_je_number(self):
        """Generate unique journal entry number for payments."""
        from django.utils import timezone as tz
        date_part = tz.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"PMT-JE-{date_part}",
        ).count() + 1
        return f"PMT-JE-{date_part}-{count:05d}"

    def _generate_writeoff_je_number(self):
        """Generate unique journal entry number for write-offs."""
        from django.utils import timezone as tz
        date_part = tz.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"WO-JE-{date_part}",
        ).count() + 1
        return f"WO-JE-{date_part}-{count:05d}"

    def _generate_refund_je_number(self):
        """Generate unique journal entry number for payment reversals."""
        from django.utils import timezone as tz
        date_part = tz.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"REF-JE-{date_part}",
        ).count() + 1
        return f"REF-JE-{date_part}-{count:05d}"


class VendorBillService:
    """
    Service for managing vendor bills (Accounts Payable).

    Handles bill creation, GL posting, and payment recording.
    The AP counterpart to InvoicingService.

    Usage:
        service = VendorBillService(tenant, user)
        bill = service.create_bill(vendor, vendor_invoice_number='INV-001', ...)
        service.post_vendor_bill(bill)
        service.pay_vendor_bill(bill, amount=1000, bank_account=cash_account)
    """

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    # ===== BILL CREATION =====

    def create_bill(
        self,
        vendor,
        vendor_invoice_number,
        due_date,
        bill_date=None,
        purchase_order=None,
        tax_amount=Decimal('0'),
        bill_number=None,
        notes='',
    ):
        """
        Create a vendor bill in DRAFT status.

        Args:
            vendor: Vendor instance
            vendor_invoice_number: Vendor's invoice reference
            due_date: Payment due date
            bill_date: Date received (defaults to today)
            purchase_order: Optional PurchaseOrder
            tax_amount: Tax amount
            bill_number: Optional internal number (auto-generated if omitted)
            notes: Internal notes

        Returns:
            VendorBill instance
        """
        if bill_number is None:
            bill_number = self._generate_bill_number()

        if bill_date is None:
            bill_date = timezone.now().date()

        return VendorBill.objects.create(
            tenant=self.tenant,
            vendor=vendor,
            purchase_order=purchase_order,
            vendor_invoice_number=vendor_invoice_number,
            bill_number=bill_number,
            bill_date=bill_date,
            due_date=due_date,
            status='draft',
            tax_amount=tax_amount,
            notes=notes,
        )

    def add_line(
        self,
        bill,
        description,
        quantity,
        unit_price,
        item=None,
        expense_account=None,
        purchase_order_line=None,
    ):
        """
        Add a line to a vendor bill.

        Args:
            bill: VendorBill instance (must be draft)
            description: Line description
            quantity: Quantity
            unit_price: Unit price
            item: Optional Item instance
            expense_account: Optional explicit expense account
            purchase_order_line: Optional PO line reference

        Returns:
            VendorBillLine instance
        """
        if bill.status != 'draft':
            raise ValidationError("Cannot modify a posted/paid bill")

        from django.db.models import Max
        max_line = bill.lines.aggregate(max_line=Max('line_number'))['max_line'] or 0
        line_number = max_line + 10

        line = VendorBillLine.objects.create(
            tenant=self.tenant,
            bill=bill,
            line_number=line_number,
            item=item,
            description=description,
            expense_account=expense_account,
            quantity=quantity,
            unit_price=unit_price,
            purchase_order_line=purchase_order_line,
        )

        bill.calculate_totals()
        bill.save()

        return line

    # ===== GL POSTING =====

    def post_vendor_bill(self, bill):
        """
        Post a vendor bill to the General Ledger.

        Creates a balanced journal entry:
        - CREDIT: A/P account (liability — what we owe)
        - DEBIT: Expense/Asset accounts per line

        The A/P account resolves via fallback chain:
        bill.ap_account -> vendor.payable_account -> tenant default

        Args:
            bill: VendorBill instance in DRAFT status

        Returns:
            VendorBill with status='posted' and linked journal_entry

        Raises:
            ValidationError: If bill is not draft, or GL accounts cannot be resolved
        """
        if bill.status != 'draft':
            raise ValidationError(
                f"Cannot post bill {bill.bill_number}: status is '{bill.status}', expected 'draft'"
            )

        # Load accounting defaults once
        acct_settings = AccountingSettings.get_for_tenant(self.tenant)

        # Resolve A/P account (fallback chain)
        ap_account = (
            bill.ap_account
            or getattr(bill.vendor, 'payable_account', None)
            or acct_settings.default_ap_account
        )
        if not ap_account:
            raise ValidationError(
                "Cannot post bill: No A/P account configured. "
                "Set it on the bill, vendor, or in Accounting Settings."
            )

        # Resolve expense accounts per line (validate before creating anything)
        line_accounts = []
        for line in bill.lines.select_related('item').all():
            expense_acct = line.expense_account
            if not expense_acct and line.item:
                expense_acct = (
                    line.item.expense_account
                    or line.item.asset_account  # Inventory items go to asset
                    or acct_settings.default_cogs_account
                )
            if not expense_acct:
                expense_acct = acct_settings.default_cogs_account
            if not expense_acct:
                item_desc = f"Item '{line.item.name}' (SKU: {line.item.sku})" if line.item else f"Line {line.line_number}"
                raise ValidationError(
                    f"Missing expense account for {item_desc}. "
                    "Set it on the line, item, or in Accounting Settings."
                )
            line_accounts.append((line, expense_acct))

        if not line_accounts:
            raise ValidationError("Cannot post bill with no lines")

        with transaction.atomic():
            from django.utils import timezone as tz
            je_number = self._generate_je_number()

            # Create the journal entry
            je = JournalEntry.objects.create(
                tenant=self.tenant,
                entry_number=je_number,
                date=bill.bill_date,
                memo=f"Vendor Bill {bill.bill_number} - {bill.vendor}",
                reference_number=bill.vendor_invoice_number,
                entry_type='standard',
                status='posted',
                source_type=ContentType.objects.get_for_model(VendorBill),
                source_id=bill.pk,
                posted_at=tz.now(),
                posted_by=self.user,
                created_by=self.user,
            )

            line_num = 10

            # CREDIT: Accounts Payable for total amount (liability increases)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=line_num,
                account=ap_account,
                description=f"A/P - Bill {bill.bill_number}",
                debit=Decimal('0.00'),
                credit=bill.total_amount,
            )
            line_num += 10

            # DEBIT: Expense/Asset accounts per bill line
            for bill_line, expense_acct in line_accounts:
                JournalEntryLine.objects.create(
                    tenant=self.tenant,
                    entry=je,
                    line_number=line_num,
                    account=expense_acct,
                    description=f"{bill_line.description}",
                    debit=bill_line.amount,
                    credit=Decimal('0.00'),
                )
                line_num += 10

            # Verify the entry balances
            if not je.is_balanced:
                raise ValidationError(
                    f"Journal entry is not balanced: DR={je.total_debit} CR={je.total_credit}"
                )

            # Lock the bill to AP account used and link JE
            VendorBill.objects.filter(pk=bill.pk).update(
                ap_account=ap_account,
                journal_entry=je,
                status='posted',
            )
            bill.refresh_from_db()

            return bill

    # ===== PAYMENTS =====

    def pay_vendor_bill(
        self,
        bill,
        amount,
        payment_method='CHECK',
        reference_number='',
        payment_date=None,
        notes='',
        bank_account=None,
    ):
        """
        Record a payment against a vendor bill and create GL journal entry.

        Creates a balanced journal entry:
        - DEBIT: A/P account (reduce liability — what we owe less)
        - CREDIT: Bank/Cash account (money leaving)

        Args:
            bill: VendorBill instance (must be posted/partial)
            amount: Payment amount
            payment_method: Method (CHECK, ACH, etc.)
            reference_number: Check number, etc.
            payment_date: Date of payment (defaults to today)
            notes: Payment notes
            bank_account: Account instance for cash/bank (falls back to tenant default)

        Returns:
            BillPayment instance

        Raises:
            ValidationError: If bill is not payable or no bank account
        """
        if bill.status in ('draft', 'void'):
            raise ValidationError(
                f"Cannot record payment on bill with status '{bill.status}'"
            )

        if amount <= 0:
            raise ValidationError("Payment amount must be positive")

        if payment_date is None:
            payment_date = timezone.now().date()

        # Resolve bank account
        if not bank_account:
            acct_settings = AccountingSettings.get_for_tenant(self.tenant)
            bank_account = acct_settings.default_cash_account
        if not bank_account:
            raise ValidationError(
                "No bank/cash account specified and no default configured in Accounting Settings."
            )

        # AP account from the bill (set at posting)
        ap_account = bill.ap_account
        if not ap_account:
            acct_settings = AccountingSettings.get_for_tenant(self.tenant)
            ap_account = (
                getattr(bill.vendor, 'payable_account', None)
                or acct_settings.default_ap_account
            )
        if not ap_account:
            raise ValidationError(
                "Cannot determine A/P account for this bill."
            )

        with transaction.atomic():
            from django.utils import timezone as tz
            je_number = self._generate_payment_je_number()

            je = JournalEntry.objects.create(
                tenant=self.tenant,
                entry_number=je_number,
                date=payment_date,
                memo=f"Payment - Vendor Bill {bill.bill_number}",
                reference_number=reference_number or bill.vendor_invoice_number,
                entry_type='standard',
                status='posted',
                source_type=ContentType.objects.get_for_model(BillPayment),
                source_id=None,  # Updated after payment created
                posted_at=tz.now(),
                posted_by=self.user,
                created_by=self.user,
            )

            # DEBIT: A/P (reduce liability)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=10,
                account=ap_account,
                description=f"A/P payment - {bill.bill_number}",
                debit=amount,
                credit=Decimal('0.00'),
            )

            # CREDIT: Bank/Cash (money out)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=20,
                account=bank_account,
                description=f"Payment to vendor - {bill.bill_number}",
                debit=Decimal('0.00'),
                credit=amount,
            )

            # Create BillPayment record
            payment = BillPayment.objects.create(
                tenant=self.tenant,
                bill=bill,
                payment_date=payment_date,
                amount=amount,
                payment_method=payment_method,
                reference_number=reference_number,
                notes=notes,
                recorded_by=self.user,
            )

            # Link JE source to the payment
            je.source_id = payment.pk
            je.source_type = ContentType.objects.get_for_model(BillPayment)
            je.save(update_fields=['source_id', 'source_type'])

            return payment

    # ===== QUERIES =====

    def get_unpaid_bills(self, vendor=None):
        """Get all unpaid vendor bills."""
        qs = VendorBill.objects.filter(
            tenant=self.tenant,
            status__in=['posted', 'partial'],
        )
        if vendor:
            qs = qs.filter(vendor=vendor)
        return qs.order_by('due_date')

    def get_overdue_bills(self, vendor=None):
        """Get all overdue vendor bills."""
        today = timezone.now().date()
        qs = VendorBill.objects.filter(
            tenant=self.tenant,
            status__in=['posted', 'partial'],
            due_date__lt=today,
        )
        if vendor:
            qs = qs.filter(vendor=vendor)
        return qs.order_by('due_date')

    def get_vendor_balance(self, vendor):
        """Get total balance owed to a vendor."""
        from django.db.models import Sum, F
        result = VendorBill.objects.filter(
            tenant=self.tenant,
            vendor=vendor,
            status__in=['posted', 'partial'],
        ).aggregate(
            balance=Sum(F('total_amount') - F('amount_paid'))
        )
        return result['balance'] or Decimal('0')

    # ===== HELPERS =====

    def _generate_bill_number(self):
        """Generate unique bill number."""
        date_part = timezone.now().strftime('%Y%m')
        seq = VendorBill.objects.filter(
            tenant=self.tenant,
            bill_number__startswith=date_part,
        ).count() + 1
        return f"{date_part}-{seq:05d}"

    def _generate_je_number(self):
        """Generate unique journal entry number for bill postings."""
        from django.utils import timezone as tz
        date_part = tz.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"BILL-JE-{date_part}",
        ).count() + 1
        return f"BILL-JE-{date_part}-{count:05d}"

    def _generate_payment_je_number(self):
        """Generate unique journal entry number for bill payments."""
        from django.utils import timezone as tz
        date_part = tz.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"BPMT-JE-{date_part}",
        ).count() + 1
        return f"BPMT-JE-{date_part}-{count:05d}"


class DunningService:
    """Service for managing dunning/collections workflow for overdue invoices."""

    # Escalation rules: days_overdue -> dunning_status
    ESCALATION_RULES = [
        (30, 'first_notice'),
        (60, 'second_notice'),
        (90, 'final_notice'),
        (120, 'collections'),
    ]

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    def get_dunning_candidates(self, min_days_overdue=None):
        """
        Find overdue invoices eligible for dunning escalation.

        Returns list of dicts with invoice info, days overdue, current dunning status,
        and recommended next action.
        """
        from datetime import timedelta

        today = timezone.now().date()
        candidates = []

        # Find all overdue/sent invoices with outstanding balance
        overdue_invoices = Invoice.objects.filter(
            tenant=self.tenant,
            status__in=['sent', 'overdue', 'partial'],
            due_date__lt=today,
        ).select_related('customer__party').order_by('due_date')

        for invoice in overdue_invoices:
            days_overdue = (today - invoice.due_date).days

            if min_days_overdue and days_overdue < min_days_overdue:
                continue

            # Determine recommended escalation
            recommended_status = 'none'
            for threshold, status_val in self.ESCALATION_RULES:
                if days_overdue >= threshold:
                    recommended_status = status_val

            # Check if escalation is needed
            current_level = self._dunning_level(invoice.dunning_status)
            recommended_level = self._dunning_level(recommended_status)
            needs_escalation = recommended_level > current_level

            balance_due = invoice.balance_due if hasattr(invoice, 'balance_due') else str(
                Decimal(invoice.total_amount) - Decimal(invoice.amount_paid)
            )

            candidates.append({
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'customer_id': invoice.customer_id,
                'customer_name': invoice.customer.party.display_name,
                'invoice_date': str(invoice.invoice_date),
                'due_date': str(invoice.due_date),
                'total_amount': str(invoice.total_amount),
                'amount_paid': str(invoice.amount_paid),
                'balance_due': str(balance_due),
                'days_overdue': days_overdue,
                'dunning_status': invoice.dunning_status,
                'dunning_count': invoice.dunning_count,
                'last_dunning_date': str(invoice.last_dunning_date) if invoice.last_dunning_date else None,
                'recommended_action': recommended_status if needs_escalation else 'no_action',
                'needs_escalation': needs_escalation,
            })

        # Sort by days_overdue descending (most overdue first)
        candidates.sort(key=lambda c: c['days_overdue'], reverse=True)

        return candidates

    def send_dunning_notice(self, invoice, escalation_level=None):
        """
        Record a dunning notice on an invoice and escalate its status.

        Args:
            invoice: Invoice instance
            escalation_level: Override dunning_status to set. If None, auto-escalates.

        Returns:
            dict with result
        """
        if escalation_level:
            new_status = escalation_level
        else:
            # Auto-escalate to next level
            current = self._dunning_level(invoice.dunning_status)
            levels = ['none', 'first_notice', 'second_notice', 'final_notice', 'collections']
            next_idx = min(current + 1, len(levels) - 1)
            new_status = levels[next_idx]

        invoice.dunning_status = new_status
        invoice.dunning_count = (invoice.dunning_count or 0) + 1
        invoice.last_dunning_date = timezone.now()

        # Make sure invoice is marked overdue
        if invoice.status == 'sent':
            invoice.status = 'overdue'

        invoice.save()

        return {
            'invoice_id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'dunning_status': new_status,
            'dunning_count': invoice.dunning_count,
        }

    def get_dunning_summary(self):
        """
        Get a summary of dunning status across all overdue invoices.

        Returns dict with counts and totals by dunning_status.
        """
        from django.db.models import Count, Sum, Q
        from datetime import timedelta

        today = timezone.now().date()

        summary = Invoice.objects.filter(
            tenant=self.tenant,
            status__in=['sent', 'overdue', 'partial'],
            due_date__lt=today,
        ).values('dunning_status').annotate(
            count=Count('id'),
            total_balance=Sum('total_amount') - Sum('amount_paid'),
        ).order_by('dunning_status')

        total_overdue = Invoice.objects.filter(
            tenant=self.tenant,
            status__in=['sent', 'overdue', 'partial'],
            due_date__lt=today,
        ).count()

        return {
            'total_overdue_invoices': total_overdue,
            'by_status': list(summary),
        }

    def _dunning_level(self, status):
        """Convert dunning status to numeric level for comparison."""
        levels = {'none': 0, 'first_notice': 1, 'second_notice': 2, 'final_notice': 3, 'collections': 4}
        return levels.get(status, 0)
