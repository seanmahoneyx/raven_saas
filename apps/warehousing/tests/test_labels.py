# apps/warehousing/tests/test_labels.py
"""
Tests for the label generation service and API endpoints.

Test coverage:
- LabelService: item labels, bin labels, LPN labels (ZPL output)
- API endpoints: POST /api/v1/labels/items/, /bins/, /lpns/
- Authentication requirements
"""
import os
from decimal import Decimal
from datetime import date
from unittest import skipIf

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.warehousing.models import Warehouse, WarehouseLocation
from apps.orders.models import SalesOrder
from apps.logistics.models import LicensePlate
from apps.warehousing.labels import LabelService
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# BASE TEST CLASS
# =============================================================================

class LabelsTestCase(TestCase):
    """Base test case with shared setup for label tests."""

    @classmethod
    def setUpTestData(cls):
        """Create shared test data (runs once per test class)."""
        # Create tenant
        cls.tenant = Tenant.objects.create(
            name='Labels Test Company',
            subdomain='test-labels',
            is_default=True,
        )

        # Create user
        cls.user = User.objects.create_user(
            username='labels_testuser',
            email='labels@test.com',
            password='testpass123',
        )

        # Set current tenant for TenantManager
        set_current_tenant(cls.tenant)

        # Create UOM
        cls.uom_each = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='ea',
            name='Each',
            is_active=True,
        )

        # Create customer party
        cls.customer_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='LBLCUST001',
            display_name='Label Test Customer',
            legal_name='Label Test Customer Inc.',
            is_active=True,
        )

        # Create customer
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            payment_terms='NET30',
        )

        # Create ship-to location
        cls.location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            name='Main Ship-To',
            location_type='SHIP_TO',
            address_line1='456 Warehouse Blvd',
            city='Stockton',
            state='CA',
            postal_code='95201',
            country='USA',
        )

        # Set default ship to/bill to
        cls.customer.default_ship_to = cls.location
        cls.customer.default_bill_to = cls.location
        cls.customer.save()

        # Create a billing location for Warehouse FK
        cls.warehouse_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            name='Warehouse Address',
            location_type='BILLING',
            address_line1='100 Industrial Dr',
            city='Stockton',
            state='CA',
            postal_code='95202',
            country='USA',
        )

        # Create item
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku='LBL-001',
            name='Label Test Item',
            division='misc',
            base_uom=cls.uom_each,
            is_active=True,
        )

        # Create warehouse
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant,
            name='Main Label Warehouse',
            code='LBL',
            location=cls.warehouse_location,
            is_active=True,
        )

        # Create warehouse locations (bins)
        cls.wh_loc1 = WarehouseLocation.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            name='A-01-01',
            barcode='LBL-A-01-01',
            type='STORAGE',
            is_active=True,
        )
        cls.wh_loc2 = WarehouseLocation.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            name='A-01-02',
            barcode='LBL-A-01-02',
            type='STORAGE',
            is_active=True,
        )
        cls.wh_loc_inactive = WarehouseLocation.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            name='Z-99-99',
            barcode='LBL-Z-99-99',
            type='STORAGE',
            is_active=False,
        )

        # Create sales order
        cls.sales_order = SalesOrder.objects.create(
            tenant=cls.tenant,
            order_number='LBL-SO-001',
            customer=cls.customer,
            order_date=date.today(),
            status='confirmed',
            ship_to=cls.location,
        )

        # Create LPN
        cls.lpn = LicensePlate.objects.create(
            tenant=cls.tenant,
            code='LPN-LBL-001',
            order=cls.sales_order,
            weight_lbs=Decimal('25.00'),
            status='STAGED',
        )

    def setUp(self):
        """Set up for each test (runs before each test method)."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)
        self.service = LabelService(self.tenant)


# =============================================================================
# LABEL SERVICE - ITEM LABELS
# =============================================================================

class LabelServiceItemTests(LabelsTestCase):
    """Tests for LabelService.generate_item_labels()."""

    def test_generate_item_labels_zpl(self):
        """Generate ZPL labels for an item; verify structure and SKU presence."""
        result = self.service.generate_item_labels(self.item.id, qty=1, fmt='ZPL')
        self.assertIsInstance(result, str)
        self.assertIn('^XA', result)
        self.assertIn('^XZ', result)
        self.assertIn('LBL-001', result)

    def test_generate_item_labels_zpl_quantity(self):
        """Generate 5 ZPL labels; verify 5 ^XA markers are present."""
        result = self.service.generate_item_labels(self.item.id, qty=5, fmt='ZPL')
        self.assertIsInstance(result, str)
        self.assertEqual(result.count('^XA'), 5)
        self.assertEqual(result.count('^XZ'), 5)

    def test_generate_item_labels_long_name(self):
        """Item with name > 35 chars should be truncated with '...' in ZPL output."""
        long_name_item = Item.objects.create(
            tenant=self.tenant,
            sku='LBL-LONG',
            name='This Is A Very Long Item Name That Exceeds Thirty Five Characters',
            division='misc',
            base_uom=self.uom_each,
            is_active=True,
        )
        result = self.service.generate_item_labels(long_name_item.id, qty=1, fmt='ZPL')
        self.assertIn('...', result)
        # Verify the truncated portion (first 35 chars + '...')
        expected_prefix = 'This Is A Very Long Item Name That '[:35]
        self.assertIn(expected_prefix, result)

    def test_generate_item_labels_invalid_item(self):
        """Generate labels for non-existent item raises Item.DoesNotExist."""
        with self.assertRaises(Item.DoesNotExist):
            self.service.generate_item_labels(999999, qty=1, fmt='ZPL')


# =============================================================================
# LABEL SERVICE - BIN LABELS
# =============================================================================

class LabelServiceBinTests(LabelsTestCase):
    """Tests for LabelService.generate_bin_labels()."""

    def test_generate_bin_labels_by_warehouse_zpl(self):
        """Generate bin labels for all active locations in a warehouse."""
        result = self.service.generate_bin_labels(
            warehouse_id=self.warehouse.id, fmt='ZPL'
        )
        self.assertIsInstance(result, str)
        self.assertIn('^XA', result)
        self.assertIn('^XZ', result)
        # Both active locations should be included
        self.assertIn('LBL-A-01-01', result)
        self.assertIn('LBL-A-01-02', result)

    def test_generate_bin_labels_by_location_ids_zpl(self):
        """Generate bin labels for specific location IDs only."""
        result = self.service.generate_bin_labels(
            location_ids=[self.wh_loc1.id], fmt='ZPL'
        )
        self.assertIsInstance(result, str)
        self.assertIn('^XA', result)
        self.assertIn('LBL-A-01-01', result)
        # wh_loc2 should NOT be included
        self.assertNotIn('LBL-A-01-02', result)

    def test_generate_bin_labels_no_params(self):
        """Raises ValueError when neither warehouse_id nor location_ids provided."""
        with self.assertRaises(ValueError):
            self.service.generate_bin_labels(fmt='ZPL')

    def test_generate_bin_labels_inactive_excluded(self):
        """Inactive locations are excluded when generating by warehouse_id."""
        result = self.service.generate_bin_labels(
            warehouse_id=self.warehouse.id, fmt='ZPL'
        )
        self.assertIsInstance(result, str)
        # Inactive location barcode should NOT appear
        self.assertNotIn('LBL-Z-99-99', result)


# =============================================================================
# LABEL SERVICE - LPN LABELS
# =============================================================================

class LabelServiceLPNTests(LabelsTestCase):
    """Tests for LabelService.generate_lpn_labels()."""

    def test_generate_lpn_labels_zpl(self):
        """Generate ZPL LPN label; verify LPN code, customer, order number, weight."""
        result = self.service.generate_lpn_labels([self.lpn.id], fmt='ZPL')
        self.assertIsInstance(result, str)
        self.assertIn('^XA', result)
        self.assertIn('^XZ', result)
        self.assertIn('LPN-LBL-001', result)
        self.assertIn('Label Test Customer', result)
        self.assertIn('LBL-SO-001', result)
        self.assertIn('25.00', result)

    def test_generate_lpn_labels_zpl_multiple(self):
        """Multiple LPNs produce multiple label blocks."""
        lpn2 = LicensePlate.objects.create(
            tenant=self.tenant,
            code='LPN-LBL-002',
            order=self.sales_order,
            weight_lbs=Decimal('18.50'),
            status='STAGED',
        )
        result = self.service.generate_lpn_labels([self.lpn.id, lpn2.id], fmt='ZPL')
        self.assertIsInstance(result, str)
        self.assertEqual(result.count('^XA'), 2)
        self.assertIn('LPN-LBL-001', result)
        self.assertIn('LPN-LBL-002', result)


# =============================================================================
# API ENDPOINT - ITEM LABELS
# =============================================================================

class ItemLabelsAPITests(LabelsTestCase):
    """Tests for POST /api/v1/labels/items/"""

    def test_post_item_labels_zpl(self):
        """POST with valid item_id and format=ZPL returns 200 text/plain."""
        response = self.client.post(
            '/api/v1/labels/items/',
            {'item_id': self.item.id, 'qty': 1, 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/plain')
        self.assertIn(b'^XA', response.content)

    def test_post_item_labels_missing_item_id(self):
        """POST without item_id returns 400 with error message."""
        response = self.client.post(
            '/api/v1/labels/items/',
            {'qty': 1, 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_post_item_labels_qty_too_high(self):
        """POST with qty=301 returns 400."""
        response = self.client.post(
            '/api/v1/labels/items/',
            {'item_id': self.item.id, 'qty': 301, 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_post_item_labels_qty_too_low(self):
        """POST with qty=0 returns 400."""
        response = self.client.post(
            '/api/v1/labels/items/',
            {'item_id': self.item.id, 'qty': 0, 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)


# =============================================================================
# API ENDPOINT - BIN LABELS
# =============================================================================

class BinLabelsAPITests(LabelsTestCase):
    """Tests for POST /api/v1/labels/bins/"""

    def test_post_bin_labels_zpl(self):
        """POST with warehouse_id and format=ZPL returns 200 text/plain."""
        response = self.client.post(
            '/api/v1/labels/bins/',
            {'warehouse_id': self.warehouse.id, 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/plain')
        self.assertIn(b'^XA', response.content)

    def test_post_bin_labels_missing_params(self):
        """POST without warehouse_id or location_ids returns 400."""
        response = self.client.post(
            '/api/v1/labels/bins/',
            {'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)


# =============================================================================
# API ENDPOINT - LPN LABELS
# =============================================================================

class LPNLabelsAPITests(LabelsTestCase):
    """Tests for POST /api/v1/labels/lpns/"""

    def test_post_lpn_labels_zpl(self):
        """POST with lpn_ids returns 200 text/plain."""
        response = self.client.post(
            '/api/v1/labels/lpns/',
            {'lpn_ids': [self.lpn.id], 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/plain')
        self.assertIn(b'^XA', response.content)

    def test_post_lpn_labels_missing_ids(self):
        """POST with empty lpn_ids returns 400."""
        response = self.client.post(
            '/api/v1/labels/lpns/',
            {'lpn_ids': [], 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)


# =============================================================================
# AUTHENTICATION TESTS
# =============================================================================

class LabelsAuthenticationTests(LabelsTestCase):
    """Tests for API authentication requirements on label endpoints."""

    def setUp(self):
        """Set up unauthenticated client."""
        super().setUp()
        self.anon_client = APIClient()  # No force_authenticate

    def test_item_labels_unauthenticated(self):
        """Unauthenticated request to item labels returns 401."""
        response = self.anon_client.post(
            '/api/v1/labels/items/',
            {'item_id': self.item.id, 'qty': 1, 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_bin_labels_unauthenticated(self):
        """Unauthenticated request to bin labels returns 401."""
        response = self.anon_client.post(
            '/api/v1/labels/bins/',
            {'warehouse_id': self.warehouse.id, 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_lpn_labels_unauthenticated(self):
        """Unauthenticated request to LPN labels returns 401."""
        response = self.anon_client.post(
            '/api/v1/labels/lpns/',
            {'lpn_ids': [self.lpn.id], 'format': 'ZPL'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
