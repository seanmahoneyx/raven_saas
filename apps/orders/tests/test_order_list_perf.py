"""
Regression tests for the Customer/Vendor list KPI annotations.

The Customer and Vendor list querysets annotate several aggregates over
*different* to-many relations in a single queryset (e.g. sales-order lines plus
invoices plus estimates). Summing across multiple joined relations in one query
causes a cross-join fan-out that multiplies the SUM()-based totals by the row
counts of the unrelated relations. These tests pin the correct, un-inflated
values.
"""
from decimal import Decimal

from django.utils import timezone

from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import Item
from apps.orders.models import (
    SalesOrder, SalesOrderLine,
    PurchaseOrder, PurchaseOrderLine,
    Estimate, RFQ,
)
from apps.invoicing.models import Invoice, VendorBill
from apps.api.v1.views.parties import CustomerViewSet, VendorViewSet
from shared.testing import BaseTestCase


class CustomerKPIAggregateTest(BaseTestCase):
    """open_sales_total must not be inflated by joined invoices/estimates."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='ITEM-1', name='Widget',
            division='corrugated', base_uom=cls.uom, is_active=True,
        )
        cls.party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C1',
            display_name='KPI Customer', is_active=True,
        )
        cls.location = Location.objects.create(
            tenant=cls.tenant, party=cls.party, name='Main',
            location_type='billing', is_default=True,
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.party)

        # Two active sales orders, two lines each -> true open_sales_total = 50.00
        line_specs = [
            [(Decimal('10.00'), 2), (Decimal('5.00'), 3)],   # 20 + 15
            [(Decimal('7.00'), 1), (Decimal('2.00'), 4)],    # 7 + 8
        ]
        for i, lines in enumerate(line_specs):
            so = SalesOrder.objects.create(
                tenant=cls.tenant, customer=cls.customer,
                order_number=f'SO-{i:06d}', order_date=timezone.now().date(),
                status='confirmed', ship_to=cls.location,
            )
            for n, (price, qty) in enumerate(lines):
                SalesOrderLine.objects.create(
                    tenant=cls.tenant, sales_order=so, line_number=(n + 1) * 10,
                    item=cls.item, quantity_ordered=qty, uom=cls.uom, unit_price=price,
                )

        # Unrelated relations that previously fanned out the SUM.
        for i in range(3):
            Invoice.objects.create(
                tenant=cls.tenant, customer=cls.customer,
                invoice_number=f'INV-{i:06d}', due_date=timezone.now().date(),
                subtotal=Decimal('100.00'), status='posted',
            )
        for i in range(2):
            Estimate.objects.create(
                tenant=cls.tenant, customer=cls.customer,
                estimate_number=f'EST-{i:06d}', date=timezone.now().date(),
                status='draft',
            )

    def test_open_sales_total_not_inflated(self):
        qs = CustomerViewSet().get_queryset()
        row = qs.get(pk=self.customer.pk)
        self.assertEqual(row.open_sales_total, Decimal('50.00'))


class VendorKPIAggregateTest(BaseTestCase):
    """open_po_total must not be inflated by joined bills/RFQs."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='ITEM-1', name='Widget',
            division='corrugated', base_uom=cls.uom, is_active=True,
        )
        cls.party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='V1',
            display_name='KPI Vendor', is_active=True,
        )
        cls.location = Location.objects.create(
            tenant=cls.tenant, party=cls.party, name='Main',
            location_type='shipping', is_default=True,
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.party)

        # Two active purchase orders, two lines each -> true open_po_total = 50.00
        line_specs = [
            [(Decimal('10.00'), 2), (Decimal('5.00'), 3)],
            [(Decimal('7.00'), 1), (Decimal('2.00'), 4)],
        ]
        for i, lines in enumerate(line_specs):
            po = PurchaseOrder.objects.create(
                tenant=cls.tenant, vendor=cls.vendor,
                po_number=f'PO-{i:06d}', order_date=timezone.now().date(),
                status='confirmed', ship_to=cls.location,
            )
            for n, (cost, qty) in enumerate(lines):
                PurchaseOrderLine.objects.create(
                    tenant=cls.tenant, purchase_order=po, line_number=(n + 1) * 10,
                    item=cls.item, quantity_ordered=qty, uom=cls.uom, unit_cost=cost,
                )

        for i in range(3):
            VendorBill.objects.create(
                tenant=cls.tenant, vendor=cls.vendor,
                bill_number=f'BILL-{i:06d}', vendor_invoice_number=f'VINV-{i}',
                bill_date=timezone.now().date(), due_date=timezone.now().date(),
                subtotal=Decimal('100.00'), status='posted',
            )
        for i in range(2):
            RFQ.objects.create(
                tenant=cls.tenant, vendor=cls.vendor,
                rfq_number=f'RFQ-{i:06d}', date=timezone.now().date(),
                status='draft',
            )

    def test_open_po_total_not_inflated(self):
        qs = VendorViewSet().get_queryset()
        row = qs.get(pk=self.vendor.pk)
        self.assertEqual(row.open_po_total, Decimal('50.00'))
