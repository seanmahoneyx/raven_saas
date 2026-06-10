"""
Regression tests for atomic line rebuilds in the order write serializers.

`update()` replaces an order's lines by deleting them all and re-creating from
the payload. If a line insert fails partway through, the order must not be left
with its lines deleted-but-not-rebuilt; the whole rebuild has to roll back.
"""
from decimal import Decimal
from unittest import mock

from django.db import IntegrityError
from django.utils import timezone

from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import Item
from apps.orders.models import (
    SalesOrder, SalesOrderLine,
    PurchaseOrder, PurchaseOrderLine,
)
from apps.api.v1.serializers.orders import (
    PurchaseOrderWriteSerializer, SalesOrderWriteSerializer,
)
from shared.testing import BaseTestCase


class OrderLineRebuildAtomicityTest(BaseTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='ITEM-1', name='Widget',
            division='corrugated', base_uom=cls.uom, is_active=True,
        )
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C1',
            display_name='Cust', is_active=True,
        )
        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='V1',
            display_name='Vend', is_active=True,
        )
        cls.cust_loc = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, name='Main',
            location_type='shipping', is_default=True,
        )
        cls.vend_loc = Location.objects.create(
            tenant=cls.tenant, party=cls.vend_party, name='Main',
            location_type='shipping', is_default=True,
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party)

    def _make_po(self):
        po = PurchaseOrder.objects.create(
            tenant=self.tenant, vendor=self.vendor, po_number='PO-1',
            order_date=timezone.now().date(), status='draft', ship_to=self.vend_loc,
        )
        for n in (10, 20):
            PurchaseOrderLine.objects.create(
                tenant=self.tenant, purchase_order=po, line_number=n,
                item=self.item, quantity_ordered=1, uom=self.uom, unit_cost=Decimal('1.00'),
            )
        return po

    def _make_so(self):
        so = SalesOrder.objects.create(
            tenant=self.tenant, customer=self.customer, order_number='SO-1',
            order_date=timezone.now().date(), status='draft', ship_to=self.cust_loc,
        )
        for n in (10, 20):
            SalesOrderLine.objects.create(
                tenant=self.tenant, sales_order=so, line_number=n,
                item=self.item, quantity_ordered=1, uom=self.uom, unit_price=Decimal('1.00'),
            )
        return so

    def test_po_update_preserves_lines_on_failure(self):
        po = self._make_po()
        validated = {'lines': [
            {'item': self.item, 'quantity_ordered': 5, 'uom': self.uom, 'unit_cost': Decimal('2.00')},
        ]}
        with mock.patch.object(PurchaseOrderLine.objects, 'create', side_effect=IntegrityError('boom')):
            with self.assertRaises(IntegrityError):
                PurchaseOrderWriteSerializer().update(po, validated)
        po.refresh_from_db()
        self.assertEqual(po.lines.count(), 2)

    def test_so_update_preserves_lines_on_failure(self):
        so = self._make_so()
        validated = {'lines': [
            {'item': self.item, 'quantity_ordered': 5, 'uom': self.uom, 'unit_price': Decimal('2.00')},
        ]}
        with mock.patch.object(SalesOrderLine.objects, 'create', side_effect=IntegrityError('boom')):
            with self.assertRaises(IntegrityError):
                SalesOrderWriteSerializer().update(so, validated)
        so.refresh_from_db()
        self.assertEqual(so.lines.count(), 2)
