# apps/api/tests/test_scheduling.py
"""
Comprehensive tests for the Scheduling/Calendar API endpoints.

Tests cover:
- Calendar range endpoint (list scheduled orders by truck/date)
- Unscheduled orders endpoint
- Schedule update endpoint (assigning orders to trucks/dates)
- History/activity feed endpoint
- Trucks endpoint
- Edge cases, validation, and error handling
"""
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location, Truck
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import SalesOrder, SalesOrderLine, PurchaseOrder, PurchaseOrderLine
from shared.managers import set_current_tenant, get_current_tenant


User = get_user_model()


class SchedulingAPITestCase(TestCase):
    """Base test case with common setup for scheduling tests."""

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole TestCase."""
        # Create tenant
        cls.tenant = Tenant.objects.create(
            name='Test Company',
            subdomain='test-company',
            is_default=True,
        )

        # Create user
        cls.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
        )

        # Set current tenant for TenantManager
        set_current_tenant(cls.tenant)

        # Create our warehouse location (for ship_to on POs)
        cls.our_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='OTHER',
            code='OURCO',
            display_name='Our Company',
        )
        cls.our_warehouse = Location.objects.create(
            tenant=cls.tenant,
            party=cls.our_party,
            location_type='WAREHOUSE',
            name='Main Warehouse',
            address_line1='123 Warehouse St',
            city='Chicago',
            state='IL',
            postal_code='60601',
        )

        # Create vendor party and vendor
        cls.vendor_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='VENDOR',
            code='ACME',
            display_name='Acme Supplies',
        )
        cls.vendor = Vendor.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party,
        )
        cls.vendor_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party,
            location_type='WAREHOUSE',
            name='Vendor Warehouse',
            address_line1='456 Vendor Ave',
            city='Miami',
            state='FL',
            postal_code='33101',
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
        cls.customer_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            location_type='SHIP_TO',
            name='Customer HQ',
            address_line1='789 Customer Blvd',
            city='New York',
            state='NY',
            postal_code='10001',
        )

        # Create trucks
        cls.truck1 = Truck.objects.create(
            tenant=cls.tenant,
            name='Truck 1',
            capacity_pallets=20,
            is_active=True,
        )
        cls.truck2 = Truck.objects.create(
            tenant=cls.tenant,
            name='Truck 2',
            capacity_pallets=30,
            is_active=True,
        )
        cls.inactive_truck = Truck.objects.create(
            tenant=cls.tenant,
            name='Inactive Truck',
            is_active=False,
        )

        # Create UOM and Item
        cls.uom_each = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='EACH',
            name='Each',
        )
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku='TEST-001',
            name='Test Product',
            base_uom=cls.uom_each,
        )

    def setUp(self):
        """Set up for each test method."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        # Ensure tenant is set for each test
        set_current_tenant(self.tenant)


class CalendarRangeEndpointTests(SchedulingAPITestCase):
    """Tests for GET /api/v1/calendar/range/"""

    def test_range_requires_date_parameters(self):
        """Test that start_date and end_date are required."""
        response = self.client.get('/api/v1/calendar/range/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('start_date', str(response.data))

    def test_range_requires_valid_date_format(self):
        """Test that dates must be in YYYY-MM-DD format."""
        response = self.client.get('/api/v1/calendar/range/', {
            'start_date': '01-15-2025',
            'end_date': '01-20-2025',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Invalid date format', str(response.data))

    def test_range_returns_trucks_with_days(self):
        """Test that range returns truck-grouped data with days."""
        today = date.today()
        end_date = today + timedelta(days=7)

        response = self.client.get('/api/v1/calendar/range/', {
            'start_date': today.isoformat(),
            'end_date': end_date.isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

        # Should have trucks + inbound row (None)
        truck_names = [t['truck_name'] for t in response.data]
        self.assertIn('Truck 1', truck_names)
        self.assertIn('Truck 2', truck_names)
        self.assertIn('Unassigned', truck_names)  # Inbound/None row

        # Inactive truck should NOT be included
        self.assertNotIn('Inactive Truck', truck_names)

    def test_range_returns_scheduled_orders(self):
        """Test that scheduled orders appear in the correct truck/day."""
        today = date.today()

        # Create a scheduled sales order
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-001',
            status='scheduled',
            scheduled_date=today,
            scheduled_truck=self.truck1,
            ship_to=self.customer_location,
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=so,
            line_number=10,
            item=self.item,
            quantity_ordered=100,
            uom=self.uom_each,
            unit_price=Decimal('9.99'),
        )

        response = self.client.get('/api/v1/calendar/range/', {
            'start_date': today.isoformat(),
            'end_date': (today + timedelta(days=1)).isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Find Truck 1 data
        truck1_data = next(t for t in response.data if t['truck_name'] == 'Truck 1')
        # Date comparison: API returns date object that gets serialized to string
        today_str = today.isoformat()
        today_data = next(
            (d for d in truck1_data['days'] if str(d['date']) == today_str),
            None
        )

        self.assertIsNotNone(today_data, f"Could not find today's data. Days: {[d['date'] for d in truck1_data['days']]}")
        self.assertEqual(len(today_data['orders']), 1)
        self.assertEqual(today_data['orders'][0]['number'], 'SO-001')
        self.assertEqual(today_data['orders'][0]['order_type'], 'SO')

    def test_range_includes_purchase_orders_on_inbound(self):
        """Test that POs appear on the inbound row (truck_id=None)."""
        today = date.today()

        # Create a scheduled purchase order (no truck = inbound)
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            vendor=self.vendor,
            po_number='PO-001',
            status='scheduled',
            scheduled_date=today,
            scheduled_truck=None,  # Inbound row
            ship_to=self.our_warehouse,
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant,
            purchase_order=po,
            line_number=10,
            item=self.item,
            quantity_ordered=50,
            uom=self.uom_each,
            unit_cost=Decimal('5.00'),
        )

        response = self.client.get('/api/v1/calendar/range/', {
            'start_date': today.isoformat(),
            'end_date': (today + timedelta(days=1)).isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Find Unassigned/inbound row
        inbound_data = next(t for t in response.data if t['truck_id'] is None)
        today_str = today.isoformat()
        today_data = next(
            (d for d in inbound_data['days'] if str(d['date']) == today_str),
            None
        )

        self.assertIsNotNone(today_data, f"Could not find today's data. Days: {[d['date'] for d in inbound_data['days']]}")
        self.assertEqual(len(today_data['orders']), 1)
        self.assertEqual(today_data['orders'][0]['number'], 'PO-001')
        self.assertEqual(today_data['orders'][0]['order_type'], 'PO')

    def test_range_orders_sorted_by_priority(self):
        """Test that orders within a day are sorted by priority."""
        today = date.today()

        # Create orders with different priorities
        for priority, number in [(5, 'SO-MED'), (1, 'SO-HIGH'), (10, 'SO-LOW')]:
            so = SalesOrder.objects.create(
                tenant=self.tenant,
                customer=self.customer,
                order_number=number,
                status='scheduled',
                scheduled_date=today,
                scheduled_truck=self.truck1,
                ship_to=self.customer_location,
                priority=priority,
            )

        response = self.client.get('/api/v1/calendar/range/', {
            'start_date': today.isoformat(),
            'end_date': (today + timedelta(days=1)).isoformat(),
        })

        truck1_data = next(t for t in response.data if t['truck_name'] == 'Truck 1')
        today_str = today.isoformat()
        today_data = next(
            (d for d in truck1_data['days'] if str(d['date']) == today_str),
            None
        )

        self.assertIsNotNone(today_data, f"Could not find today's data. Days: {[d['date'] for d in truck1_data['days']]}")
        # Should be sorted by priority (1, 5, 10)
        order_numbers = [o['number'] for o in today_data['orders']]
        self.assertEqual(order_numbers, ['SO-HIGH', 'SO-MED', 'SO-LOW'])


class UnscheduledOrdersEndpointTests(SchedulingAPITestCase):
    """Tests for GET /api/v1/calendar/unscheduled/"""

    def test_unscheduled_returns_orders_without_date(self):
        """Test that unscheduled endpoint returns orders with no scheduled_date."""
        # Create unscheduled order
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-UNSCHED',
            status='confirmed',
            scheduled_date=None,
            ship_to=self.customer_location,
        )

        response = self.client.get('/api/v1/calendar/unscheduled/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order_numbers = [o['number'] for o in response.data]
        self.assertIn('SO-UNSCHED', order_numbers)

    def test_unscheduled_excludes_completed_orders(self):
        """Test that completed orders are not returned."""
        # Create completed unscheduled order
        SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-COMPLETE',
            status='complete',
            scheduled_date=None,
            ship_to=self.customer_location,
        )

        response = self.client.get('/api/v1/calendar/unscheduled/')

        order_numbers = [o['number'] for o in response.data]
        self.assertNotIn('SO-COMPLETE', order_numbers)

    def test_unscheduled_excludes_cancelled_orders(self):
        """Test that cancelled orders are not returned."""
        SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-CANCELLED',
            status='cancelled',
            scheduled_date=None,
            ship_to=self.customer_location,
        )

        response = self.client.get('/api/v1/calendar/unscheduled/')

        order_numbers = [o['number'] for o in response.data]
        self.assertNotIn('SO-CANCELLED', order_numbers)

    def test_unscheduled_includes_both_po_and_so(self):
        """Test that both POs and SOs are returned."""
        SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-TEST',
            status='draft',
            scheduled_date=None,
            ship_to=self.customer_location,
        )
        PurchaseOrder.objects.create(
            tenant=self.tenant,
            vendor=self.vendor,
            po_number='PO-TEST',
            status='draft',
            scheduled_date=None,
            ship_to=self.our_warehouse,
        )

        response = self.client.get('/api/v1/calendar/unscheduled/')

        order_types = [o['order_type'] for o in response.data]
        self.assertIn('SO', order_types)
        self.assertIn('PO', order_types)

    def test_unscheduled_sorted_by_priority(self):
        """Test that unscheduled orders are sorted by priority."""
        for priority, number in [(5, 'SO-MED'), (1, 'SO-HIGH'), (10, 'SO-LOW')]:
            SalesOrder.objects.create(
                tenant=self.tenant,
                customer=self.customer,
                order_number=number,
                status='draft',
                scheduled_date=None,
                ship_to=self.customer_location,
                priority=priority,
            )

        response = self.client.get('/api/v1/calendar/unscheduled/')

        # Filter to our test orders only (in case other tests created orders)
        test_orders = [o for o in response.data if o['number'] in ['SO-HIGH', 'SO-MED', 'SO-LOW']]
        order_numbers = [o['number'] for o in test_orders]
        self.assertEqual(order_numbers, ['SO-HIGH', 'SO-MED', 'SO-LOW'])


class ScheduleUpdateEndpointTests(SchedulingAPITestCase):
    """Tests for POST /api/v1/calendar/update/{order_type}/{order_id}/"""

    def test_schedule_sales_order_to_truck(self):
        """Test scheduling a sales order to a truck and date."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-SCHEDULE',
            status='confirmed',
            scheduled_date=None,
            ship_to=self.customer_location,
        )

        today = date.today()
        response = self.client.post(
            f'/api/v1/calendar/update/SO/{so.id}/',
            {
                'scheduled_date': today.isoformat(),
                'scheduled_truck_id': self.truck1.id,
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify the order was updated
        so.refresh_from_db()
        self.assertEqual(so.scheduled_date, today)
        self.assertEqual(so.scheduled_truck, self.truck1)

    def test_schedule_purchase_order_without_truck(self):
        """Test scheduling a PO (inbound, no truck)."""
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            vendor=self.vendor,
            po_number='PO-SCHEDULE',
            status='confirmed',
            scheduled_date=None,
            ship_to=self.our_warehouse,
        )

        today = date.today()
        response = self.client.post(
            f'/api/v1/calendar/update/PO/{po.id}/',
            {
                'scheduled_date': today.isoformat(),
                'scheduled_truck_id': None,  # Inbound row
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        po.refresh_from_db()
        self.assertEqual(po.scheduled_date, today)
        self.assertIsNone(po.scheduled_truck)

    def test_unschedule_order(self):
        """Test unscheduling an order (setting date to null)."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-UNSCHED',
            status='scheduled',
            scheduled_date=date.today(),
            scheduled_truck=self.truck1,
            ship_to=self.customer_location,
        )

        response = self.client.post(
            f'/api/v1/calendar/update/SO/{so.id}/',
            {
                'scheduled_date': None,
                'scheduled_truck_id': None,
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        so.refresh_from_db()
        self.assertIsNone(so.scheduled_date)
        self.assertIsNone(so.scheduled_truck)

    def test_update_invalid_order_type(self):
        """Test that invalid order type returns 400."""
        response = self.client.post(
            '/api/v1/calendar/update/INVALID/1/',
            {'scheduled_date': date.today().isoformat()},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Invalid order_type', str(response.data))

    def test_update_nonexistent_order(self):
        """Test that updating nonexistent order returns 404."""
        response = self.client.post(
            '/api/v1/calendar/update/SO/99999/',
            {'scheduled_date': date.today().isoformat()},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_with_nonexistent_truck(self):
        """Test that updating with invalid truck ID returns 404."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-BADTRUCK',
            status='confirmed',
            ship_to=self.customer_location,
        )

        response = self.client.post(
            f'/api/v1/calendar/update/SO/{so.id}/',
            {
                'scheduled_date': date.today().isoformat(),
                'scheduled_truck_id': 99999,
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('Truck', str(response.data))

    def test_reschedule_to_different_truck(self):
        """Test moving an order from one truck to another."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-MOVE',
            status='scheduled',
            scheduled_date=date.today(),
            scheduled_truck=self.truck1,
            ship_to=self.customer_location,
        )

        response = self.client.post(
            f'/api/v1/calendar/update/SO/{so.id}/',
            {'scheduled_truck_id': self.truck2.id},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        so.refresh_from_db()
        self.assertEqual(so.scheduled_truck, self.truck2)

    def test_reschedule_to_different_date(self):
        """Test moving an order to a different date."""
        today = date.today()
        tomorrow = today + timedelta(days=1)

        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-REDATE',
            status='scheduled',
            scheduled_date=today,
            scheduled_truck=self.truck1,
            ship_to=self.customer_location,
        )

        response = self.client.post(
            f'/api/v1/calendar/update/SO/{so.id}/',
            {'scheduled_date': tomorrow.isoformat()},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        so.refresh_from_db()
        self.assertEqual(so.scheduled_date, tomorrow)


class HistoryEndpointTests(SchedulingAPITestCase):
    """Tests for GET /api/v1/calendar/history/"""

    def test_history_returns_recent_changes(self):
        """Test that history endpoint returns recent order changes."""
        # Create an order (generates history record)
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-HISTORY',
            status='draft',
            ship_to=self.customer_location,
        )

        response = self.client.get('/api/v1/calendar/history/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

        # Find our order in history
        history_numbers = [h['number'] for h in response.data]
        self.assertIn('SO-HISTORY', history_numbers)

    def test_history_includes_change_type(self):
        """Test that history includes change type (created, changed, deleted)."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-CHANGETYPE',
            status='draft',
            ship_to=self.customer_location,
        )

        response = self.client.get('/api/v1/calendar/history/')

        our_record = next(h for h in response.data if h['number'] == 'SO-CHANGETYPE')
        self.assertEqual(our_record['history_type'], '+')  # Created
        self.assertEqual(our_record['history_type_display'], 'Created')

    def test_history_tracks_schedule_changes(self):
        """Test that scheduling changes are tracked in history."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-TRACKCHANGE',
            status='draft',
            ship_to=self.customer_location,
        )

        # Schedule the order (creates change record)
        so.scheduled_date = date.today()
        so.scheduled_truck = self.truck1
        so.save()

        response = self.client.get('/api/v1/calendar/history/')

        # Should have both creation and update records
        our_records = [h for h in response.data if h['number'] == 'SO-TRACKCHANGE']
        self.assertGreaterEqual(len(our_records), 2)

        # Find the change record
        change_record = next((h for h in our_records if h['history_type'] == '~'), None)
        if change_record:
            self.assertIn('scheduled_date', change_record['changed_fields'])

    def test_history_respects_limit_parameter(self):
        """Test that limit parameter restricts results."""
        # Create multiple orders to generate history
        for i in range(10):
            SalesOrder.objects.create(
                tenant=self.tenant,
                customer=self.customer,
                order_number=f'SO-LIMIT{i}',
                status='draft',
                ship_to=self.customer_location,
            )

        response = self.client.get('/api/v1/calendar/history/', {'limit': 5})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(response.data), 5)

    def test_history_ordered_by_date_descending(self):
        """Test that history is ordered most recent first."""
        # Create orders with slight delay to ensure different timestamps
        for i in range(3):
            SalesOrder.objects.create(
                tenant=self.tenant,
                customer=self.customer,
                order_number=f'SO-ORDER{i}',
                status='draft',
                ship_to=self.customer_location,
            )

        response = self.client.get('/api/v1/calendar/history/')

        # Verify ordering
        dates = [h['history_date'] for h in response.data]
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_history_includes_both_po_and_so(self):
        """Test that history includes both POs and SOs."""
        SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-BOTH',
            status='draft',
            ship_to=self.customer_location,
        )
        PurchaseOrder.objects.create(
            tenant=self.tenant,
            vendor=self.vendor,
            po_number='PO-BOTH',
            status='draft',
            ship_to=self.our_warehouse,
        )

        response = self.client.get('/api/v1/calendar/history/')

        order_types = set(h['order_type'] for h in response.data)
        self.assertIn('SO', order_types)
        self.assertIn('PO', order_types)


class TrucksEndpointTests(SchedulingAPITestCase):
    """Tests for GET /api/v1/calendar/trucks/"""

    def test_trucks_returns_active_trucks(self):
        """Test that only active trucks are returned."""
        response = self.client.get('/api/v1/calendar/trucks/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        truck_names = [t['name'] for t in response.data]
        self.assertIn('Truck 1', truck_names)
        self.assertIn('Truck 2', truck_names)
        self.assertNotIn('Inactive Truck', truck_names)

    def test_trucks_ordered_by_name(self):
        """Test that trucks are ordered alphabetically by name."""
        response = self.client.get('/api/v1/calendar/trucks/')

        truck_names = [t['name'] for t in response.data]
        self.assertEqual(truck_names, sorted(truck_names))


class AuthenticationTests(SchedulingAPITestCase):
    """Tests for authentication requirements."""

    def test_unauthenticated_request_rejected(self):
        """Test that unauthenticated requests return 401."""
        self.client.logout()

        response = self.client.get('/api/v1/calendar/unscheduled/')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_request_succeeds(self):
        """Test that authenticated requests succeed."""
        # Client is authenticated in setUp
        response = self.client.get('/api/v1/calendar/unscheduled/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class TenantIsolationTests(SchedulingAPITestCase):
    """Tests for tenant data isolation."""

    def test_cannot_see_other_tenant_orders(self):
        """Test that users cannot see orders from other tenants."""
        # Create another tenant with its own order
        other_tenant = Tenant.objects.create(
            name='Other Company',
            subdomain='other-company',
        )
        other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='testpass123',
        )

        # Create order for other tenant (bypass TenantManager)
        other_party = Party.objects.all_tenants().create(
            tenant=other_tenant,
            party_type='CUSTOMER',
            code='OTHER',
            display_name='Other Customer',
        )
        other_customer = Customer.objects.all_tenants().create(
            tenant=other_tenant,
            party=other_party,
        )
        other_location = Location.objects.all_tenants().create(
            tenant=other_tenant,
            party=other_party,
            location_type='SHIP_TO',
            name='Other Location',
            address_line1='123 Other St',
            city='Elsewhere',
            state='TX',
            postal_code='75001',
        )

        # Create order for other tenant
        set_current_tenant(other_tenant)
        other_so = SalesOrder.objects.create(
            tenant=other_tenant,
            customer=other_customer,
            order_number='SO-OTHER',
            status='draft',
            scheduled_date=None,
            ship_to=other_location,
        )

        # Switch back to original tenant and verify isolation
        set_current_tenant(self.tenant)

        response = self.client.get('/api/v1/calendar/unscheduled/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order_numbers = [o['number'] for o in response.data]
        self.assertNotIn('SO-OTHER', order_numbers)


class EdgeCaseTests(SchedulingAPITestCase):
    """Tests for edge cases and boundary conditions."""

    def test_empty_date_range_returns_empty_days(self):
        """Test that an empty date range returns structure with no orders."""
        # Use a past date range with no orders
        past_date = date(2020, 1, 1)

        response = self.client.get('/api/v1/calendar/range/', {
            'start_date': past_date.isoformat(),
            'end_date': (past_date + timedelta(days=1)).isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Should still have truck structure
        self.assertGreater(len(response.data), 0)

        # All days should have empty orders
        for truck in response.data:
            for day in truck['days']:
                self.assertEqual(day['orders'], [])

    def test_order_with_no_lines_has_zero_quantity(self):
        """Test that orders with no lines report zero quantity."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-NOLINES',
            status='draft',
            scheduled_date=None,
            ship_to=self.customer_location,
        )

        response = self.client.get('/api/v1/calendar/unscheduled/')

        our_order = next(o for o in response.data if o['number'] == 'SO-NOLINES')
        self.assertEqual(our_order['num_lines'], 0)
        self.assertEqual(our_order['total_quantity'], 0)

    def test_order_notes_included_in_response(self):
        """Test that order notes are included in API response."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-NOTES',
            status='draft',
            scheduled_date=None,
            ship_to=self.customer_location,
            notes='Special delivery instructions here',
        )

        response = self.client.get('/api/v1/calendar/unscheduled/')

        our_order = next(o for o in response.data if o['number'] == 'SO-NOTES')
        self.assertEqual(our_order['notes'], 'Special delivery instructions here')

    def test_update_partial_fields(self):
        """Test that partial updates work (only date, only truck)."""
        today = date.today()
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-PARTIAL',
            status='draft',
            scheduled_date=None,
            scheduled_truck=None,
            ship_to=self.customer_location,
        )

        # Update only date
        response = self.client.post(
            f'/api/v1/calendar/update/SO/{so.id}/',
            {'scheduled_date': today.isoformat()},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        so.refresh_from_db()
        self.assertEqual(so.scheduled_date, today)
        self.assertIsNone(so.scheduled_truck)  # Truck unchanged

    def test_history_default_limit(self):
        """Test that history has a reasonable default limit."""
        response = self.client.get('/api/v1/calendar/history/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Default limit is 50
        self.assertLessEqual(len(response.data), 50)
