# apps/invoicing/tests/test_services.py
"""
Tests for InvoicingService and VendorBillService.
"""
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.invoicing.models import Invoice, InvoiceLine, VendorBill, VendorBillLine
from apps.invoicing.services import InvoicingService, VendorBillService
from apps.accounting.models import Account, AccountType, AccountingSettings
from shared.managers import set_current_tenant
from users.models import User


class InvoicingBaseTestCase(TestCase):
    """Base test case for invoicing tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Inv Co', subdomain='test-invoicing')
        cls.user = User.objects.create_user(username='invuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        # Customer
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C1', display_name='Invoice Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship', address_line1='1 Main', city='Chicago', state='IL', postal_code='60601',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)

        # Vendor
        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='V1', display_name='Bill Vendor',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party)

        # Item with GL accounts
        cls.income_account = Account.objects.create(
            tenant=cls.tenant, code='4000', name='Revenue', account_type=AccountType.REVENUE,
        )
        cls.ar_account = Account.objects.create(
            tenant=cls.tenant, code='1100', name='AR', account_type=AccountType.ASSET_CURRENT,
        )
        cls.ap_account = Account.objects.create(
            tenant=cls.tenant, code='2000', name='AP', account_type=AccountType.LIABILITY_CURRENT,
        )
        cls.cash_account = Account.objects.create(
            tenant=cls.tenant, code='1000', name='Cash', account_type=AccountType.ASSET_CURRENT,
        )
        cls.cogs_account = Account.objects.create(
            tenant=cls.tenant, code='5000', name='COGS', account_type=AccountType.EXPENSE_COGS,
        )

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='INV-ITEM', name='Invoiceable Widget',
            base_uom=cls.uom, income_account=cls.income_account,
        )

        acct = AccountingSettings.get_for_tenant(cls.tenant)
        acct.default_ar_account = cls.ar_account
        acct.default_ap_account = cls.ap_account
        acct.default_cash_account = cls.cash_account
        acct.default_income_account = cls.income_account
        acct.default_cogs_account = cls.cogs_account
        acct.save()

    def setUp(self):
        set_current_tenant(self.tenant)

    def _make_so(self):
        so = SalesOrder.objects.create(
            tenant=self.tenant, customer=self.customer,
            order_number=f'SO-{SalesOrder.objects.count() + 1:06d}',
            order_date=timezone.now().date(), status='confirmed',
            ship_to=self.cust_location,
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=50, uom=self.uom, unit_price=Decimal('10.00'),
        )
        return so


class InvoicingServiceCreateTest(InvoicingBaseTestCase):
    """Tests for invoice creation."""

    def test_create_invoice_from_order(self):
        so = self._make_so()
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_invoice_from_order(so)
        self.assertIsNotNone(invoice.pk)
        self.assertEqual(invoice.status, 'draft')
        self.assertEqual(invoice.customer, self.customer)
        self.assertEqual(invoice.lines.count(), 1)
        self.assertEqual(invoice.subtotal, Decimal('500.00'))

    def test_create_blank_invoice(self):
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_blank_invoice(customer=self.customer)
        self.assertIsNotNone(invoice.pk)
        self.assertEqual(invoice.status, 'draft')
        self.assertEqual(invoice.lines.count(), 0)

    def test_add_line_to_draft(self):
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_blank_invoice(customer=self.customer)
        line = svc.add_line(
            invoice=invoice, item=self.item, quantity=10,
            unit_price=Decimal('15.00'), uom=self.uom,
        )
        self.assertIsNotNone(line.pk)
        invoice.refresh_from_db()
        self.assertEqual(invoice.subtotal, Decimal('150.00'))

    def test_add_line_to_sent_raises(self):
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_blank_invoice(customer=self.customer)
        invoice.status = 'sent'
        invoice.save()
        with self.assertRaises(ValidationError):
            svc.add_line(
                invoice=invoice, item=self.item, quantity=5,
                unit_price=Decimal('10.00'), uom=self.uom,
            )

    def test_due_date_calculated_from_terms(self):
        so = self._make_so()
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_invoice_from_order(so, payment_terms='NET45')
        expected_due = invoice.invoice_date + timedelta(days=45)
        self.assertEqual(invoice.due_date, expected_due)


class InvoicingServiceStatusTest(InvoicingBaseTestCase):
    """Tests for invoice status transitions."""

    def test_mark_sent(self):
        so = self._make_so()
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_invoice_from_order(so)
        result = svc.mark_sent(invoice)
        self.assertEqual(result.status, 'sent')

    def test_mark_sent_non_draft_raises(self):
        so = self._make_so()
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_invoice_from_order(so)
        invoice.status = 'sent'
        invoice.save()
        with self.assertRaises(ValidationError):
            svc.mark_sent(invoice)

    def test_void_invoice(self):
        so = self._make_so()
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_invoice_from_order(so)
        result = svc.void_invoice(invoice, reason='Duplicate')
        self.assertEqual(result.status, 'void')
        self.assertIn('VOIDED', result.notes)

    def test_void_paid_raises(self):
        so = self._make_so()
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_invoice_from_order(so)
        Invoice.objects.filter(pk=invoice.pk).update(status='paid')
        invoice.refresh_from_db()
        with self.assertRaises(ValidationError):
            svc.void_invoice(invoice)


class InvoicingServicePaymentTest(InvoicingBaseTestCase):
    """Tests for record_payment and refund_payment."""

    def _make_posted_invoice(self):
        so = self._make_so()
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_invoice_from_order(so)
        invoice = svc.post_invoice(invoice)
        return invoice

    def test_record_payment(self):
        invoice = self._make_posted_invoice()
        svc = InvoicingService(self.tenant, self.user)
        payment = svc.record_payment(invoice, amount=Decimal('200.00'))
        self.assertIsNotNone(payment.pk)
        self.assertEqual(payment.amount, Decimal('200.00'))

    def test_record_payment_on_draft_raises(self):
        so = self._make_so()
        svc = InvoicingService(self.tenant, self.user)
        invoice = svc.create_invoice_from_order(so)
        with self.assertRaises(ValidationError):
            svc.record_payment(invoice, amount=Decimal('100.00'))

    def test_record_negative_amount_raises(self):
        invoice = self._make_posted_invoice()
        svc = InvoicingService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.record_payment(invoice, amount=Decimal('-10.00'))

    def test_post_invoice_creates_journal_entry(self):
        invoice = self._make_posted_invoice()
        self.assertEqual(invoice.status, 'posted')
        self.assertIsNotNone(invoice.journal_entry)
        self.assertTrue(invoice.journal_entry.is_balanced)


class VendorBillServiceTest(InvoicingBaseTestCase):
    """Tests for VendorBillService."""

    def test_create_bill(self):
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor, vendor_invoice_number='VINV-001',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        self.assertIsNotNone(bill.pk)
        self.assertEqual(bill.status, 'draft')

    def test_add_line_to_bill(self):
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor, vendor_invoice_number='VINV-002',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        line = svc.add_line(
            bill=bill, description='Test charge',
            quantity=10, unit_price=Decimal('25.00'),
            item=self.item,
        )
        self.assertIsNotNone(line.pk)
        bill.refresh_from_db()
        self.assertEqual(bill.subtotal, Decimal('250.00'))

    def test_add_line_to_posted_raises(self):
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor, vendor_invoice_number='VINV-003',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        svc.add_line(bill=bill, description='Line', quantity=1, unit_price=Decimal('100.00'), item=self.item)
        svc.post_vendor_bill(bill)
        bill.refresh_from_db()
        with self.assertRaises(ValidationError):
            svc.add_line(bill=bill, description='Extra', quantity=1, unit_price=Decimal('50.00'))

    def test_post_vendor_bill(self):
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor, vendor_invoice_number='VINV-004',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        svc.add_line(bill=bill, description='Material', quantity=5, unit_price=Decimal('20.00'), item=self.item)
        result = svc.post_vendor_bill(bill)
        self.assertEqual(result.status, 'posted')
        self.assertIsNotNone(result.journal_entry)

    def test_post_non_draft_raises(self):
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor, vendor_invoice_number='VINV-005',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        svc.add_line(bill=bill, description='X', quantity=1, unit_price=Decimal('10.00'), item=self.item)
        svc.post_vendor_bill(bill)
        bill.refresh_from_db()
        with self.assertRaises(ValidationError):
            svc.post_vendor_bill(bill)

    def test_pay_vendor_bill(self):
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor, vendor_invoice_number='VINV-006',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        svc.add_line(bill=bill, description='Goods', quantity=10, unit_price=Decimal('50.00'), item=self.item)
        svc.post_vendor_bill(bill)
        bill.refresh_from_db()
        payment = svc.pay_vendor_bill(bill, amount=Decimal('200.00'), bank_account=self.cash_account)
        self.assertIsNotNone(payment.pk)
        self.assertEqual(payment.amount, Decimal('200.00'))

    def test_pay_draft_bill_raises(self):
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor, vendor_invoice_number='VINV-007',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        with self.assertRaises(ValidationError):
            svc.pay_vendor_bill(bill, amount=Decimal('100.00'), bank_account=self.cash_account)

    def test_pay_zero_amount_raises(self):
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor, vendor_invoice_number='VINV-008',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        svc.add_line(bill=bill, description='X', quantity=1, unit_price=Decimal('10.00'), item=self.item)
        svc.post_vendor_bill(bill)
        bill.refresh_from_db()
        with self.assertRaises(ValidationError):
            svc.pay_vendor_bill(bill, amount=Decimal('0.00'), bank_account=self.cash_account)
