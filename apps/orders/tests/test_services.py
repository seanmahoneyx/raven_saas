# apps/orders/tests/test_services.py
"""
Tests for order services: convert_estimate_to_order, convert_rfq_to_po, OrderService.
"""
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location, Truck
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import (
    Estimate, EstimateLine, SalesOrder, SalesOrderLine,
    RFQ, RFQLine, PurchaseOrder, PurchaseOrderLine,
)
from apps.orders.services import (
    convert_estimate_to_order, convert_rfq_to_po, OrderService,
)
from apps.warehousing.models import Warehouse
from apps.accounting.models import Account, AccountType, AccountingSettings
from shared.managers import set_current_tenant
from users.models import User


class OrderServicesBaseTestCase(TestCase):
    """Base test case with shared setup for order service tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Test Co', subdomain='test-orders')
        cls.user = User.objects.create_user(username='ordertester', password='pass')
        set_current_tenant(cls.tenant)

        # UOM
        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        # Customer party + customer + location
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='CUST1', display_name='Test Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Main', address_line1='123 Main St', city='Chicago', state='IL', postal_code='60601',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)

        # Vendor party + vendor + location
        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='VEND1', display_name='Test Vendor',
        )
        cls.vend_location = Location.objects.create(
            tenant=cls.tenant, party=cls.vend_party, location_type='WAREHOUSE',
            name='Vendor WH', address_line1='456 Oak St', city='Chicago', state='IL', postal_code='60602',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party)

        # Item
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='ITEM-001', name='Test Widget',
            base_uom=cls.uom, is_inventory=True,
        )

        # Warehouse
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant, name='Main WH', code='MAIN', is_default=True,
            location=cls.vend_location,
        )

        # Accounting setup
        cls.inv_account = Account.objects.create(
            tenant=cls.tenant, code='1200', name='Inventory', account_type=AccountType.ASSET_CURRENT,
        )
        cls.ap_account = Account.objects.create(
            tenant=cls.tenant, code='2000', name='AP', account_type=AccountType.LIABILITY_CURRENT,
        )
        cls.cogs_account = Account.objects.create(
            tenant=cls.tenant, code='5000', name='COGS', account_type=AccountType.EXPENSE_COGS,
        )
        cls.income_account = Account.objects.create(
            tenant=cls.tenant, code='4000', name='Revenue', account_type=AccountType.REVENUE,
        )
        cls.cash_account = Account.objects.create(
            tenant=cls.tenant, code='1000', name='Cash', account_type=AccountType.ASSET_CURRENT,
        )
        acct_settings = AccountingSettings.get_for_tenant(cls.tenant)
        acct_settings.default_inventory_account = cls.inv_account
        acct_settings.default_ap_account = cls.ap_account
        acct_settings.default_cogs_account = cls.cogs_account
        acct_settings.default_income_account = cls.income_account
        acct_settings.default_cash_account = cls.cash_account
        acct_settings.save()

    def setUp(self):
        set_current_tenant(self.tenant)


class ConvertEstimateToOrderTest(OrderServicesBaseTestCase):
    """Tests for convert_estimate_to_order."""

    def _make_estimate(self, status='sent', ship_to=None):
        est = Estimate.objects.create(
            tenant=self.tenant, estimate_number=f'EST-{Estimate.objects.count() + 1:06d}',
            customer=self.customer, status=status, date=timezone.now().date(),
            ship_to=ship_to or self.cust_location,
        )
        EstimateLine.objects.create(
            tenant=self.tenant, estimate=est, line_number=10,
            item=self.item, quantity=100, uom=self.uom, unit_price=Decimal('10.00'),
        )
        return est

    def test_convert_sent_estimate_to_order(self):
        est = self._make_estimate(status='sent')
        so = convert_estimate_to_order(est, self.tenant, self.user)
        self.assertIsNotNone(so.pk)
        self.assertEqual(so.status, 'draft')
        self.assertEqual(so.customer, self.customer)
        self.assertEqual(so.lines.count(), 1)
        line = so.lines.first()
        self.assertEqual(line.quantity_ordered, 100)
        self.assertEqual(line.unit_price, Decimal('10.00'))
        est.refresh_from_db()
        self.assertEqual(est.status, 'converted')

    def test_convert_accepted_estimate(self):
        est = self._make_estimate(status='accepted')
        so = convert_estimate_to_order(est, self.tenant)
        self.assertEqual(so.status, 'draft')

    def test_convert_draft_estimate_raises(self):
        est = self._make_estimate(status='draft')
        with self.assertRaises(ValidationError):
            convert_estimate_to_order(est, self.tenant)

    def test_convert_estimate_no_ship_to_uses_customer_location(self):
        est = self._make_estimate(status='sent', ship_to=None)
        # Customer party has a location, so it should fall back
        est.ship_to = None
        est.save()
        so = convert_estimate_to_order(est, self.tenant)
        self.assertIsNotNone(so.ship_to)

    def test_so_number_auto_generated(self):
        est = self._make_estimate(status='sent')
        so = convert_estimate_to_order(est, self.tenant)
        self.assertTrue(so.order_number.startswith('SO-'))

    def test_source_estimate_linked(self):
        est = self._make_estimate(status='sent')
        so = convert_estimate_to_order(est, self.tenant)
        self.assertEqual(so.source_estimate_id, est.pk)


class ConvertRfqToPoTest(OrderServicesBaseTestCase):
    """Tests for convert_rfq_to_po."""

    def _make_rfq(self, status='sent', quoted_price=Decimal('5.00')):
        rfq = RFQ.objects.create(
            tenant=self.tenant, rfq_number=f'RFQ-{RFQ.objects.count() + 1:06d}',
            vendor=self.vendor, status=status, date=timezone.now().date(),
            ship_to=self.vend_location,
        )
        RFQLine.objects.create(
            tenant=self.tenant, rfq=rfq, line_number=10,
            item=self.item, quantity=200, uom=self.uom,
            quoted_price=quoted_price,
        )
        return rfq

    def test_convert_rfq_to_po(self):
        rfq = self._make_rfq(status='sent')
        po = convert_rfq_to_po(rfq, self.tenant, self.user)
        self.assertIsNotNone(po.pk)
        self.assertEqual(po.status, 'draft')
        self.assertEqual(po.vendor, self.vendor)
        self.assertEqual(po.lines.count(), 1)
        line = po.lines.first()
        self.assertEqual(line.quantity_ordered, 200)
        self.assertEqual(line.unit_cost, Decimal('5.00'))
        rfq.refresh_from_db()
        self.assertEqual(rfq.status, 'converted')

    def test_convert_rfq_received_status(self):
        rfq = self._make_rfq(status='received')
        po = convert_rfq_to_po(rfq, self.tenant)
        self.assertEqual(po.status, 'draft')

    def test_convert_draft_rfq_raises(self):
        rfq = self._make_rfq(status='draft')
        with self.assertRaises(ValidationError):
            convert_rfq_to_po(rfq, self.tenant)

    def test_convert_rfq_no_quoted_lines_raises(self):
        rfq = RFQ.objects.create(
            tenant=self.tenant, rfq_number='RFQ-NOQUOTE',
            vendor=self.vendor, status='sent', date=timezone.now().date(),
            ship_to=self.vend_location,
        )
        RFQLine.objects.create(
            tenant=self.tenant, rfq=rfq, line_number=10,
            item=self.item, quantity=100, uom=self.uom,
            quoted_price=None,
        )
        with self.assertRaises(ValidationError):
            convert_rfq_to_po(rfq, self.tenant)

    def test_po_number_auto_generated(self):
        rfq = self._make_rfq(status='sent')
        po = convert_rfq_to_po(rfq, self.tenant)
        self.assertTrue(po.po_number.startswith('PO-'))


class OrderServiceSOTest(OrderServicesBaseTestCase):
    """Tests for OrderService sales order methods."""

    def _make_so(self, status='draft'):
        so = SalesOrder.objects.create(
            tenant=self.tenant, customer=self.customer,
            order_number=f'SO-{SalesOrder.objects.count() + 1:06d}',
            order_date=timezone.now().date(), status=status,
            ship_to=self.cust_location,
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=50, uom=self.uom, unit_price=Decimal('10.00'),
        )
        return so

    def test_confirm_draft_so(self):
        so = self._make_so(status='draft')
        svc = OrderService(self.tenant, self.user)
        result = svc.confirm_sales_order(so)
        self.assertEqual(result.status, 'confirmed')

    def test_confirm_non_draft_raises(self):
        so = self._make_so(status='confirmed')
        svc = OrderService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.confirm_sales_order(so)

    def test_cancel_confirmed_so(self):
        so = self._make_so(status='confirmed')
        svc = OrderService(self.tenant, self.user)
        result = svc.cancel_sales_order(so)
        self.assertEqual(result.status, 'cancelled')

    def test_cancel_shipped_raises(self):
        so = self._make_so(status='shipped')
        svc = OrderService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.cancel_sales_order(so)

    def test_complete_shipped_so(self):
        so = self._make_so(status='shipped')
        svc = OrderService(self.tenant, self.user)
        result = svc.complete_sales_order(so)
        self.assertEqual(result.status, 'complete')

    def test_complete_non_shipped_raises(self):
        so = self._make_so(status='confirmed')
        svc = OrderService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.complete_sales_order(so)


class OrderServicePOTest(OrderServicesBaseTestCase):
    """Tests for OrderService purchase order methods."""

    def _make_po(self, status='draft'):
        po = PurchaseOrder.objects.create(
            tenant=self.tenant, vendor=self.vendor,
            po_number=f'PO-{PurchaseOrder.objects.count() + 1:06d}',
            order_date=timezone.now().date(), status=status,
            ship_to=self.vend_location,
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant, purchase_order=po, line_number=10,
            item=self.item, quantity_ordered=100, uom=self.uom, unit_cost=Decimal('5.0000'),
        )
        return po

    def test_confirm_draft_po(self):
        po = self._make_po(status='draft')
        svc = OrderService(self.tenant, self.user)
        result = svc.confirm_purchase_order(po)
        self.assertEqual(result.status, 'confirmed')

    def test_confirm_non_draft_raises(self):
        po = self._make_po(status='confirmed')
        svc = OrderService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.confirm_purchase_order(po)

    def test_cancel_confirmed_po(self):
        po = self._make_po(status='confirmed')
        svc = OrderService(self.tenant, self.user)
        result = svc.cancel_purchase_order(po)
        self.assertEqual(result.status, 'cancelled')

    def test_cancel_shipped_po_raises(self):
        po = self._make_po(status='shipped')
        svc = OrderService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.cancel_purchase_order(po)

    def test_receive_po_full(self):
        po = self._make_po(status='confirmed')
        svc = OrderService(self.tenant, self.user)
        result = svc.receive_purchase_order(po)
        self.assertEqual(result['po_status'], 'complete')
        self.assertEqual(len(result['lots_created']), 1)

    def test_receive_non_confirmed_raises(self):
        po = self._make_po(status='draft')
        svc = OrderService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.receive_purchase_order(po)
