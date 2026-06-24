# apps/inventory/tests/test_picking.py
"""
Tests for the PickingService and Pick → Invoice flow (AR mirror of receiving).

Covers:
- A pick posts with status 'posted' and no GL/inventory impact
- create_invoice_from_picks links invoice lines back via pick_ticket_line,
  increments pick-line + SO-line quantity_invoiced, and rolls pick status
- remaining-to-invoice math after partial invoicing
- Cannot over-invoice the same pick line beyond its quantity
- Status rollup: posted → partially_invoiced → invoiced
- Consolidation: multiple picks for one customer → single invoice
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.inventory.models import PickTicket, PickTicketLine
from apps.inventory.services import PickingService
from apps.invoicing.models import Invoice
from apps.invoicing.services import InvoicingService
from apps.items.models import Item, UnitOfMeasure
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.parties.models import Customer, Location, Party
from apps.tenants.models import Tenant
from apps.warehousing.models import Warehouse
from shared.managers import set_current_tenant


User = get_user_model()


class PickingServiceTestBase(TestCase):
    """Shared fixtures for picking tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='Pick Co', subdomain='pick-co', is_default=True,
        )
        cls.user = User.objects.create_user(
            username='pickuser', email='p@test.com', password='pw',
        )

        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        # Customer + Warehouse
        cls.customer_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C1', display_name='Test Customer',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.customer_party)

        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant,
            code='WH1',
            name='Main Warehouse',
            is_default=True,
        )
        # Location for SO ship_to/bill_to.
        cls.ship_to_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            code='SHIPTO',
            name='Main Dock',
            location_type='SHIP_TO',
        )

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='WIDGET', name='Widget',
            base_uom=cls.uom,
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def _make_sales_order(self, quantity_ordered=10, unit_price='5.00'):
        from apps.tenants.models import get_next_sequence_number
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            order_number=get_next_sequence_number(self.tenant, 'SO'),
            customer=self.customer,
            ship_to=self.ship_to_location,
        )
        so_line = SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=so,
            line_number=10,
            item=self.item,
            quantity_ordered=quantity_ordered,
            uom=self.uom,
            unit_price=Decimal(unit_price),
        )
        return so, so_line


class CreatePickTicketTests(PickingServiceTestBase):
    """create_pick_ticket happy path."""

    def test_create_pick_ticket(self):
        svc = PickingService(self.tenant, self.user)
        pick = svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            lines=[{
                'item': self.item,
                'quantity': 10,
                'unit_price': Decimal('5.00'),
            }],
        )
        self.assertEqual(pick.status, 'posted')
        self.assertEqual(pick.lines.count(), 1)
        line = pick.lines.first()
        self.assertEqual(line.quantity, 10)
        self.assertEqual(line.quantity_invoiced, 0)
        self.assertEqual(line.quantity_remaining_to_invoice, 10)
        self.assertTrue(pick.pick_number.startswith('PT-'))


class CreateInvoiceFromPicksTests(PickingServiceTestBase):
    """Pick → Invoice linkage, counters, status rollup."""

    def test_create_invoice_from_one_pick_links_lines(self):
        so, so_line = self._make_sales_order(quantity_ordered=10, unit_price='5.00')
        pick_svc = PickingService(self.tenant, self.user)
        pick = pick_svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            sales_order=so,
            lines=[{
                'item': self.item,
                'quantity': 10,
                'sales_order_line': so_line,
            }],
        )
        pick_line = pick.lines.first()

        inv_svc = InvoicingService(self.tenant, self.user)
        invoice = inv_svc.create_invoice_from_picks(
            customer=self.customer,
            pick_lines=[{'pick_line': pick_line}],
        )

        self.assertEqual(invoice.status, 'draft')
        self.assertEqual(invoice.lines.count(), 1)

        inv_line = invoice.lines.first()
        self.assertEqual(inv_line.pick_ticket_line_id, pick_line.pk)
        self.assertEqual(inv_line.quantity, 10)
        self.assertEqual(inv_line.uom_id, so_line.uom_id)

        # Pick line counter + status
        pick_line.refresh_from_db()
        self.assertEqual(pick_line.quantity_invoiced, 10)
        pick.refresh_from_db()
        self.assertEqual(pick.status, 'invoiced')

        # SO line counter mirrored
        so_line.refresh_from_db()
        self.assertEqual(so_line.quantity_invoiced, 10)
        self.assertTrue(so_line.is_fully_invoiced)

        # Invoice header carries the SO
        self.assertEqual(invoice.sales_order_id, so.pk)

    def test_uom_falls_back_to_item_base_uom(self):
        """Direct pick with no SO line uses item.base_uom."""
        pick_svc = PickingService(self.tenant, self.user)
        pick = pick_svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            lines=[{'item': self.item, 'quantity': 4, 'unit_price': Decimal('5.00')}],
        )
        pick_line = pick.lines.first()

        inv_svc = InvoicingService(self.tenant, self.user)
        invoice = inv_svc.create_invoice_from_picks(
            customer=self.customer,
            pick_lines=[{'pick_line': pick_line}],
        )
        inv_line = invoice.lines.first()
        self.assertEqual(inv_line.uom_id, self.item.base_uom_id)

    def test_remaining_to_invoice_math(self):
        pick_svc = PickingService(self.tenant, self.user)
        pick = pick_svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            lines=[{'item': self.item, 'quantity': 10, 'unit_price': Decimal('5.00')}],
        )
        pick_line = pick.lines.first()

        inv_svc = InvoicingService(self.tenant, self.user)
        inv_svc.create_invoice_from_picks(
            customer=self.customer,
            pick_lines=[{'pick_line': pick_line, 'quantity': 4}],
        )

        pick_line.refresh_from_db()
        self.assertEqual(pick_line.quantity_invoiced, 4)
        self.assertEqual(pick_line.quantity_remaining_to_invoice, 6)
        pick.refresh_from_db()
        self.assertEqual(pick.status, 'partially_invoiced')

    def test_cannot_overinvoice_pick_line(self):
        pick_svc = PickingService(self.tenant, self.user)
        pick = pick_svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            lines=[{'item': self.item, 'quantity': 10, 'unit_price': Decimal('5.00')}],
        )
        pick_line = pick.lines.first()

        inv_svc = InvoicingService(self.tenant, self.user)
        # Invoice 7 of 10 — ok.
        inv_svc.create_invoice_from_picks(
            customer=self.customer,
            pick_lines=[{'pick_line': pick_line, 'quantity': 7}],
        )
        pick.refresh_from_db()
        self.assertEqual(pick.status, 'partially_invoiced')

        pick_line.refresh_from_db()
        # Second invoice of 5 (only 3 remain) — must raise.
        with self.assertRaises(ValidationError):
            inv_svc.create_invoice_from_picks(
                customer=self.customer,
                pick_lines=[{'pick_line': pick_line, 'quantity': 5}],
            )

    def test_status_rollup(self):
        pick_svc = PickingService(self.tenant, self.user)
        pick = pick_svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            lines=[{'item': self.item, 'quantity': 10, 'unit_price': Decimal('5.00')}],
        )
        # Unbilled = posted
        self.assertEqual(pick.status, 'posted')
        pick_line = pick.lines.first()

        inv_svc = InvoicingService(self.tenant, self.user)
        # Partial
        inv_svc.create_invoice_from_picks(
            customer=self.customer,
            pick_lines=[{'pick_line': pick_line, 'quantity': 3}],
        )
        pick.refresh_from_db()
        self.assertEqual(pick.status, 'partially_invoiced')

        # Full
        pick_line.refresh_from_db()
        inv_svc.create_invoice_from_picks(
            customer=self.customer,
            pick_lines=[{'pick_line': pick_line, 'quantity': 7}],
        )
        pick.refresh_from_db()
        self.assertEqual(pick.status, 'invoiced')

    def test_create_invoice_from_picks_consolidation(self):
        pick_svc = PickingService(self.tenant, self.user)
        pick1 = pick_svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            lines=[{'item': self.item, 'quantity': 5, 'unit_price': Decimal('5.00')}],
        )
        pick2 = pick_svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            lines=[{'item': self.item, 'quantity': 8, 'unit_price': Decimal('6.00')}],
        )

        inv_svc = InvoicingService(self.tenant, self.user)
        invoice = inv_svc.create_invoice_from_picks(
            customer=self.customer,
            pick_lines=[
                {'pick_line': pick1.lines.first()},
                {'pick_line': pick2.lines.first()},
            ],
        )

        self.assertEqual(invoice.lines.count(), 2)
        pick1.refresh_from_db()
        pick2.refresh_from_db()
        self.assertEqual(pick1.status, 'invoiced')
        self.assertEqual(pick2.status, 'invoiced')

    def test_rejects_pick_for_other_customer(self):
        other_party = Party.objects.create(
            tenant=self.tenant, party_type='CUSTOMER', code='C2', display_name='Other Customer',
        )
        other_customer = Customer.objects.create(tenant=self.tenant, party=other_party)

        pick_svc = PickingService(self.tenant, self.user)
        pick = pick_svc.create_pick_ticket(
            customer=self.customer,
            warehouse=self.warehouse,
            lines=[{'item': self.item, 'quantity': 5, 'unit_price': Decimal('5.00')}],
        )

        inv_svc = InvoicingService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            inv_svc.create_invoice_from_picks(
                customer=other_customer,
                pick_lines=[{'pick_line': pick.lines.first()}],
            )
