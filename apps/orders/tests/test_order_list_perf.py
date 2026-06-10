# apps/orders/tests/test_order_list_perf.py
"""
Regression tests for the order list endpoints' subtotal/num_lines.

These used to be model @property values (subtotal = sum over self.lines.all(),
num_lines = self.lines.count()) read per row by the list serializers — a query per
listed order. They are now SQL annotations (line_count / subtotal_amount). These tests
lock in BOTH correctness (same numbers the property produced) AND that the list query
count does not scale with the number of orders or lines.
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import (
    PurchaseOrder, PurchaseOrderLine,
    SalesOrder, SalesOrderLine,
)
from shared.managers import set_current_tenant
from users.models import User


class OrderListAggregationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Agg Co', subdomain='test-order-agg', is_default=True)
        cls.user = User.objects.create_user(username='agguser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='AGG-ITEM', name='Agg Item', base_uom=cls.uom,
        )

        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C-AGG', display_name='Agg Customer',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)
        cls.cust_loc = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship', address_line1='1 St', city='Chicago', state='IL', postal_code='60601',
        )

        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='V-AGG', display_name='Agg Vendor',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party)
        cls.wh_party = Party.objects.create(
            tenant=cls.tenant, party_type='OTHER', code='WH-AGG', display_name='Agg WH',
        )
        cls.wh_loc = Location.objects.create(
            tenant=cls.tenant, party=cls.wh_party, location_type='WAREHOUSE',
            name='Dock', address_line1='1 Way', city='Chicago', state='IL', postal_code='60601',
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)

    def _make_so(self, number, line_specs):
        so = SalesOrder.objects.create(
            tenant=self.tenant, customer=self.customer, order_number=number,
            order_date=timezone.now().date(), status='draft', ship_to=self.cust_loc,
        )
        for i, (qty, price) in enumerate(line_specs, start=1):
            SalesOrderLine.objects.create(
                tenant=self.tenant, sales_order=so, line_number=i * 10, item=self.item,
                quantity_ordered=qty, uom=self.uom, unit_price=Decimal(price),
            )
        return so

    def _make_po(self, number, line_specs):
        po = PurchaseOrder.objects.create(
            tenant=self.tenant, vendor=self.vendor, po_number=number,
            order_date=timezone.now().date(), status='draft', ship_to=self.wh_loc,
        )
        for i, (qty, cost) in enumerate(line_specs, start=1):
            PurchaseOrderLine.objects.create(
                tenant=self.tenant, purchase_order=po, line_number=i * 10, item=self.item,
                quantity_ordered=qty, uom=self.uom, unit_cost=Decimal(cost),
            )
        return po

    def test_sales_list_subtotal_and_count_match_property(self):
        so = self._make_so('SO-AGG-1', [(2, '10.00'), (3, '5.50')])  # 20 + 16.50 = 36.50, 2 lines
        row = next(r for r in self.client.get('/api/v1/sales-orders/').data['results'] if r['id'] == so.id)
        self.assertEqual(row['num_lines'], 2)
        self.assertEqual(Decimal(row['subtotal']), Decimal('36.50'))  # 2*10.00 + 3*5.50

    def test_purchase_list_subtotal_and_count_match_property(self):
        po = self._make_po('PO-AGG-1', [(4, '2.25'), (1, '100.00')])  # 9 + 100 = 109, 2 lines
        row = next(r for r in self.client.get('/api/v1/purchase-orders/').data['results'] if r['id'] == po.id)
        self.assertEqual(row['num_lines'], 2)
        self.assertEqual(Decimal(row['subtotal']), Decimal('109.00'))  # 4*2.25 + 1*100.00

    def test_sales_list_subtotal_zero_with_no_lines(self):
        so = self._make_so('SO-AGG-EMPTY', [])
        row = next(r for r in self.client.get('/api/v1/sales-orders/').data['results'] if r['id'] == so.id)
        self.assertEqual(row['num_lines'], 0)
        self.assertEqual(Decimal(row['subtotal']), Decimal('0'))

    def test_sales_list_query_count_does_not_scale(self):
        """Adding more orders (each with several lines) must not add queries per order."""
        self._make_so('SO-QC-A1', [(1, '1.00'), (2, '2.00')])
        with CaptureQueriesContext(connection) as small_ctx:
            self.client.get('/api/v1/sales-orders/')
        small = len(small_ctx.captured_queries)

        for n in range(6):
            self._make_so(f'SO-QC-B{n}', [(1, '1.00'), (2, '2.00'), (3, '3.00')])
        with CaptureQueriesContext(connection) as large_ctx:
            self.client.get('/api/v1/sales-orders/')
        large = len(large_ctx.captured_queries)

        self.assertLessEqual(
            large, small,
            f'Sales order list query count scaled with rows ({small} -> {large}); '
            f'the subtotal/num_lines annotation likely regressed to per-row queries.',
        )
