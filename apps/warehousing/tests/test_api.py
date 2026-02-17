# apps/warehousing/tests/test_api.py
"""
Comprehensive API endpoint tests for the WMS (Warehouse Management System) module.

Test coverage:
- Scanner location lookup (barcode-based)
- Scanner item lookup (SKU-based)
- Stock move operations
- Cycle count CRUD
- Cycle count workflow (start, record, finalize)
- Tenant isolation
- Authentication enforcement
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.items.models import UnitOfMeasure, Item
from apps.warehousing.models import (
    Warehouse, WarehouseLocation, Lot, StockQuant,
    StockMoveLog, CycleCount, CycleCountLine,
)
from apps.warehousing.services import CycleCountService
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# BASE TEST CLASS
# =============================================================================

class WMSAPITestCase(TestCase):
    """Base test case with shared setup for all WMS API tests."""

    @classmethod
    def setUpTestData(cls):
        """Create shared test data (runs once per test class)."""
        # Create tenant
        cls.tenant = Tenant.objects.create(
            name='Test WMS Company',
            subdomain='test-wms',
            is_default=True,
        )

        # Create user
        cls.user = User.objects.create_user(
            username='wmsuser',
            email='wmsuser@test.com',
            password='testpass123',
        )

        # Set current tenant for TenantManager
        set_current_tenant(cls.tenant)

        # Create UnitOfMeasure
        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='ea',
            name='Each',
            is_active=True,
        )

        # Create Items
        cls.item1 = Item.objects.create(
            tenant=cls.tenant,
            sku='TEST-001',
            name='Test Item One',
            base_uom=cls.uom,
            is_active=True,
        )
        cls.item2 = Item.objects.create(
            tenant=cls.tenant,
            sku='TEST-002',
            name='Test Item Two',
            base_uom=cls.uom,
            is_active=True,
        )

        # Create Warehouse
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant,
            name='Main Warehouse',
            code='MAIN',
            is_active=True,
        )

        # Create WarehouseLocations
        cls.loc_a = WarehouseLocation.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            name='A-01-01',
            barcode='LOC-A01',
            type='STORAGE',
            is_active=True,
        )
        cls.loc_b = WarehouseLocation.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            name='B-02-01',
            barcode='LOC-B02',
            type='STORAGE',
            is_active=True,
        )

        # Create StockQuant: 100 units of item1 at loc_a
        cls.quant = StockQuant.objects.create(
            tenant=cls.tenant,
            item=cls.item1,
            location=cls.loc_a,
            quantity=Decimal('100.0000'),
        )

    def setUp(self):
        """Set up for each test."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)


# =============================================================================
# SCANNER LOCATION LOOKUP TESTS
# =============================================================================

class ScannerLocationLookupTests(WMSAPITestCase):
    """Tests for GET /api/v1/warehouse/scanner/location/?barcode=XXX"""

    def test_lookup_location_by_barcode(self):
        """Valid barcode returns 200 with location details."""
        url = '/api/v1/warehouse/scanner/location/'
        response = self.client.get(url, {'barcode': 'LOC-A01'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.loc_a.id)
        self.assertEqual(response.data['name'], 'A-01-01')
        self.assertEqual(response.data['barcode'], 'LOC-A01')
        self.assertEqual(response.data['warehouse_code'], 'MAIN')
        self.assertEqual(response.data['type'], 'STORAGE')

    def test_lookup_location_not_found(self):
        """Invalid barcode returns 404."""
        url = '/api/v1/warehouse/scanner/location/'
        response = self.client.get(url, {'barcode': 'NONEXISTENT'})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_lookup_location_missing_param(self):
        """Missing barcode parameter returns 400."""
        url = '/api/v1/warehouse/scanner/location/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('barcode', response.data['detail'].lower())

    def test_lookup_inactive_location(self):
        """Inactive location returns 404 (view filters is_active=True)."""
        inactive_loc = WarehouseLocation.objects.create(
            tenant=self.tenant,
            warehouse=self.warehouse,
            name='INACTIVE-01',
            barcode='LOC-INACTIVE',
            type='STORAGE',
            is_active=False,
        )

        url = '/api/v1/warehouse/scanner/location/'
        response = self.client.get(url, {'barcode': 'LOC-INACTIVE'})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# =============================================================================
# SCANNER ITEM LOOKUP TESTS
# =============================================================================

class ScannerItemLookupTests(WMSAPITestCase):
    """Tests for GET /api/v1/warehouse/scanner/item/?sku=XXX"""

    def test_lookup_item_by_sku(self):
        """Valid SKU returns 200 with item details and lots array."""
        url = '/api/v1/warehouse/scanner/item/'
        response = self.client.get(url, {'sku': 'TEST-001'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.item1.id)
        self.assertEqual(response.data['sku'], 'TEST-001')
        self.assertEqual(response.data['name'], 'Test Item One')
        self.assertIn('lots', response.data)
        self.assertIsInstance(response.data['lots'], list)

    def test_lookup_item_with_lots(self):
        """Item with lots returns lot data in response."""
        lot1 = Lot.objects.create(
            tenant=self.tenant,
            item=self.item1,
            lot_number='LOT-001',
            vendor_batch='VB-001',
        )
        lot2 = Lot.objects.create(
            tenant=self.tenant,
            item=self.item1,
            lot_number='LOT-002',
            vendor_batch='VB-002',
        )

        url = '/api/v1/warehouse/scanner/item/'
        response = self.client.get(url, {'sku': 'TEST-001'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['lots']), 2)

        lot_numbers = [lot['lot_number'] for lot in response.data['lots']]
        self.assertIn('LOT-001', lot_numbers)
        self.assertIn('LOT-002', lot_numbers)

    def test_lookup_item_not_found(self):
        """Invalid SKU returns 404."""
        url = '/api/v1/warehouse/scanner/item/'
        response = self.client.get(url, {'sku': 'NONEXISTENT'})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_lookup_item_missing_param(self):
        """Missing sku parameter returns 400."""
        url = '/api/v1/warehouse/scanner/item/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('sku', response.data['detail'].lower())


# =============================================================================
# STOCK MOVE API TESTS
# =============================================================================

class StockMoveAPITests(WMSAPITestCase):
    """Tests for POST /api/v1/warehouse/move/"""

    def test_move_stock_success(self):
        """Valid stock move returns 201 with move log data."""
        url = '/api/v1/warehouse/move/'
        data = {
            'item': self.item1.id,
            'quantity': '25.0000',
            'source_location': self.loc_a.id,
            'destination_location': self.loc_b.id,
            'reference': 'Manual move test',
        }
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['item'], self.item1.id)
        self.assertEqual(Decimal(response.data['quantity']), Decimal('25.0000'))
        self.assertEqual(response.data['source_location'], self.loc_a.id)
        self.assertEqual(response.data['destination_location'], self.loc_b.id)
        self.assertEqual(response.data['reference'], 'Manual move test')

        # Verify stock quantities changed
        set_current_tenant(self.tenant)
        self.loc_a.refresh_from_db()
        source_quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item1, location=self.loc_a,
        )
        self.assertEqual(source_quant.quantity, Decimal('75.0000'))

        dest_quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item1, location=self.loc_b,
        )
        self.assertEqual(dest_quant.quantity, Decimal('25.0000'))

    def test_move_stock_insufficient(self):
        """Moving more than available returns 400."""
        url = '/api/v1/warehouse/move/'
        data = {
            'item': self.item1.id,
            'quantity': '999.0000',
            'source_location': self.loc_a.id,
            'destination_location': self.loc_b.id,
        }
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Insufficient', response.data['detail'])

    def test_move_stock_invalid_item(self):
        """Non-existent item ID returns 404."""
        url = '/api/v1/warehouse/move/'
        data = {
            'item': 99999,
            'quantity': '10.0000',
            'source_location': self.loc_a.id,
            'destination_location': self.loc_b.id,
        }
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_move_stock_same_location(self):
        """Move with source == destination is allowed by the API."""
        url = '/api/v1/warehouse/move/'
        data = {
            'item': self.item1.id,
            'quantity': '10.0000',
            'source_location': self.loc_a.id,
            'destination_location': self.loc_a.id,
        }
        response = self.client.post(url, data, format='json')

        # The API does not block same-location moves; only the Scanner UI does.
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify net stock is unchanged (debit + credit to same location)
        set_current_tenant(self.tenant)
        quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item1, location=self.loc_a,
        )
        self.assertEqual(quant.quantity, Decimal('100.0000'))


# =============================================================================
# CYCLE COUNT CRUD TESTS
# =============================================================================

class CycleCountCRUDTests(WMSAPITestCase):
    """Tests for /api/v1/warehouse/cycle-counts/ CRUD operations."""

    def test_list_cycle_counts(self):
        """GET list returns 200."""
        url = '/api/v1/warehouse/cycle-counts/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_cycle_count(self):
        """POST creates a cycle count in draft status with auto-generated count_number."""
        url = '/api/v1/warehouse/cycle-counts/'
        data = {
            'warehouse': self.warehouse.id,
        }
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('count_number', response.data)
        self.assertTrue(response.data['count_number'].startswith('CC-'))
        self.assertEqual(response.data['status'], 'draft')

    def test_retrieve_cycle_count(self):
        """GET detail returns 200 with lines array."""
        svc = CycleCountService(self.tenant, self.user)
        count = svc.create_count(warehouse=self.warehouse)

        url = f'/api/v1/warehouse/cycle-counts/{count.id}/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('lines', response.data)
        self.assertIsInstance(response.data['lines'], list)
        self.assertEqual(response.data['count_number'], count.count_number)

    def test_cycle_count_no_put(self):
        """PUT returns 405 (method not allowed)."""
        svc = CycleCountService(self.tenant, self.user)
        count = svc.create_count(warehouse=self.warehouse)

        url = f'/api/v1/warehouse/cycle-counts/{count.id}/'
        response = self.client.put(url, {'warehouse': self.warehouse.id}, format='json')

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_cycle_count_no_delete(self):
        """DELETE returns 405 (method not allowed)."""
        svc = CycleCountService(self.tenant, self.user)
        count = svc.create_count(warehouse=self.warehouse)

        url = f'/api/v1/warehouse/cycle-counts/{count.id}/'
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


# =============================================================================
# CYCLE COUNT WORKFLOW TESTS
# =============================================================================

class CycleCountWorkflowTests(WMSAPITestCase):
    """Tests for cycle count workflow: start, record, finalize."""

    @classmethod
    def setUpTestData(cls):
        """Extend parent setup with additional stock for cycle count testing."""
        super().setUpTestData()

        # Create additional stock quant for item2 at loc_b so start_count
        # has multiple lines to snapshot.
        cls.quant_b = StockQuant.objects.create(
            tenant=cls.tenant,
            item=cls.item2,
            location=cls.loc_b,
            quantity=Decimal('50.0000'),
        )

    def _create_and_start_count(self):
        """Helper: create a cycle count and start it. Returns the count."""
        svc = CycleCountService(self.tenant, self.user)
        count = svc.create_count(warehouse=self.warehouse)
        svc.start_count(count)
        count.refresh_from_db()
        return count

    def test_start_count(self):
        """POST start transitions draft count to in_progress with lines populated."""
        svc = CycleCountService(self.tenant, self.user)
        count = svc.create_count(warehouse=self.warehouse)

        url = f'/api/v1/warehouse/cycle-counts/{count.id}/start/'
        response = self.client.post(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'in_progress')
        self.assertIn('lines', response.data)
        self.assertGreater(len(response.data['lines']), 0)

    def test_start_already_started(self):
        """POST start on an in_progress count returns 400."""
        count = self._create_and_start_count()

        url = f'/api/v1/warehouse/cycle-counts/{count.id}/start/'
        response = self.client.post(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_record_line(self):
        """POST record with valid line_id and counted_quantity returns 200."""
        count = self._create_and_start_count()
        line = count.lines.first()

        url = f'/api/v1/warehouse/cycle-counts/{count.id}/record/'
        data = {
            'line_id': line.id,
            'counted_quantity': '95.0000',
        }
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_counted'])
        self.assertEqual(Decimal(response.data['counted_quantity']), Decimal('95.0000'))

    def test_record_wrong_count(self):
        """Recording a line from count1 via count2's URL returns 400."""
        count1 = self._create_and_start_count()
        line_from_count1 = count1.lines.first()

        # Create and start a second count
        svc = CycleCountService(self.tenant, self.user)
        count2 = svc.create_count(warehouse=self.warehouse)
        svc.start_count(count2)
        count2.refresh_from_db()

        url = f'/api/v1/warehouse/cycle-counts/{count2.id}/record/'
        data = {
            'line_id': line_from_count1.id,
            'counted_quantity': '10.0000',
        }
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_finalize_count(self):
        """Finalize a fully-counted count transitions to completed."""
        count = self._create_and_start_count()

        # Record all lines
        svc = CycleCountService(self.tenant, self.user)
        for line in count.lines.all():
            svc.record_count(
                line_id=line.id,
                counted_quantity=line.expected_quantity,
                cycle_count_id=count.id,
            )

        url = f'/api/v1/warehouse/cycle-counts/{count.id}/finalize/'
        response = self.client.post(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'completed')

    def test_finalize_uncounted(self):
        """Finalize with uncounted lines returns 400."""
        count = self._create_and_start_count()

        # Record only the first line, leave others uncounted
        first_line = count.lines.first()
        svc = CycleCountService(self.tenant, self.user)
        svc.record_count(
            line_id=first_line.id,
            counted_quantity=first_line.expected_quantity,
            cycle_count_id=count.id,
        )

        # At least one line is still uncounted (we have 2 stock quants)
        url = f'/api/v1/warehouse/cycle-counts/{count.id}/finalize/'
        response = self.client.post(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_full_workflow(self):
        """End-to-end: create -> start -> record all -> finalize, verify stock adjustments."""
        # Step 1: Create via API
        create_url = '/api/v1/warehouse/cycle-counts/'
        create_response = self.client.post(
            create_url, {'warehouse': self.warehouse.id}, format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        count_id = create_response.data['id']

        # Step 2: Start via API
        start_url = f'/api/v1/warehouse/cycle-counts/{count_id}/start/'
        start_response = self.client.post(start_url, format='json')
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)
        self.assertEqual(start_response.data['status'], 'in_progress')
        lines = start_response.data['lines']
        self.assertGreater(len(lines), 0)

        # Step 3: Record each line with a variance
        # For item1 at loc_a: expected 100, count 90 (shortage of 10)
        # For item2 at loc_b: expected 50, count 55 (overage of 5)
        for line_data in lines:
            if line_data['item'] == self.item1.id:
                counted_qty = '90.0000'
            else:
                counted_qty = '55.0000'

            record_url = f'/api/v1/warehouse/cycle-counts/{count_id}/record/'
            record_response = self.client.post(
                record_url,
                {'line_id': line_data['id'], 'counted_quantity': counted_qty},
                format='json',
            )
            self.assertEqual(record_response.status_code, status.HTTP_200_OK)
            self.assertTrue(record_response.data['is_counted'])

        # Step 4: Finalize via API
        finalize_url = f'/api/v1/warehouse/cycle-counts/{count_id}/finalize/'
        finalize_response = self.client.post(finalize_url, format='json')
        self.assertEqual(finalize_response.status_code, status.HTTP_200_OK)
        self.assertEqual(finalize_response.data['status'], 'completed')

        # Step 5: Verify stock adjustments were applied
        set_current_tenant(self.tenant)
        # item1 at loc_a: was 100, shortage of 10 -> should be 90
        quant_a = StockQuant.objects.get(
            tenant=self.tenant, item=self.item1, location=self.loc_a,
        )
        self.assertEqual(quant_a.quantity, Decimal('90.0000'))

        # item2 at loc_b: was 50, overage of 5 -> should be 55
        quant_b = StockQuant.objects.get(
            tenant=self.tenant, item=self.item2, location=self.loc_b,
        )
        self.assertEqual(quant_b.quantity, Decimal('55.0000'))

        # Verify StockMoveLogs were created for adjustments
        adjustment_moves = StockMoveLog.objects.filter(
            tenant=self.tenant,
            reference__contains='adjustment',
        )
        self.assertGreater(adjustment_moves.count(), 0)


# =============================================================================
# TENANT ISOLATION TESTS
# =============================================================================

class TenantIsolationTests(WMSAPITestCase):
    """Tests that tenant isolation is enforced across WMS endpoints."""

    def test_cannot_see_other_tenant_locations(self):
        """Location from another tenant does not appear in scanner lookup."""
        # Create another tenant and its data
        other_tenant = Tenant.objects.create(
            name='Other Company',
            subdomain='other-wms',
            is_active=True,
        )
        set_current_tenant(other_tenant)

        other_warehouse = Warehouse.objects.create(
            tenant=other_tenant,
            name='Other Warehouse',
            code='OTHER',
            is_active=True,
        )
        other_loc = WarehouseLocation.objects.create(
            tenant=other_tenant,
            warehouse=other_warehouse,
            name='OTHER-LOC',
            barcode='LOC-OTHER-001',
            type='STORAGE',
            is_active=True,
        )

        # Switch back to our tenant
        set_current_tenant(self.tenant)

        # Try to look up the other tenant's location barcode
        url = '/api/v1/warehouse/scanner/location/'
        response = self.client.get(url, {'barcode': 'LOC-OTHER-001'})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_see_other_tenant_counts(self):
        """Cycle count from another tenant does not appear in list."""
        # Create another tenant and its cycle count
        other_tenant = Tenant.objects.create(
            name='Other Company CC',
            subdomain='other-cc',
            is_active=True,
        )
        set_current_tenant(other_tenant)

        other_warehouse = Warehouse.objects.create(
            tenant=other_tenant,
            name='Other WH',
            code='OTH',
            is_active=True,
        )
        other_count = CycleCount.objects.create(
            tenant=other_tenant,
            count_number='CC-OTHER-001',
            warehouse=other_warehouse,
            status='draft',
        )

        # Switch back to our tenant
        set_current_tenant(self.tenant)

        # List cycle counts - should not contain the other tenant's count
        url = '/api/v1/warehouse/cycle-counts/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Handle both paginated and non-paginated responses
        results = response.data.get('results', response.data)
        if isinstance(results, list):
            count_ids = [item['id'] for item in results]
        else:
            count_ids = []

        self.assertNotIn(other_count.id, count_ids)


# =============================================================================
# AUTHENTICATION TESTS
# =============================================================================

class AuthenticationTests(WMSAPITestCase):
    """Tests that unauthenticated requests are rejected."""

    def test_unauthenticated_scanner(self):
        """Unauthenticated GET to scanner endpoint returns 401."""
        self.client.force_authenticate(user=None)

        url = '/api/v1/warehouse/scanner/location/'
        response = self.client.get(url, {'barcode': 'LOC-A01'})

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_cycle_counts(self):
        """Unauthenticated GET to cycle counts endpoint returns 401."""
        self.client.force_authenticate(user=None)

        url = '/api/v1/warehouse/cycle-counts/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
