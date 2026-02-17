# apps/payments/tests/test_services.py
"""
Tests for PaymentService: create_draft, post_payment, void_payment, get_open_invoices.
"""
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.invoicing.models import Invoice, InvoiceLine
from apps.invoicing.services import InvoicingService
from apps.payments.models import CustomerPayment, PaymentApplication
from apps.payments.services import PaymentService
from apps.accounting.models import Account, AccountType, AccountingSettings
from apps.tenants.models import TenantSequence
from shared.managers import set_current_tenant
from users.models import User


class PaymentBaseTestCase(TestCase):
    """Base test case for payment service tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Pay Co', subdomain='test-payments')
        cls.user = User.objects.create_user(username='payuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='PC1', display_name='Payment Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship', address_line1='1 Main', city='Chicago', state='IL', postal_code='60601',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)

        # Accounting setup
        cls.income_account = Account.objects.create(
            tenant=cls.tenant, code='4000', name='Revenue', account_type=AccountType.REVENUE,
        )
        cls.ar_account = Account.objects.create(
            tenant=cls.tenant, code='1100', name='AR', account_type=AccountType.ASSET_CURRENT,
        )
        cls.cash_account = Account.objects.create(
            tenant=cls.tenant, code='1000', name='Cash', account_type=AccountType.ASSET_CURRENT,
        )
        cls.cogs_account = Account.objects.create(
            tenant=cls.tenant, code='5000', name='COGS', account_type=AccountType.EXPENSE_COGS,
        )

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='PAY-ITEM', name='Payable Widget',
            base_uom=cls.uom, income_account=cls.income_account,
        )

        acct = AccountingSettings.get_for_tenant(cls.tenant)
        acct.default_ar_account = cls.ar_account
        acct.default_cash_account = cls.cash_account
        acct.default_income_account = cls.income_account
        acct.default_cogs_account = cls.cogs_account
        acct.save()

        # Create sequences needed for JE/invoice generation
        for seq_type in ('JE', 'INV', 'SO'):
            TenantSequence.objects.get_or_create(
                tenant=cls.tenant, sequence_type=seq_type,
                defaults={'next_value': 1, 'prefix': f'{seq_type}-'},
            )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = PaymentService(self.tenant, self.user)

    def _make_posted_invoice(self, amount=Decimal('500.00')):
        """Helper: create a posted invoice with the given amount."""
        so = SalesOrder.objects.create(
            tenant=self.tenant, customer=self.customer,
            order_number=f'SO-{SalesOrder.objects.count() + 1:06d}',
            order_date=timezone.now().date(), status='confirmed',
            ship_to=self.cust_location,
        )
        qty = int(amount / Decimal('10'))
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=qty, uom=self.uom,
            unit_price=Decimal('10.00'),
        )
        inv_svc = InvoicingService(self.tenant, self.user)
        invoice = inv_svc.create_invoice_from_order(so)
        invoice = inv_svc.post_invoice(invoice)
        return invoice


class CreateDraftTest(PaymentBaseTestCase):
    """Tests for create_draft."""

    def test_create_draft_basic(self):
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('500.00'),
        )
        self.assertIsNotNone(payment.pk)
        self.assertEqual(payment.status, 'draft')
        self.assertEqual(payment.amount, Decimal('500.00'))
        self.assertEqual(payment.unapplied_amount, Decimal('500.00'))

    def test_create_draft_with_method(self):
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('100.00'),
            payment_method='ACH', reference_number='TXN-9999',
        )
        self.assertEqual(payment.payment_method, 'ACH')
        self.assertEqual(payment.reference_number, 'TXN-9999')

    def test_create_draft_auto_number(self):
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('100.00'),
        )
        self.assertTrue(len(payment.payment_number) > 0)

    def test_create_draft_default_deposit_account(self):
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('100.00'),
        )
        self.assertEqual(payment.deposit_account, self.cash_account)

    def test_create_draft_custom_deposit_account(self):
        other_bank = Account.objects.create(
            tenant=self.tenant, code='1010', name='Savings',
            account_type=AccountType.ASSET_CURRENT,
        )
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('100.00'),
            deposit_account=other_bank,
        )
        self.assertEqual(payment.deposit_account, other_bank)


class PostPaymentTest(PaymentBaseTestCase):
    """Tests for post_payment."""

    def test_post_payment_single_invoice(self):
        invoice = self._make_posted_invoice(Decimal('500.00'))
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('500.00'),
        )
        result = self.svc.post_payment(
            payment_id=payment.id,
            applications=[{'invoice_id': invoice.id, 'amount': Decimal('500.00')}],
        )
        self.assertEqual(result.status, 'posted')
        self.assertEqual(result.unapplied_amount, Decimal('0.00'))
        self.assertIsNotNone(result.journal_entry)

    def test_post_payment_partial_application(self):
        invoice = self._make_posted_invoice(Decimal('500.00'))
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('300.00'),
        )
        result = self.svc.post_payment(
            payment_id=payment.id,
            applications=[{'invoice_id': invoice.id, 'amount': Decimal('300.00')}],
        )
        self.assertEqual(result.status, 'posted')
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal('300.00'))

    def test_post_payment_multiple_invoices(self):
        inv1 = self._make_posted_invoice(Decimal('300.00'))
        inv2 = self._make_posted_invoice(Decimal('200.00'))
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('500.00'),
        )
        result = self.svc.post_payment(
            payment_id=payment.id,
            applications=[
                {'invoice_id': inv1.id, 'amount': Decimal('300.00')},
                {'invoice_id': inv2.id, 'amount': Decimal('200.00')},
            ],
        )
        self.assertEqual(result.status, 'posted')
        self.assertEqual(result.applications.count(), 2)

    def test_post_non_draft_raises(self):
        invoice = self._make_posted_invoice(Decimal('500.00'))
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('500.00'),
        )
        self.svc.post_payment(
            payment_id=payment.id,
            applications=[{'invoice_id': invoice.id, 'amount': Decimal('500.00')}],
        )
        with self.assertRaises(ValidationError):
            self.svc.post_payment(
                payment_id=payment.id,
                applications=[{'invoice_id': invoice.id, 'amount': Decimal('500.00')}],
            )

    def test_post_empty_applications_raises(self):
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('500.00'),
        )
        with self.assertRaises(ValidationError):
            self.svc.post_payment(payment_id=payment.id, applications=[])

    def test_post_overapply_raises(self):
        invoice = self._make_posted_invoice(Decimal('500.00'))
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('100.00'),
        )
        with self.assertRaises(ValidationError):
            self.svc.post_payment(
                payment_id=payment.id,
                applications=[{'invoice_id': invoice.id, 'amount': Decimal('200.00')}],
            )

    def test_post_creates_journal_entry(self):
        invoice = self._make_posted_invoice(Decimal('500.00'))
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('500.00'),
        )
        result = self.svc.post_payment(
            payment_id=payment.id,
            applications=[{'invoice_id': invoice.id, 'amount': Decimal('500.00')}],
        )
        je = result.journal_entry
        self.assertIsNotNone(je)
        self.assertEqual(je.status, 'posted')
        lines = je.lines.all()
        total_debit = sum(l.debit for l in lines)
        total_credit = sum(l.credit for l in lines)
        self.assertEqual(total_debit, Decimal('500.00'))
        self.assertEqual(total_credit, Decimal('500.00'))


class VoidPaymentTest(PaymentBaseTestCase):
    """Tests for void_payment."""

    def _make_posted_payment(self):
        invoice = self._make_posted_invoice(Decimal('500.00'))
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('500.00'),
        )
        self.svc.post_payment(
            payment_id=payment.id,
            applications=[{'invoice_id': invoice.id, 'amount': Decimal('500.00')}],
        )
        return payment, invoice

    def test_void_posted_payment(self):
        payment, invoice = self._make_posted_payment()
        result = self.svc.void_payment(payment.id)
        self.assertEqual(result.status, 'void')
        self.assertEqual(result.unapplied_amount, Decimal('0.00'))

    def test_void_reverses_invoice_amount_paid(self):
        payment, invoice = self._make_posted_payment()
        self.svc.void_payment(payment.id)
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal('0.00'))

    def test_void_deletes_applications(self):
        payment, invoice = self._make_posted_payment()
        self.svc.void_payment(payment.id)
        self.assertEqual(payment.applications.count(), 0)

    def test_void_draft_raises(self):
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('100.00'),
        )
        with self.assertRaises(ValidationError):
            self.svc.void_payment(payment.id)


class GetOpenInvoicesTest(PaymentBaseTestCase):
    """Tests for get_open_invoices."""

    def test_returns_posted_invoices(self):
        inv = self._make_posted_invoice(Decimal('500.00'))
        open_invoices = self.svc.get_open_invoices(self.customer.id)
        self.assertEqual(open_invoices.count(), 1)

    def test_excludes_paid_invoices(self):
        inv = self._make_posted_invoice(Decimal('500.00'))
        # Fully pay the invoice
        payment = self.svc.create_draft(
            customer=self.customer, amount=Decimal('500.00'),
        )
        self.svc.post_payment(
            payment_id=payment.id,
            applications=[{'invoice_id': inv.id, 'amount': Decimal('500.00')}],
        )
        open_invoices = self.svc.get_open_invoices(self.customer.id)
        self.assertEqual(open_invoices.count(), 0)

    def test_no_open_invoices(self):
        open_invoices = self.svc.get_open_invoices(self.customer.id)
        self.assertEqual(open_invoices.count(), 0)
