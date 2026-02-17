# apps/logistics/tests/test_api.py
"""
Comprehensive API endpoint tests for the Driver App backend.

Tests cover:
- Driver manifest API (GET/POST /api/v1/logistics/my-run/)
- Arrive at stop API (POST /api/v1/logistics/stops/{id}/arrive/)
- Sign delivery API (POST /api/v1/logistics/stops/{id}/sign/)
- Initialize run API (POST /api/v1/logistics/runs/{run_id}/initialize/)
- Delivery stop list/detail APIs
- Tenant isolation
- Authentication requirements
"""
import base64
from datetime import date
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location, Truck
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.scheduling.models import DeliveryRun
from apps.logistics.models import DeliveryStop, LicensePlate
from shared.managers import set_current_tenant


User = get_user_model()

# Base64-encoded tiny PNG for signature/photo testing
TINY_PNG = base64.b64encode(b'\x89PNG\r\n\x1a\n').decode()


class DriverAPITestCase(TestCase):
    """Base test case with common setup for driver API tests."""

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole TestCase."""
        # Create tenant
        cls.tenant = Tenant.objects.create(
            name='Test Driver Co',
            subdomain='test-driver',
            is_default=True,
        )

        # Create user (driver)
        cls.user = User.objects.create_user(
            username='driver1',
            email='driver@test.com',
            password='testpass123',
        )

        # Set current tenant for TenantManager
        set_current_tenant(cls.tenant)

        # Create truck
        cls.truck = Truck.objects.create(
            tenant=cls.tenant,
            name='Truck Alpha',
            license_plate='ABC-1234',
            is_active=True,
        )

        # Create customer party and customer
        cls.customer_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='CUST01',
            display_name='Test Customer Inc',
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
        )
        cls.ship_to = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            location_type='SHIP_TO',
            address_line1='123 Customer St',
            city='Chicago',
            state='IL',
            postal_code='60601',
            country='US',
        )

        # Create second customer for multi-stop tests
        cls.customer2_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='CUST02',
            display_name='Second Customer LLC',
        )
        cls.customer2 = Customer.objects.create(
            tenant=cls.tenant,
            party=cls.customer2_party,
        )
        cls.ship_to2 = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer2_party,
            location_type='SHIP_TO',
            address_line1='456 Second Ave',
            city='Chicago',
            state='IL',
            postal_code='60602',
            country='US',
        )

        # Create UOM and Item
        cls.uom_each = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='EA',
            name='Each',
            is_active=True,
        )
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-001',
            name='Test Product',
            base_uom=cls.uom_each,
            is_active=True,
        )
        cls.item2 = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-002',
            name='Another Product',
            base_uom=cls.uom_each,
            is_active=True,
        )

        # Create delivery run for today
        cls.delivery_run = DeliveryRun.objects.create(
            tenant=cls.tenant,
            name='Run Alpha',
            truck=cls.truck,
            scheduled_date=timezone.now().date(),
            sequence=1,
            is_complete=False,
        )

        # Create sales orders
        cls.order1 = SalesOrder.objects.create(
            tenant=cls.tenant,
            customer=cls.customer,
            order_number='SO-1001',
            order_date=timezone.now().date(),
            ship_to=cls.ship_to,
            delivery_run=cls.delivery_run,
            status='confirmed',
            customer_po='PO-ABC',
        )
        SalesOrderLine.objects.create(
            tenant=cls.tenant,
            sales_order=cls.order1,
            line_number=1,
            item=cls.item,
            quantity_ordered=100,
            uom=cls.uom_each,
            unit_price=Decimal('10.00'),
        )

        cls.order2 = SalesOrder.objects.create(
            tenant=cls.tenant,
            customer=cls.customer,
            order_number='SO-1002',
            order_date=timezone.now().date(),
            ship_to=cls.ship_to,
            delivery_run=cls.delivery_run,
            status='confirmed',
            customer_po='PO-DEF',
        )
        SalesOrderLine.objects.create(
            tenant=cls.tenant,
            sales_order=cls.order2,
            line_number=1,
            item=cls.item2,
            quantity_ordered=50,
            uom=cls.uom_each,
            unit_price=Decimal('15.00'),
        )

        cls.order3 = SalesOrder.objects.create(
            tenant=cls.tenant,
            customer=cls.customer2,
            order_number='SO-1003',
            order_date=timezone.now().date(),
            ship_to=cls.ship_to2,
            delivery_run=cls.delivery_run,
            status='confirmed',
            customer_po='PO-GHI',
        )
        SalesOrderLine.objects.create(
            tenant=cls.tenant,
            sales_order=cls.order3,
            line_number=1,
            item=cls.item,
            quantity_ordered=75,
            uom=cls.uom_each,
            unit_price=Decimal('10.00'),
        )

        # Create delivery stops
        cls.stop1 = DeliveryStop.objects.create(
            tenant=cls.tenant,
            run=cls.delivery_run,
            customer=cls.customer,
            ship_to=cls.ship_to,
            sequence=1,
            status='PENDING',
        )
        cls.stop1.orders.set([cls.order1, cls.order2])

        cls.stop2 = DeliveryStop.objects.create(
            tenant=cls.tenant,
            run=cls.delivery_run,
            customer=cls.customer2,
            ship_to=cls.ship_to2,
            sequence=2,
            status='PENDING',
        )
        cls.stop2.orders.set([cls.order3])

        # Create license plates (LPNs)
        cls.lpn1 = LicensePlate.objects.create(
            tenant=cls.tenant,
            code='LPN-10001',
            order=cls.order1,
            run=cls.delivery_run,
            weight_lbs=Decimal('500.00'),
            status='STAGED',
        )
        cls.lpn2 = LicensePlate.objects.create(
            tenant=cls.tenant,
            code='LPN-10002',
            order=cls.order2,
            run=cls.delivery_run,
            weight_lbs=Decimal('300.00'),
            status='STAGED',
        )
        cls.lpn3 = LicensePlate.objects.create(
            tenant=cls.tenant,
            code='LPN-10003',
            order=cls.order3,
            run=cls.delivery_run,
            weight_lbs=Decimal('400.00'),
            status='STAGED',
        )

    def setUp(self):
        """Set up for each test method."""
        set_current_tenant(self.tenant)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)


class DriverManifestAPITests(DriverAPITestCase):
    """Tests for GET/POST /api/v1/logistics/my-run/"""

    def test_get_my_run_returns_manifest(self):
        """GET /api/v1/logistics/my-run/ returns 200 with run_id, truck_name, stops, total_stops."""
        response = self.client.get('/api/v1/logistics/my-run/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertEqual(data['run_id'], self.delivery_run.id)
        self.assertEqual(data['truck_name'], 'Truck Alpha')
        self.assertEqual(data['total_stops'], 2)
        self.assertEqual(len(data['stops']), 2)
        self.assertIn('total_weight_lbs', data)

    def test_get_my_run_no_run_today(self):
        """Returns 404 when no run scheduled for today."""
        # Delete the run to simulate no runs today
        set_current_tenant(self.tenant)
        DeliveryRun.objects.all().delete()

        response = self.client.get('/api/v1/logistics/my-run/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('No run scheduled for today', str(response.data))

    def test_get_my_run_includes_orders_and_lines(self):
        """Stops contain nested orders with line items."""
        response = self.client.get('/api/v1/logistics/my-run/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        stops = response.data['stops']

        # First stop should have 2 orders
        stop1_data = stops[0]
        self.assertEqual(len(stop1_data['orders']), 2)

        # Check order structure
        order_data = stop1_data['orders'][0]
        self.assertIn('order_number', order_data)
        self.assertIn('customer_po', order_data)
        self.assertIn('lines', order_data)

        # Check line structure
        line_data = order_data['lines'][0]
        self.assertIn('item_sku', line_data)
        self.assertIn('item_name', line_data)
        self.assertIn('quantity', line_data)
        self.assertIn('uom_code', line_data)

    def test_get_my_run_includes_weight(self):
        """total_weight_lbs is correct sum of LPN weights."""
        response = self.client.get('/api/v1/logistics/my-run/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Total weight should be sum of all LPNs: 500 + 300 + 400 = 1200
        expected_weight = Decimal('1200.00')
        actual_weight = Decimal(response.data['total_weight_lbs'])
        self.assertEqual(actual_weight, expected_weight)

    def test_start_run(self):
        """POST /api/v1/logistics/my-run/ returns 200 with run_id."""
        response = self.client.post('/api/v1/logistics/my-run/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('run_id', response.data)
        self.assertEqual(response.data['run_id'], self.delivery_run.id)
        self.assertIn('Run started', str(response.data))

    def test_unauthenticated_returns_401(self):
        """No auth → 401."""
        self.client.force_authenticate(user=None)

        response = self.client.get('/api/v1/logistics/my-run/')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ArriveAtStopAPITests(DriverAPITestCase):
    """Tests for POST /api/v1/logistics/stops/{id}/arrive/"""

    def test_arrive_success(self):
        """POST /api/v1/logistics/stops/{id}/arrive/ with GPS returns 200, status becomes ARRIVED."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/arrive/'
        data = {
            'gps_lat': '41.8781',
            'gps_lng': '-87.6298',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call before ORM query
        set_current_tenant(self.tenant)
        self.stop1.refresh_from_db()
        self.assertEqual(self.stop1.status, 'ARRIVED')

    def test_arrive_sets_gps(self):
        """gps_lat and gps_lng are saved in DB."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/arrive/'
        data = {
            'gps_lat': '41.8781',
            'gps_lng': '-87.6298',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        self.stop1.refresh_from_db()
        self.assertEqual(str(self.stop1.gps_lat), '41.8781000')
        self.assertEqual(str(self.stop1.gps_lng), '-87.6298000')

    def test_arrive_without_gps(self):
        """POST with empty body still works (both fields optional)."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/arrive/'

        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        self.stop1.refresh_from_db()
        self.assertEqual(self.stop1.status, 'ARRIVED')
        self.assertIsNone(self.stop1.gps_lat)
        self.assertIsNone(self.stop1.gps_lng)

    def test_arrive_already_arrived(self):
        """POST on non-PENDING stop returns 400."""
        # Set stop to ARRIVED first
        set_current_tenant(self.tenant)
        self.stop1.status = 'ARRIVED'
        self.stop1.save()

        url = f'/api/v1/logistics/stops/{self.stop1.id}/arrive/'

        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already', str(response.data).lower())

    def test_arrive_sets_arrived_at_timestamp(self):
        """arrived_at is populated."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/arrive/'

        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        self.stop1.refresh_from_db()
        self.assertIsNotNone(self.stop1.arrived_at)


class SignDeliveryAPITests(DriverAPITestCase):
    """Tests for POST /api/v1/logistics/stops/{id}/sign/"""

    def test_sign_success(self):
        """POST /api/v1/logistics/stops/{id}/sign/ with signature_base64 + signed_by returns 200."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'John Doe',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_sign_marks_completed(self):
        """stop status becomes COMPLETED in DB."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'John Doe',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        self.stop1.refresh_from_db()
        self.assertEqual(self.stop1.status, 'COMPLETED')
        self.assertEqual(self.stop1.signed_by, 'John Doe')
        self.assertIsNotNone(self.stop1.delivered_at)

    def test_sign_with_photo_and_gps(self):
        """photo_base64 + gps coords are saved."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'Jane Smith',
            'photo_base64': TINY_PNG,
            'gps_lat': '41.8781',
            'gps_lng': '-87.6298',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        self.stop1.refresh_from_db()
        self.assertTrue(self.stop1.photo_image)
        self.assertEqual(str(self.stop1.gps_lat), '41.8781000')
        self.assertEqual(str(self.stop1.gps_lng), '-87.6298000')

    def test_sign_with_delivery_notes(self):
        """delivery_notes saved on stop."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'John Doe',
            'delivery_notes': 'Left at loading dock.',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        self.stop1.refresh_from_db()
        self.assertEqual(self.stop1.delivery_notes, 'Left at loading dock.')

    def test_sign_updates_orders(self):
        """linked orders status becomes 'shipped'."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'John Doe',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        self.order1.refresh_from_db()
        self.order2.refresh_from_db()
        self.assertEqual(self.order1.status, 'shipped')
        self.assertEqual(self.order2.status, 'shipped')

    def test_sign_updates_lpns(self):
        """linked LPNs status becomes 'DELIVERED'."""
        url = f'/api/v1/logistics/stops/{self.stop1.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'John Doe',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        self.lpn1.refresh_from_db()
        self.lpn2.refresh_from_db()
        self.assertEqual(self.lpn1.status, 'DELIVERED')
        self.assertEqual(self.lpn2.status, 'DELIVERED')

    def test_sign_already_completed(self):
        """POST on COMPLETED stop returns 400."""
        # Complete the stop first
        set_current_tenant(self.tenant)
        self.stop1.status = 'COMPLETED'
        self.stop1.save()

        url = f'/api/v1/logistics/stops/{self.stop1.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'John Doe',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already', str(response.data).lower())


class InitializeRunAPITests(DriverAPITestCase):
    """Tests for POST /api/v1/logistics/runs/{run_id}/initialize/"""

    def test_initialize_creates_stops(self):
        """POST /api/v1/logistics/runs/{id}/initialize/ returns 201, stops are created grouped by customer."""
        # Delete existing stops to test initialization
        set_current_tenant(self.tenant)
        DeliveryStop.objects.filter(run=self.delivery_run).delete()

        url = f'/api/v1/logistics/runs/{self.delivery_run.id}/initialize/'

        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        stops = DeliveryStop.objects.filter(run=self.delivery_run).order_by('sequence')
        self.assertEqual(stops.count(), 2)  # Two unique customers

    def test_initialize_no_orders(self):
        """Returns 400 when run has no orders."""
        # Create a new run with no orders
        set_current_tenant(self.tenant)
        empty_run = DeliveryRun.objects.create(
            tenant=self.tenant,
            name='Empty Run',
            truck=self.truck,
            scheduled_date=timezone.now().date(),
            sequence=99,
        )

        url = f'/api/v1/logistics/runs/{empty_run.id}/initialize/'

        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('no sales orders', str(response.data).lower())

    def test_reinitialize_replaces_stops(self):
        """Calling twice replaces old stops."""
        url = f'/api/v1/logistics/runs/{self.delivery_run.id}/initialize/'

        # First initialization
        response1 = self.client.post(url, {}, format='json')
        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        first_stop_ids = set(DeliveryStop.objects.filter(run=self.delivery_run).values_list('id', flat=True))

        # Second initialization
        response2 = self.client.post(url, {}, format='json')
        self.assertEqual(response2.status_code, status.HTTP_201_CREATED)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        second_stop_ids = set(DeliveryStop.objects.filter(run=self.delivery_run).values_list('id', flat=True))

        # Stop IDs should be different (old ones deleted, new ones created)
        self.assertNotEqual(first_stop_ids, second_stop_ids)

    def test_stop_links_orders(self):
        """Stops have correct M2M orders."""
        # Delete existing stops
        set_current_tenant(self.tenant)
        DeliveryStop.objects.filter(run=self.delivery_run).delete()

        url = f'/api/v1/logistics/runs/{self.delivery_run.id}/initialize/'
        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Re-set tenant after API call
        set_current_tenant(self.tenant)
        stops = DeliveryStop.objects.filter(run=self.delivery_run).order_by('sequence')

        # First stop (customer 1) should have orders 1 and 2
        stop1 = stops[0]
        self.assertEqual(stop1.customer, self.customer)
        order_numbers = set(stop1.orders.values_list('order_number', flat=True))
        self.assertIn('SO-1001', order_numbers)
        self.assertIn('SO-1002', order_numbers)

        # Second stop (customer 2) should have order 3
        stop2 = stops[1]
        self.assertEqual(stop2.customer, self.customer2)
        order_numbers2 = set(stop2.orders.values_list('order_number', flat=True))
        self.assertIn('SO-1003', order_numbers2)


class DeliveryStopListAPITests(DriverAPITestCase):
    """Tests for GET /api/v1/logistics/stops/"""

    def test_list_stops(self):
        """GET /api/v1/logistics/stops/ returns stops."""
        response = self.client.get('/api/v1/logistics/stops/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 2)

    def test_filter_by_run(self):
        """?run={id} filters correctly."""
        response = self.client.get(f'/api/v1/logistics/stops/?run={self.delivery_run.id}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 2)

    def test_detail_includes_orders(self):
        """GET /api/v1/logistics/stops/{id}/ includes orders list."""
        response = self.client.get(f'/api/v1/logistics/stops/{self.stop1.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('orders', response.data)
        self.assertIsInstance(response.data['orders'], list)
        self.assertGreater(len(response.data['orders']), 0)


class TenantIsolationTests(TestCase):
    """Tests for tenant isolation."""

    @classmethod
    def setUpTestData(cls):
        """Set up two tenants with separate data."""
        # Tenant 1
        cls.tenant1 = Tenant.objects.create(
            name='Tenant One',
            subdomain='tenant-one',
            is_default=True,
        )
        cls.user1 = User.objects.create_user(
            username='user1',
            email='user1@test.com',
            password='test123',
        )

        set_current_tenant(cls.tenant1)

        cls.truck1 = Truck.objects.create(
            tenant=cls.tenant1,
            name='Truck 1',
            is_active=True,
        )
        cls.customer_party1 = Party.objects.create(
            tenant=cls.tenant1,
            party_type='CUSTOMER',
            code='C1',
            display_name='Customer 1',
        )
        cls.customer1 = Customer.objects.create(
            tenant=cls.tenant1,
            party=cls.customer_party1,
        )
        cls.ship_to1 = Location.objects.create(
            tenant=cls.tenant1,
            party=cls.customer_party1,
            location_type='SHIP_TO',
            address_line1='100 Main',
            city='City1',
            state='IL',
            postal_code='60001',
            country='US',
        )
        cls.run1 = DeliveryRun.objects.create(
            tenant=cls.tenant1,
            name='Run 1',
            truck=cls.truck1,
            scheduled_date=timezone.now().date(),
            sequence=1,
        )
        cls.stop1 = DeliveryStop.objects.create(
            tenant=cls.tenant1,
            run=cls.run1,
            customer=cls.customer1,
            ship_to=cls.ship_to1,
            sequence=1,
            status='PENDING',
        )

        # Tenant 2
        cls.tenant2 = Tenant.objects.create(
            name='Tenant Two',
            subdomain='tenant-two',
        )
        cls.user2 = User.objects.create_user(
            username='user2',
            email='user2@test.com',
            password='test123',
        )

        set_current_tenant(cls.tenant2)

        cls.truck2 = Truck.objects.create(
            tenant=cls.tenant2,
            name='Truck 2',
            is_active=True,
        )
        cls.customer_party2 = Party.objects.create(
            tenant=cls.tenant2,
            party_type='CUSTOMER',
            code='C2',
            display_name='Customer 2',
        )
        cls.customer2 = Customer.objects.create(
            tenant=cls.tenant2,
            party=cls.customer_party2,
        )
        cls.ship_to2 = Location.objects.create(
            tenant=cls.tenant2,
            party=cls.customer_party2,
            location_type='SHIP_TO',
            address_line1='200 Main',
            city='City2',
            state='IL',
            postal_code='60002',
            country='US',
        )
        cls.run2 = DeliveryRun.objects.create(
            tenant=cls.tenant2,
            name='Run 2',
            truck=cls.truck2,
            scheduled_date=timezone.now().date(),
            sequence=1,
        )
        cls.stop2 = DeliveryStop.objects.create(
            tenant=cls.tenant2,
            run=cls.run2,
            customer=cls.customer2,
            ship_to=cls.ship_to2,
            sequence=1,
            status='PENDING',
        )

    def setUp(self):
        """Set up for each test."""
        self.client = APIClient()

    def test_other_tenant_cannot_see_stops(self):
        """Create 2nd tenant, their stops are invisible."""
        # Authenticate as tenant1 user
        set_current_tenant(self.tenant1)
        self.client.force_authenticate(user=self.user1)

        response = self.client.get('/api/v1/logistics/stops/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Should only see tenant1's stop
        stop_ids = [stop['id'] for stop in response.data['results']]
        self.assertIn(self.stop1.id, stop_ids)
        self.assertNotIn(self.stop2.id, stop_ids)

    def test_other_tenant_cannot_sign(self):
        """Signing another tenant's stop fails - service raises DoesNotExist."""
        # Authenticate as tenant1 user, try to sign tenant2's stop
        set_current_tenant(self.tenant1)
        self.client.force_authenticate(user=self.user1)

        url = f'/api/v1/logistics/stops/{self.stop2.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'Malicious User',
        }

        # The service filters by tenant, so stop2 (tenant2) won't be found.
        # DeliveryStop.DoesNotExist is raised; DRF returns 404 for detail views.
        from apps.logistics.models import DeliveryStop as DS
        with self.assertRaises(DS.DoesNotExist):
            self.client.post(url, data, format='json')


class AuthenticationTests(DriverAPITestCase):
    """Tests for authentication requirements."""

    def test_unauthenticated_list(self):
        """GET without auth → 401."""
        self.client.force_authenticate(user=None)

        response = self.client.get('/api/v1/logistics/stops/')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_sign(self):
        """POST without auth → 401."""
        self.client.force_authenticate(user=None)

        url = f'/api/v1/logistics/stops/{self.stop1.id}/sign/'
        data = {
            'signature_base64': TINY_PNG,
            'signed_by': 'Anonymous',
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
