import base64
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Truck, Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.scheduling.models import DeliveryRun
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.logistics.models import DeliveryStop, LicensePlate
from apps.logistics.services import LogisticsService
from shared.managers import set_current_tenant

User = get_user_model()

# Tiny valid PNG for testing signature uploads
TINY_PNG = base64.b64encode(
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00'
    b'\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
).decode()


class InitializeRunLogisticsTests(TestCase):
    """Test LogisticsService.initialize_run_logistics()"""

    @classmethod
    def setUpTestData(cls):
        # Create tenant
        cls.tenant = Tenant.objects.create(
            name="Test Logistics Co",
            subdomain="testlogistics",
            is_default=True
        )
        set_current_tenant(cls.tenant)

        # Create user
        cls.user = User.objects.create_user(
            username="logistics_user",
            email="logistics@test.com",
            password="testpass123"
        )

        # Create truck
        cls.truck = Truck.objects.create(
            tenant=cls.tenant,
            name="Truck 1",
            license_plate="ABC123",
            is_active=True
        )

        # Create customers
        party1 = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            display_name="Customer One",
            code="CUST001"
        )
        cls.customer1 = Customer.objects.create(
            tenant=cls.tenant,
            party=party1
        )
        cls.ship_to1 = Location.objects.create(
            tenant=cls.tenant,
            party=party1,
            location_type='SHIP_TO',
            address_line1="123 Main St",
            city="City1",
            state="CA",
            postal_code="90001",
            country="US"
        )

        party2 = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            display_name="Customer Two",
            code="CUST002"
        )
        cls.customer2 = Customer.objects.create(
            tenant=cls.tenant,
            party=party2
        )
        cls.ship_to2 = Location.objects.create(
            tenant=cls.tenant,
            party=party2,
            location_type='SHIP_TO',
            address_line1="456 Oak Ave",
            city="City2",
            state="CA",
            postal_code="90002",
            country="US"
        )

        # Create UOM and Item
        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code="EA",
            name="Each",
            is_active=True
        )
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku="ITEM001",
            name="Test Item",
            base_uom=cls.uom,
            is_active=True
        )

        # Create delivery run
        cls.delivery_run = DeliveryRun.objects.create(
            tenant=cls.tenant,
            name="Run 1",
            truck=cls.truck,
            scheduled_date=timezone.now().date(),
            sequence=1,
            is_complete=False
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.service = LogisticsService(tenant=self.tenant, user=self.user)

    def test_creates_stops_grouped_by_customer(self):
        """3 orders for 2 customers should create 2 stops"""
        # Create 2 orders for customer1, 1 for customer2
        order1 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed',
            customer_po="PO001"
        )
        order2 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO002",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed',
            customer_po="PO002"
        )
        order3 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer2,
            order_number="SO003",
            order_date=timezone.now().date(),
            ship_to=self.ship_to2,
            delivery_run=self.delivery_run,
            status='confirmed',
            customer_po="PO003"
        )

        stops = self.service.initialize_run_logistics(self.delivery_run.id)

        self.assertEqual(len(stops), 2)
        self.assertEqual(DeliveryStop.objects.filter(tenant=self.tenant, run=self.delivery_run).count(), 2)

    def test_sets_correct_sequence(self):
        """Sequences should be 1, 2, ..."""
        order1 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed'
        )
        order2 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer2,
            order_number="SO002",
            order_date=timezone.now().date(),
            ship_to=self.ship_to2,
            delivery_run=self.delivery_run,
            status='confirmed'
        )

        stops = self.service.initialize_run_logistics(self.delivery_run.id)

        sequences = sorted([stop.sequence for stop in stops])
        self.assertEqual(sequences, [1, 2])

    def test_links_orders_to_stops(self):
        """M2M orders are correctly set on each stop"""
        order1 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed'
        )
        order2 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO002",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed'
        )
        order3 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer2,
            order_number="SO003",
            order_date=timezone.now().date(),
            ship_to=self.ship_to2,
            delivery_run=self.delivery_run,
            status='confirmed'
        )

        stops = self.service.initialize_run_logistics(self.delivery_run.id)

        # Find stop for customer1
        stop1 = next(s for s in stops if s.customer == self.customer1)
        self.assertEqual(stop1.orders.count(), 2)
        self.assertIn(order1, stop1.orders.all())
        self.assertIn(order2, stop1.orders.all())

        # Find stop for customer2
        stop2 = next(s for s in stops if s.customer == self.customer2)
        self.assertEqual(stop2.orders.count(), 1)
        self.assertIn(order3, stop2.orders.all())

    def test_reinitialize_deletes_old_stops(self):
        """Calling twice should replace stops"""
        order1 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed'
        )

        # First initialization
        stops1 = self.service.initialize_run_logistics(self.delivery_run.id)
        self.assertEqual(len(stops1), 1)
        first_stop_id = stops1[0].id

        # Second initialization
        stops2 = self.service.initialize_run_logistics(self.delivery_run.id)
        self.assertEqual(len(stops2), 1)
        second_stop_id = stops2[0].id

        # Old stop should be deleted
        self.assertFalse(DeliveryStop.objects.filter(id=first_stop_id).exists())
        # New stop should exist
        self.assertTrue(DeliveryStop.objects.filter(id=second_stop_id).exists())
        # Total stops should be 1
        self.assertEqual(DeliveryStop.objects.filter(tenant=self.tenant, run=self.delivery_run).count(), 1)

    def test_no_orders_raises_validation(self):
        """Run with no orders should raise ValidationError"""
        with self.assertRaises(ValidationError) as cm:
            self.service.initialize_run_logistics(self.delivery_run.id)
        self.assertIn("has no sales orders", str(cm.exception))

    def test_uses_ship_to_from_order(self):
        """ship_to on stop should match order's ship_to"""
        order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed'
        )

        stops = self.service.initialize_run_logistics(self.delivery_run.id)

        self.assertEqual(len(stops), 1)
        self.assertEqual(stops[0].ship_to, self.ship_to1)


class CreateLPNTests(TestCase):
    """Test LogisticsService.create_lpn()"""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name="Test Logistics Co",
            subdomain="testlogistics",
            is_default=True
        )
        set_current_tenant(cls.tenant)

        cls.user = User.objects.create_user(
            username="logistics_user",
            email="logistics@test.com",
            password="testpass123"
        )

        cls.truck = Truck.objects.create(
            tenant=cls.tenant,
            name="Truck 1",
            license_plate="ABC123",
            is_active=True
        )

        party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            display_name="Customer One",
            code="CUST001"
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=party
        )
        cls.ship_to = Location.objects.create(
            tenant=cls.tenant,
            party=party,
            location_type='SHIP_TO',
            address_line1="123 Main St",
            city="City1",
            state="CA",
            postal_code="90001",
            country="US"
        )

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code="EA",
            name="Each",
            is_active=True
        )
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku="ITEM001",
            name="Test Item",
            base_uom=cls.uom,
            is_active=True
        )

        cls.delivery_run = DeliveryRun.objects.create(
            tenant=cls.tenant,
            name="Run 1",
            truck=cls.truck,
            scheduled_date=timezone.now().date(),
            sequence=1,
            is_complete=False
        )

        cls.order = SalesOrder.objects.create(
            tenant=cls.tenant,
            customer=cls.customer,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=cls.ship_to,
            delivery_run=cls.delivery_run,
            status='confirmed'
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.service = LogisticsService(tenant=self.tenant, user=self.user)

    def test_creates_lpn_with_code(self):
        """Code should start with LPN-"""
        lpn = self.service.create_lpn(
            order=self.order,
            run=self.delivery_run,
            weight_lbs=Decimal('100.00')
        )

        self.assertTrue(lpn.code.startswith('LPN-'))
        self.assertEqual(lpn.order, self.order)
        self.assertEqual(lpn.run, self.delivery_run)

    def test_sequential_codes(self):
        """Creating 2 LPNs should give sequential codes"""
        lpn1 = self.service.create_lpn(
            order=self.order,
            weight_lbs=Decimal('100.00')
        )
        lpn2 = self.service.create_lpn(
            order=self.order,
            weight_lbs=Decimal('150.00')
        )

        # Extract numeric parts
        num1 = int(lpn1.code.split('-')[1])
        num2 = int(lpn2.code.split('-')[1])
        self.assertEqual(num2, num1 + 1)

    def test_lpn_has_correct_weight(self):
        """weight_lbs should match"""
        weight = Decimal('250.50')
        lpn = self.service.create_lpn(
            order=self.order,
            weight_lbs=weight
        )

        self.assertEqual(lpn.weight_lbs, weight)

    def test_lpn_default_status_staged(self):
        """Status should be STAGED"""
        lpn = self.service.create_lpn(
            order=self.order,
            weight_lbs=Decimal('100.00')
        )

        self.assertEqual(lpn.status, 'STAGED')


class SignDeliveryTests(TestCase):
    """Test LogisticsService.sign_delivery()"""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name="Test Logistics Co",
            subdomain="testlogistics",
            is_default=True
        )
        set_current_tenant(cls.tenant)

        cls.user = User.objects.create_user(
            username="logistics_user",
            email="logistics@test.com",
            password="testpass123"
        )

        cls.truck = Truck.objects.create(
            tenant=cls.tenant,
            name="Truck 1",
            license_plate="ABC123",
            is_active=True
        )

        party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            display_name="Customer One",
            code="CUST001"
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=party
        )
        cls.ship_to = Location.objects.create(
            tenant=cls.tenant,
            party=party,
            location_type='SHIP_TO',
            address_line1="123 Main St",
            city="City1",
            state="CA",
            postal_code="90001",
            country="US"
        )

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code="EA",
            name="Each",
            is_active=True
        )
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku="ITEM001",
            name="Test Item",
            base_uom=cls.uom,
            is_active=True
        )

        cls.delivery_run = DeliveryRun.objects.create(
            tenant=cls.tenant,
            name="Run 1",
            truck=cls.truck,
            scheduled_date=timezone.now().date(),
            sequence=1,
            is_complete=False
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.service = LogisticsService(tenant=self.tenant, user=self.user)

        # Create fresh order and stop for each test
        self.order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to,
            delivery_run=self.delivery_run,
            status='confirmed'
        )

        self.stop = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=self.delivery_run,
            customer=self.customer,
            ship_to=self.ship_to,
            sequence=1,
            status='PENDING'
        )
        self.stop.orders.add(self.order)

    def test_sign_marks_completed(self):
        """Status should become COMPLETED"""
        self.service.sign_delivery(
            stop_id=self.stop.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )

        self.stop.refresh_from_db()
        self.assertEqual(self.stop.status, 'COMPLETED')

    def test_sign_sets_signed_by(self):
        """signed_by should be recorded"""
        signer_name = "Jane Driver"
        self.service.sign_delivery(
            stop_id=self.stop.id,
            signature_base64=TINY_PNG,
            signed_by=signer_name
        )

        self.stop.refresh_from_db()
        self.assertEqual(self.stop.signed_by, signer_name)

    def test_sign_sets_delivered_at(self):
        """delivered_at should not be None"""
        self.service.sign_delivery(
            stop_id=self.stop.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )

        self.stop.refresh_from_db()
        self.assertIsNotNone(self.stop.delivered_at)

    def test_sign_saves_signature_image(self):
        """signature_image file should be saved"""
        self.service.sign_delivery(
            stop_id=self.stop.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )

        self.stop.refresh_from_db()
        self.assertTrue(bool(self.stop.signature_image))
        self.assertIn('sig_', self.stop.signature_image.name)

    def test_sign_saves_photo_image(self):
        """photo_image file should be saved when provided"""
        self.service.sign_delivery(
            stop_id=self.stop.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver",
            photo_base64=TINY_PNG  # Using PNG for simplicity
        )

        self.stop.refresh_from_db()
        self.assertTrue(bool(self.stop.photo_image))
        self.assertIn('pod_', self.stop.photo_image.name)

    def test_sign_records_gps(self):
        """gps_lat and gps_lng should be saved"""
        lat = Decimal('34.0522')
        lng = Decimal('-118.2437')

        self.service.sign_delivery(
            stop_id=self.stop.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver",
            gps_lat=lat,
            gps_lng=lng
        )

        self.stop.refresh_from_db()
        self.assertEqual(self.stop.gps_lat, lat)
        self.assertEqual(self.stop.gps_lng, lng)

    def test_sign_updates_orders_to_shipped(self):
        """Linked orders should become 'shipped'"""
        self.service.sign_delivery(
            stop_id=self.stop.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'shipped')

    def test_sign_already_completed_raises(self):
        """Signing a COMPLETED stop should raise ValidationError"""
        # Sign once
        self.service.sign_delivery(
            stop_id=self.stop.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )

        # Try to sign again
        with self.assertRaises(ValidationError) as cm:
            self.service.sign_delivery(
                stop_id=self.stop.id,
                signature_base64=TINY_PNG,
                signed_by="John Driver"
            )
        self.assertIn("already been signed", str(cm.exception))


class ArriveAtStopTests(TestCase):
    """Test LogisticsService.arrive_at_stop()"""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name="Test Logistics Co",
            subdomain="testlogistics",
            is_default=True
        )
        set_current_tenant(cls.tenant)

        cls.user = User.objects.create_user(
            username="logistics_user",
            email="logistics@test.com",
            password="testpass123"
        )

        cls.truck = Truck.objects.create(
            tenant=cls.tenant,
            name="Truck 1",
            license_plate="ABC123",
            is_active=True
        )

        party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            display_name="Customer One",
            code="CUST001"
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=party
        )
        cls.ship_to = Location.objects.create(
            tenant=cls.tenant,
            party=party,
            location_type='SHIP_TO',
            address_line1="123 Main St",
            city="City1",
            state="CA",
            postal_code="90001",
            country="US"
        )

        cls.delivery_run = DeliveryRun.objects.create(
            tenant=cls.tenant,
            name="Run 1",
            truck=cls.truck,
            scheduled_date=timezone.now().date(),
            sequence=1,
            is_complete=False
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.service = LogisticsService(tenant=self.tenant, user=self.user)

        # Create fresh stop for each test
        self.stop = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=self.delivery_run,
            customer=self.customer,
            ship_to=self.ship_to,
            sequence=1,
            status='PENDING'
        )

    def test_arrive_sets_status_arrived(self):
        """Status should become ARRIVED"""
        self.service.arrive_at_stop(stop_id=self.stop.id)

        self.stop.refresh_from_db()
        self.assertEqual(self.stop.status, 'ARRIVED')

    def test_arrive_sets_arrived_at(self):
        """arrived_at timestamp should be set"""
        self.service.arrive_at_stop(stop_id=self.stop.id)

        self.stop.refresh_from_db()
        self.assertIsNotNone(self.stop.arrived_at)

    def test_arrive_records_gps(self):
        """gps_lat/lng should be saved"""
        lat = Decimal('34.0522')
        lng = Decimal('-118.2437')

        self.service.arrive_at_stop(
            stop_id=self.stop.id,
            gps_lat=lat,
            gps_lng=lng
        )

        self.stop.refresh_from_db()
        self.assertEqual(self.stop.gps_lat, lat)
        self.assertEqual(self.stop.gps_lng, lng)

    def test_arrive_non_pending_raises(self):
        """Arriving at non-PENDING stop should raise ValidationError"""
        self.stop.status = 'ARRIVED'
        self.stop.save()

        with self.assertRaises(ValidationError) as cm:
            self.service.arrive_at_stop(stop_id=self.stop.id)
        self.assertIn("already ARRIVED", str(cm.exception))

    def test_arrive_without_gps(self):
        """Works fine with no GPS (null)"""
        self.service.arrive_at_stop(stop_id=self.stop.id)

        self.stop.refresh_from_db()
        self.assertEqual(self.stop.status, 'ARRIVED')
        self.assertIsNone(self.stop.gps_lat)
        self.assertIsNone(self.stop.gps_lng)


class GetMyRunTests(TestCase):
    """Test LogisticsService.get_my_run()"""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name="Test Logistics Co",
            subdomain="testlogistics",
            is_default=True
        )
        set_current_tenant(cls.tenant)

        cls.user = User.objects.create_user(
            username="logistics_user",
            email="logistics@test.com",
            password="testpass123"
        )

        cls.truck = Truck.objects.create(
            tenant=cls.tenant,
            name="Truck 1",
            license_plate="ABC123",
            is_active=True
        )

        party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            display_name="Customer One",
            code="CUST001"
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=party
        )
        cls.ship_to = Location.objects.create(
            tenant=cls.tenant,
            party=party,
            location_type='SHIP_TO',
            address_line1="123 Main St",
            city="City1",
            state="CA",
            postal_code="90001",
            country="US"
        )

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code="EA",
            name="Each",
            is_active=True
        )
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku="ITEM001",
            name="Test Item",
            base_uom=cls.uom,
            is_active=True
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.service = LogisticsService(tenant=self.tenant, user=self.user)

    def test_returns_todays_run(self):
        """Returns run with today's scheduled_date"""
        today = timezone.now().date()
        run = DeliveryRun.objects.create(
            tenant=self.tenant,
            name="Today's Run",
            truck=self.truck,
            scheduled_date=today,
            sequence=1,
            is_complete=False
        )

        order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number="SO001",
            order_date=today,
            ship_to=self.ship_to,
            delivery_run=run,
            status='confirmed'
        )

        stop = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=run,
            customer=self.customer,
            ship_to=self.ship_to,
            sequence=1,
            status='PENDING'
        )
        stop.orders.add(order)

        result = self.service.get_my_run(self.user)

        self.assertIsNotNone(result)
        self.assertEqual(result['run'].id, run.id)

    def test_returns_none_no_run(self):
        """Returns None when no run exists for today"""
        result = self.service.get_my_run(self.user)
        self.assertIsNone(result)

    def test_returns_none_completed_run(self):
        """Returns None for completed run (is_complete=True)"""
        today = timezone.now().date()
        run = DeliveryRun.objects.create(
            tenant=self.tenant,
            name="Completed Run",
            truck=self.truck,
            scheduled_date=today,
            sequence=1,
            is_complete=True
        )

        result = self.service.get_my_run(self.user)
        self.assertIsNone(result)

    def test_includes_stop_data(self):
        """Returned stops match what's in DB"""
        today = timezone.now().date()
        run = DeliveryRun.objects.create(
            tenant=self.tenant,
            name="Today's Run",
            truck=self.truck,
            scheduled_date=today,
            sequence=1,
            is_complete=False
        )

        order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number="SO001",
            order_date=today,
            ship_to=self.ship_to,
            delivery_run=run,
            status='confirmed'
        )

        stop = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=run,
            customer=self.customer,
            ship_to=self.ship_to,
            sequence=1,
            status='PENDING'
        )
        stop.orders.add(order)

        result = self.service.get_my_run(self.user)

        self.assertEqual(result['total_stops'], 1)
        self.assertEqual(len(result['stops']), 1)
        self.assertEqual(result['stops'][0].id, stop.id)


class RunCompletionTests(TestCase):
    """Test run completion logic in sign_delivery()"""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name="Test Logistics Co",
            subdomain="testlogistics",
            is_default=True
        )
        set_current_tenant(cls.tenant)

        cls.user = User.objects.create_user(
            username="logistics_user",
            email="logistics@test.com",
            password="testpass123"
        )

        cls.truck = Truck.objects.create(
            tenant=cls.tenant,
            name="Truck 1",
            license_plate="ABC123",
            is_active=True
        )

        # Create 2 customers
        party1 = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            display_name="Customer One",
            code="CUST001"
        )
        cls.customer1 = Customer.objects.create(
            tenant=cls.tenant,
            party=party1
        )
        cls.ship_to1 = Location.objects.create(
            tenant=cls.tenant,
            party=party1,
            location_type='SHIP_TO',
            address_line1="123 Main St",
            city="City1",
            state="CA",
            postal_code="90001",
            country="US"
        )

        party2 = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            display_name="Customer Two",
            code="CUST002"
        )
        cls.customer2 = Customer.objects.create(
            tenant=cls.tenant,
            party=party2
        )
        cls.ship_to2 = Location.objects.create(
            tenant=cls.tenant,
            party=party2,
            location_type='SHIP_TO',
            address_line1="456 Oak Ave",
            city="City2",
            state="CA",
            postal_code="90002",
            country="US"
        )

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code="EA",
            name="Each",
            is_active=True
        )
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku="ITEM001",
            name="Test Item",
            base_uom=cls.uom,
            is_active=True
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.service = LogisticsService(tenant=self.tenant, user=self.user)

        # Create fresh run for each test
        self.delivery_run = DeliveryRun.objects.create(
            tenant=self.tenant,
            name="Run 1",
            truck=self.truck,
            scheduled_date=timezone.now().date(),
            sequence=1,
            is_complete=False
        )

    def test_all_stops_signed_marks_run_complete(self):
        """run.is_complete becomes True when all stops completed"""
        # Create 2 stops
        order1 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed'
        )
        stop1 = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=self.delivery_run,
            customer=self.customer1,
            ship_to=self.ship_to1,
            sequence=1,
            status='PENDING'
        )
        stop1.orders.add(order1)

        order2 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer2,
            order_number="SO002",
            order_date=timezone.now().date(),
            ship_to=self.ship_to2,
            delivery_run=self.delivery_run,
            status='confirmed'
        )
        stop2 = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=self.delivery_run,
            customer=self.customer2,
            ship_to=self.ship_to2,
            sequence=2,
            status='PENDING'
        )
        stop2.orders.add(order2)

        # Sign first stop - run should not be complete
        self.service.sign_delivery(
            stop_id=stop1.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )
        self.delivery_run.refresh_from_db()
        self.assertFalse(self.delivery_run.is_complete)

        # Sign second stop - run should become complete
        self.service.sign_delivery(
            stop_id=stop2.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )
        self.delivery_run.refresh_from_db()
        self.assertTrue(self.delivery_run.is_complete)

    def test_partial_completion_not_complete(self):
        """run.is_complete stays False with pending stops"""
        # Create 2 stops
        order1 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed'
        )
        stop1 = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=self.delivery_run,
            customer=self.customer1,
            ship_to=self.ship_to1,
            sequence=1,
            status='PENDING'
        )
        stop1.orders.add(order1)

        order2 = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer2,
            order_number="SO002",
            order_date=timezone.now().date(),
            ship_to=self.ship_to2,
            delivery_run=self.delivery_run,
            status='confirmed'
        )
        stop2 = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=self.delivery_run,
            customer=self.customer2,
            ship_to=self.ship_to2,
            sequence=2,
            status='PENDING'
        )
        stop2.orders.add(order2)

        # Sign only first stop
        self.service.sign_delivery(
            stop_id=stop1.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )

        self.delivery_run.refresh_from_db()
        self.assertFalse(self.delivery_run.is_complete)

    def test_lpns_updated_to_delivered(self):
        """LPNs linked to signed stop get status DELIVERED"""
        order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer1,
            order_number="SO001",
            order_date=timezone.now().date(),
            ship_to=self.ship_to1,
            delivery_run=self.delivery_run,
            status='confirmed'
        )
        stop = DeliveryStop.objects.create(
            tenant=self.tenant,
            run=self.delivery_run,
            customer=self.customer1,
            ship_to=self.ship_to1,
            sequence=1,
            status='PENDING'
        )
        stop.orders.add(order)

        # Create LPN for this order
        lpn = LicensePlate.objects.create(
            tenant=self.tenant,
            code="LPN-10001",
            order=order,
            run=self.delivery_run,
            weight_lbs=Decimal('100.00'),
            status='STAGED'
        )

        # Sign the stop
        self.service.sign_delivery(
            stop_id=stop.id,
            signature_base64=TINY_PNG,
            signed_by="John Driver"
        )

        # LPN should be updated to DELIVERED
        lpn.refresh_from_db()
        self.assertEqual(lpn.status, 'DELIVERED')
