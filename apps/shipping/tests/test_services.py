# apps/shipping/tests/test_services.py
"""
Tests for ShippingService: shipment creation, status, delivery, BOL lifecycle.
"""
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location, Truck
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.shipping.models import Shipment, ShipmentLine, BillOfLading, BOLLine
from apps.shipping.services import ShippingService
from shared.managers import set_current_tenant
from users.models import User


class ShippingBaseTestCase(TestCase):
    """Base for shipping tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Ship Co', subdomain='test-shipping')
        cls.user = User.objects.create_user(username='shipuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='SC1', display_name='Ship Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Dock', address_line1='100 Dock St', city='Chicago', state='IL', postal_code='60601',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='SHIP-001', name='Shippable Widget', base_uom=cls.uom,
        )

        cls.truck = Truck.objects.create(tenant=cls.tenant, name='Truck 1')

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = ShippingService(self.tenant, self.user)

    def _make_so(self):
        so = SalesOrder.objects.create(
            tenant=self.tenant, customer=self.customer,
            order_number=f'SO-{SalesOrder.objects.count() + 1:06d}',
            order_date=timezone.now().date(), status='confirmed',
            ship_to=self.cust_location,
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=25, uom=self.uom, unit_price=Decimal('10.00'),
        )
        return so


class CreateShipmentTest(ShippingBaseTestCase):
    """Tests for create_shipment."""

    def test_create_empty_shipment(self):
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck,
        )
        self.assertIsNotNone(shipment.pk)
        self.assertEqual(shipment.status, 'planned')
        self.assertEqual(shipment.lines.count(), 0)

    def test_create_shipment_with_orders(self):
        so1 = self._make_so()
        so2 = self._make_so()
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck,
            sales_orders=[so1, so2],
        )
        self.assertEqual(shipment.lines.count(), 2)

    def test_add_order_to_shipment(self):
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck,
        )
        so = self._make_so()
        line = self.svc.add_order_to_shipment(shipment, so)
        self.assertIsNotNone(line.pk)
        self.assertEqual(line.delivery_status, 'pending')

    def test_remove_order_from_shipment(self):
        so = self._make_so()
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck,
            sales_orders=[so],
        )
        self.assertEqual(shipment.lines.count(), 1)
        self.svc.remove_order_from_shipment(shipment, so)
        self.assertEqual(shipment.lines.count(), 0)

    def test_auto_shipment_number(self):
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck,
        )
        self.assertTrue(len(shipment.shipment_number) > 0)


class ShipmentStatusTest(ShippingBaseTestCase):
    """Tests for shipment status transitions."""

    def _make_shipment(self):
        so = self._make_so()
        return self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck, sales_orders=[so],
        )

    def test_start_loading(self):
        shipment = self._make_shipment()
        result = self.svc.start_loading(shipment)
        self.assertEqual(result.status, 'loading')

    def test_depart(self):
        shipment = self._make_shipment()
        result = self.svc.depart(shipment)
        self.assertEqual(result.status, 'in_transit')
        self.assertIsNotNone(result.departure_time)
        # All pending lines should be 'loaded'
        for line in shipment.lines.all():
            self.assertEqual(line.delivery_status, 'loaded')

    def test_cancel_planned_shipment(self):
        shipment = self._make_shipment()
        result = self.svc.cancel_shipment(shipment)
        self.assertEqual(result.status, 'cancelled')

    def test_cancel_in_transit_raises(self):
        shipment = self._make_shipment()
        self.svc.depart(shipment)
        with self.assertRaises(ValidationError):
            self.svc.cancel_shipment(shipment)


class DeliveryTrackingTest(ShippingBaseTestCase):
    """Tests for mark_delivered and mark_refused."""

    def test_mark_delivered(self):
        so = self._make_so()
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck, sales_orders=[so],
        )
        line = shipment.lines.first()
        result = self.svc.mark_delivered(line, signature_name='John Doe')
        self.assertEqual(result.delivery_status, 'delivered')
        self.assertEqual(result.signature_name, 'John Doe')
        so.refresh_from_db()
        self.assertEqual(so.status, 'shipped')

    def test_mark_refused(self):
        so = self._make_so()
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck, sales_orders=[so],
        )
        line = shipment.lines.first()
        result = self.svc.mark_refused(line, notes='Damaged goods')
        self.assertEqual(result.delivery_status, 'refused')
        self.assertIn('Damaged', result.notes)

    def test_all_delivered_completes_shipment(self):
        so = self._make_so()
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck, sales_orders=[so],
        )
        line = shipment.lines.first()
        self.svc.mark_delivered(line, signature_name='Jane')
        shipment.refresh_from_db()
        self.assertEqual(shipment.status, 'delivered')


class BOLTest(ShippingBaseTestCase):
    """Tests for BOL generation and signing."""

    def _make_shipment_with_bol(self):
        so = self._make_so()
        shipment = self.svc.create_shipment(
            ship_date=timezone.now().date(), truck=self.truck, sales_orders=[so],
        )
        bol = self.svc.generate_bol(shipment, shipper_name='Test Shipper')
        return shipment, bol

    def test_generate_bol(self):
        shipment, bol = self._make_shipment_with_bol()
        self.assertIsNotNone(bol.pk)
        self.assertEqual(bol.status, 'draft')
        self.assertEqual(bol.shipper_name, 'Test Shipper')
        self.assertTrue(bol.lines.count() > 0)
        self.assertEqual(bol.total_pieces, 25)

    def test_issue_bol(self):
        _, bol = self._make_shipment_with_bol()
        result = self.svc.issue_bol(bol)
        self.assertEqual(result.status, 'issued')
        self.assertIsNotNone(result.issue_date)

    def test_sign_bol_shipper(self):
        _, bol = self._make_shipment_with_bol()
        result = self.svc.sign_bol_shipper(bol, 'Ship Manager')
        self.assertEqual(result.shipper_signature, 'Ship Manager')

    def test_sign_bol_carrier(self):
        _, bol = self._make_shipment_with_bol()
        result = self.svc.sign_bol_carrier(bol, 'Driver Bob')
        self.assertEqual(result.carrier_signature, 'Driver Bob')

    def test_sign_bol_consignee_changes_status(self):
        _, bol = self._make_shipment_with_bol()
        self.svc.issue_bol(bol)
        result = self.svc.sign_bol_consignee(bol, 'Receiver Joe')
        self.assertEqual(result.consignee_signature, 'Receiver Joe')
        self.assertEqual(result.status, 'signed')

    def test_void_bol(self):
        _, bol = self._make_shipment_with_bol()
        result = self.svc.void_bol(bol, reason='Wrong shipment')
        self.assertEqual(result.status, 'void')
        self.assertIn('VOIDED', result.notes)
