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

from .models import Invoice, InvoiceLine, Payment


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
        return invoice

    def write_off(self, invoice, reason=''):
        """
        Write off an uncollectable invoice.

        Args:
            invoice: Invoice instance
            reason: Reason for write-off
        """
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
    ):
        """
        Record a payment against an invoice.

        Args:
            invoice: Invoice instance
            amount: Payment amount
            payment_method: Method (CHECK, ACH, etc.)
            reference_number: Check number, transaction ID, etc.
            payment_date: Date of payment (defaults to today)
            notes: Payment notes

        Returns:
            Payment instance
        """
        if invoice.status == 'void':
            raise ValidationError("Cannot record payment on voided invoice")

        if payment_date is None:
            payment_date = timezone.now().date()

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

        return payment

    def refund_payment(self, payment, reason=''):
        """
        Reverse a payment (delete it).

        Args:
            payment: Payment instance
            reason: Reason for refund
        """
        invoice = payment.invoice
        payment.delete()

        # Recalculate amount paid
        total_paid = invoice.payments.aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0')
        invoice.amount_paid = total_paid
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

    def _format_address(self, location):
        """Format a Location into an address string."""
        if not location:
            return ''

        parts = []
        if location.address_1:
            parts.append(location.address_1)
        if location.address_2:
            parts.append(location.address_2)

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
