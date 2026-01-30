# apps/api/tests/test_items.py
"""
Tests for Item-related models, serializers, and API endpoints.

Test coverage:
- Model tests: multi-table inheritance, relationships, constraints
- Serializer tests: validation, computed fields
- API endpoint tests: CRUD operations, filtering, nested routes
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party
from apps.items.models import (
    UnitOfMeasure, Item, ItemUOM, ItemVendor,
    CorrugatedFeature, CorrugatedItem, ItemFeature,
    DCItem, RSCItem, HSCItem, FOLItem, TeleItem,
)
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# BASE TEST CLASS
# =============================================================================

class ItemsTestCase(TestCase):
    """Base test case with shared setup for item tests."""

    @classmethod
    def setUpTestData(cls):
        """Create shared test data (runs once per test class)."""
        # Create tenant
        cls.tenant = Tenant.objects.create(
            name='Test Company',
            subdomain='test-items',
            is_default=True,
        )

        # Create user
        cls.user = User.objects.create_user(
            username='testuser',
            email='testuser@test.com',
            password='testpass123',
        )

        # Set current tenant for TenantManager
        set_current_tenant(cls.tenant)

        # Create UOMs
        cls.uom_each = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='ea',
            name='Each',
            is_active=True,
        )
        cls.uom_case = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='cs',
            name='Case',
            is_active=True,
        )
        cls.uom_pallet = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='plt',
            name='Pallet',
            is_active=True,
        )

        # Create vendor party
        cls.vendor = Party.objects.create(
            tenant=cls.tenant,
            party_type='VENDOR',
            code='VND001',
            display_name='Test Vendor',
            legal_name='Test Vendor Inc.',
            is_active=True,
        )

        # Create customer party
        cls.customer = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='CUST001',
            display_name='Test Customer',
            legal_name='Test Customer Inc.',
            is_active=True,
        )

        # Create corrugated features
        cls.feature_handhole = CorrugatedFeature.objects.create(
            tenant=cls.tenant,
            code='handhole',
            name='Handholes',
            requires_details=False,
            is_active=True,
        )
        cls.feature_perf = CorrugatedFeature.objects.create(
            tenant=cls.tenant,
            code='perf',
            name='Perforations',
            requires_details=True,
            is_active=True,
        )

    def setUp(self):
        """Set up for each test (runs before each test method)."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)


# =============================================================================
# MODEL TESTS
# =============================================================================

class ItemModelTests(ItemsTestCase):
    """Tests for base Item model."""

    def test_create_base_item(self):
        """Test creating a base item."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='ITEM-001',
            name='Test Item',
            division='misc',
            base_uom=self.uom_each,
            is_active=True,
        )
        self.assertEqual(item.sku, 'ITEM-001')
        self.assertEqual(item.division, 'misc')
        self.assertEqual(item.base_uom, self.uom_each)

    def test_item_str_representation(self):
        """Test item string representation."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='ITEM-002',
            name='Widget',
            base_uom=self.uom_each,
        )
        self.assertEqual(str(item), 'ITEM-002 - Widget')

    def test_sku_unique_per_tenant(self):
        """Test SKU is unique per tenant."""
        Item.objects.create(
            tenant=self.tenant,
            sku='UNIQUE-SKU',
            name='First Item',
            base_uom=self.uom_each,
        )
        with self.assertRaises(IntegrityError):
            Item.objects.create(
                tenant=self.tenant,
                sku='UNIQUE-SKU',
                name='Second Item',
                base_uom=self.uom_each,
            )

    def test_item_with_customer(self):
        """Test creating customer-specific item."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='CUST-ITEM-001',
            name='Customer Specific Item',
            base_uom=self.uom_each,
            customer=self.customer,
        )
        self.assertEqual(item.customer, self.customer)

    def test_item_with_unitizing_fields(self):
        """Test item with unitizing/pallet info."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='PALLET-ITEM',
            name='Palletized Item',
            base_uom=self.uom_each,
            units_per_layer=24,
            layers_per_pallet=10,
            units_per_pallet=240,
            unit_height=Decimal('2.5'),
            pallet_height=Decimal('48.0'),
            pallet_footprint='48x40',
        )
        self.assertEqual(item.units_per_layer, 24)
        self.assertEqual(item.layers_per_pallet, 10)
        self.assertEqual(item.units_per_pallet, 240)
        self.assertEqual(item.pallet_footprint, '48x40')


class ItemUOMTests(ItemsTestCase):
    """Tests for ItemUOM conversion model."""

    def test_create_uom_conversion(self):
        """Test creating UOM conversion."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='UOM-ITEM',
            name='Item with Conversions',
            base_uom=self.uom_each,
        )
        conversion = ItemUOM.objects.create(
            tenant=self.tenant,
            item=item,
            uom=self.uom_case,
            multiplier_to_base=12,
        )
        self.assertEqual(conversion.multiplier_to_base, 12)
        self.assertEqual(str(conversion), 'UOM-ITEM: 1 cs = 12 ea')

    def test_get_uom_multiplier(self):
        """Test get_uom_multiplier method."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='MULT-ITEM',
            name='Multiplier Test Item',
            base_uom=self.uom_each,
        )
        ItemUOM.objects.create(
            tenant=self.tenant,
            item=item,
            uom=self.uom_case,
            multiplier_to_base=12,
        )
        # Base UOM returns 1
        self.assertEqual(item.get_uom_multiplier(self.uom_each), 1)
        # Converted UOM returns multiplier
        self.assertEqual(item.get_uom_multiplier(self.uom_case), 12)
        # Unknown UOM returns 1
        self.assertEqual(item.get_uom_multiplier(self.uom_pallet), 1)


class ItemVendorTests(ItemsTestCase):
    """Tests for ItemVendor model."""

    def test_create_item_vendor(self):
        """Test creating item-vendor relationship."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='VND-ITEM',
            name='Vendor Item',
            base_uom=self.uom_each,
        )
        item_vendor = ItemVendor.objects.create(
            tenant=self.tenant,
            item=item,
            vendor=self.vendor,
            mpn='ABC-12345',
            lead_time_days=14,
            min_order_qty=100,
            is_preferred=True,
        )
        self.assertEqual(item_vendor.mpn, 'ABC-12345')
        self.assertEqual(item_vendor.lead_time_days, 14)
        self.assertTrue(item_vendor.is_preferred)

    def test_item_vendor_unique_constraint(self):
        """Test item-vendor is unique per tenant."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='UNIQUE-VND',
            name='Unique Vendor Test',
            base_uom=self.uom_each,
        )
        ItemVendor.objects.create(
            tenant=self.tenant,
            item=item,
            vendor=self.vendor,
            mpn='MPN-001',
        )
        with self.assertRaises(IntegrityError):
            ItemVendor.objects.create(
                tenant=self.tenant,
                item=item,
                vendor=self.vendor,
                mpn='MPN-002',  # Different MPN, same item+vendor
            )


class CorrugatedItemTests(ItemsTestCase):
    """Tests for CorrugatedItem and subtypes."""

    def test_create_corrugated_item(self):
        """Test creating base corrugated item."""
        item = CorrugatedItem.objects.create(
            tenant=self.tenant,
            sku='CORR-001',
            name='Corrugated Item',
            base_uom=self.uom_each,
            test='ect32',
            flute='c',
            paper='k',
            is_printed=True,
            panels_printed=2,
            colors_printed=3,
            ink_list='Black, Red, PMS 286',
        )
        self.assertEqual(item.division, 'corrugated')  # Auto-set
        self.assertEqual(item.test, 'ect32')
        self.assertEqual(item.flute, 'c')
        self.assertTrue(item.is_printed)

    def test_corrugated_division_forced(self):
        """Test that division is always 'corrugated' for CorrugatedItem."""
        item = CorrugatedItem.objects.create(
            tenant=self.tenant,
            sku='DIV-TEST',
            name='Division Test',
            division='misc',  # Try to set different division
            base_uom=self.uom_each,
        )
        self.assertEqual(item.division, 'corrugated')  # Should be overridden

    def test_multi_table_inheritance(self):
        """Test multi-table inheritance relationship."""
        item = CorrugatedItem.objects.create(
            tenant=self.tenant,
            sku='MTI-001',
            name='Inheritance Test',
            base_uom=self.uom_each,
            test='ect40',
        )
        # Item should exist in both tables
        self.assertTrue(Item.objects.filter(sku='MTI-001').exists())
        self.assertTrue(CorrugatedItem.objects.filter(sku='MTI-001').exists())

        # Access via Item should work
        base_item = Item.objects.get(sku='MTI-001')
        self.assertTrue(hasattr(base_item, 'corrugateditem'))
        self.assertEqual(base_item.corrugateditem.test, 'ect40')


class DCItemTests(ItemsTestCase):
    """Tests for DCItem (Die Cut) model."""

    def test_create_dc_item(self):
        """Test creating DC item with dimensions."""
        item = DCItem.objects.create(
            tenant=self.tenant,
            sku='DC-001',
            name='Die Cut Box',
            base_uom=self.uom_each,
            test='ect32',
            flute='b',
            length=Decimal('12.5'),
            width=Decimal('8.25'),
            blank_length=Decimal('24.0'),
            blank_width=Decimal('18.0'),
            out_per_rotary=4,
        )
        self.assertEqual(item.length, Decimal('12.5'))
        self.assertEqual(item.width, Decimal('8.25'))
        self.assertEqual(item.out_per_rotary, 4)

    def test_dc_item_inheritance_chain(self):
        """Test DCItem inherits from CorrugatedItem which inherits from Item."""
        item = DCItem.objects.create(
            tenant=self.tenant,
            sku='DC-CHAIN',
            name='Inheritance Chain Test',
            base_uom=self.uom_each,
            length=Decimal('10.0'),
            width=Decimal('8.0'),
        )
        # Check all three tables
        self.assertTrue(Item.objects.filter(sku='DC-CHAIN').exists())
        self.assertTrue(CorrugatedItem.objects.filter(sku='DC-CHAIN').exists())
        self.assertTrue(DCItem.objects.filter(sku='DC-CHAIN').exists())

        # Check hasattr on base Item
        base_item = Item.objects.get(sku='DC-CHAIN')
        self.assertTrue(hasattr(base_item, 'corrugateditem'))
        self.assertTrue(hasattr(base_item.corrugateditem, 'dcitem'))


class RSCItemTests(ItemsTestCase):
    """Tests for RSCItem (Regular Slotted Container) model."""

    def test_create_rsc_item(self):
        """Test creating RSC item with L×W×H."""
        item = RSCItem.objects.create(
            tenant=self.tenant,
            sku='RSC-001',
            name='RSC Box 12x10x8',
            base_uom=self.uom_each,
            test='ect32',
            flute='c',
            paper='k',
            length=Decimal('12.0'),
            width=Decimal('10.0'),
            height=Decimal('8.0'),
        )
        self.assertEqual(item.length, Decimal('12.0'))
        self.assertEqual(item.width, Decimal('10.0'))
        self.assertEqual(item.height, Decimal('8.0'))


class HSCItemTests(ItemsTestCase):
    """Tests for HSCItem (Half Slotted Container) model."""

    def test_create_hsc_item(self):
        """Test creating HSC item."""
        item = HSCItem.objects.create(
            tenant=self.tenant,
            sku='HSC-001',
            name='HSC Tray',
            base_uom=self.uom_each,
            length=Decimal('15.0'),
            width=Decimal('12.0'),
            height=Decimal('4.0'),
        )
        self.assertEqual(item.height, Decimal('4.0'))


class FOLItemTests(ItemsTestCase):
    """Tests for FOLItem (Full Overlap) model."""

    def test_create_fol_item(self):
        """Test creating FOL item."""
        item = FOLItem.objects.create(
            tenant=self.tenant,
            sku='FOL-001',
            name='Full Overlap Box',
            base_uom=self.uom_each,
            length=Decimal('18.0'),
            width=Decimal('14.0'),
            height=Decimal('12.0'),
        )
        self.assertEqual(item.length, Decimal('18.0'))


class TeleItemTests(ItemsTestCase):
    """Tests for TeleItem (Telescoping) model."""

    def test_create_tele_item(self):
        """Test creating Telescoping item."""
        item = TeleItem.objects.create(
            tenant=self.tenant,
            sku='TELE-001',
            name='Telescoping Box',
            base_uom=self.uom_each,
            length=Decimal('20.0'),
            width=Decimal('16.0'),
            height=Decimal('10.0'),
        )
        self.assertEqual(item.length, Decimal('20.0'))


class ItemFeatureTests(ItemsTestCase):
    """Tests for CorrugatedFeature and ItemFeature models."""

    def test_create_feature(self):
        """Test creating corrugated feature."""
        feature = CorrugatedFeature.objects.create(
            tenant=self.tenant,
            code='extra_score',
            name='Extra Scores',
            requires_details=True,
        )
        self.assertEqual(feature.code, 'extra_score')
        self.assertTrue(feature.requires_details)

    def test_add_feature_to_item(self):
        """Test adding feature to corrugated item."""
        item = RSCItem.objects.create(
            tenant=self.tenant,
            sku='FEAT-001',
            name='Item with Features',
            base_uom=self.uom_each,
            length=Decimal('12.0'),
            width=Decimal('10.0'),
            height=Decimal('8.0'),
        )
        item_feature = ItemFeature.objects.create(
            tenant=self.tenant,
            corrugated_item=item,
            feature=self.feature_handhole,
        )
        self.assertEqual(item.features.count(), 1)
        self.assertIn(self.feature_handhole, item.features.all())

    def test_feature_with_details(self):
        """Test adding feature that requires details."""
        item = RSCItem.objects.create(
            tenant=self.tenant,
            sku='PERF-001',
            name='Perforated Box',
            base_uom=self.uom_each,
            length=Decimal('12.0'),
            width=Decimal('10.0'),
            height=Decimal('8.0'),
        )
        item_feature = ItemFeature.objects.create(
            tenant=self.tenant,
            corrugated_item=item,
            feature=self.feature_perf,
            details='Perforation at 4 inches from top',
        )
        self.assertEqual(item_feature.details, 'Perforation at 4 inches from top')


# =============================================================================
# API ENDPOINT TESTS
# =============================================================================

class ItemAPITests(ItemsTestCase):
    """Tests for Item API endpoints."""

    def test_list_items(self):
        """Test GET /api/v1/items/"""
        Item.objects.create(
            tenant=self.tenant,
            sku='API-001',
            name='API Test Item',
            base_uom=self.uom_each,
        )
        response = self.client.get('/api/v1/items/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_create_item(self):
        """Test POST /api/v1/items/"""
        data = {
            'sku': 'NEW-001',
            'name': 'New Item',
            'division': 'misc',
            'base_uom': self.uom_each.id,
            'is_active': True,
        }
        response = self.client.post('/api/v1/items/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['sku'], 'NEW-001')

    def test_get_item_detail(self):
        """Test GET /api/v1/items/{id}/"""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='DETAIL-001',
            name='Detail Test Item',
            base_uom=self.uom_each,
        )
        response = self.client.get(f'/api/v1/items/{item.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sku'], 'DETAIL-001')
        self.assertIn('base_uom_code', response.data)

    def test_update_item(self):
        """Test PATCH /api/v1/items/{id}/"""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='UPDATE-001',
            name='Original Name',
            base_uom=self.uom_each,
        )
        response = self.client.patch(
            f'/api/v1/items/{item.id}/',
            {'name': 'Updated Name'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Name')

    def test_delete_item(self):
        """Test DELETE /api/v1/items/{id}/"""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='DELETE-001',
            name='Delete Test',
            base_uom=self.uom_each,
        )
        response = self.client.delete(f'/api/v1/items/{item.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Item.objects.filter(id=item.id).exists())

    def test_filter_items_by_division(self):
        """Test filtering items by division."""
        Item.objects.create(
            tenant=self.tenant,
            sku='CORR-FILTER',
            name='Corrugated Filter Test',
            division='corrugated',
            base_uom=self.uom_each,
        )
        Item.objects.create(
            tenant=self.tenant,
            sku='MISC-FILTER',
            name='Misc Filter Test',
            division='misc',
            base_uom=self.uom_each,
        )
        response = self.client.get('/api/v1/items/', {'division': 'corrugated'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data['results']:
            self.assertEqual(item['division'], 'corrugated')

    def test_item_type_field_base(self):
        """Test item_type field returns 'base' for base items."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='TYPE-BASE',
            name='Base Type Test',
            base_uom=self.uom_each,
        )
        response = self.client.get(f'/api/v1/items/{item.id}/')
        self.assertEqual(response.data['item_type'], 'base')

    def test_item_type_field_rsc(self):
        """Test item_type field returns 'rsc' for RSC items."""
        item = RSCItem.objects.create(
            tenant=self.tenant,
            sku='TYPE-RSC',
            name='RSC Type Test',
            base_uom=self.uom_each,
            length=Decimal('12.0'),
            width=Decimal('10.0'),
            height=Decimal('8.0'),
        )
        response = self.client.get(f'/api/v1/items/{item.id}/')
        self.assertEqual(response.data['item_type'], 'rsc')


class ItemVendorAPITests(ItemsTestCase):
    """Tests for ItemVendor nested API endpoints."""

    def test_list_item_vendors(self):
        """Test GET /api/v1/items/{item_id}/vendors/"""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='VND-API-001',
            name='Vendor API Test',
            base_uom=self.uom_each,
        )
        ItemVendor.objects.create(
            tenant=self.tenant,
            item=item,
            vendor=self.vendor,
            mpn='API-MPN-001',
        )
        response = self.client.get(f'/api/v1/items/{item.id}/vendors/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['mpn'], 'API-MPN-001')

    def test_create_item_vendor(self):
        """Test POST /api/v1/items/{item_id}/vendors/"""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='VND-CREATE',
            name='Create Vendor Test',
            base_uom=self.uom_each,
        )
        data = {
            'vendor': self.vendor.id,
            'mpn': 'NEW-MPN-001',
            'lead_time_days': 7,
        }
        response = self.client.post(f'/api/v1/items/{item.id}/vendors/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['mpn'], 'NEW-MPN-001')


class RSCItemAPITests(ItemsTestCase):
    """Tests for RSC Item API endpoints."""

    def test_list_rsc_items(self):
        """Test GET /api/v1/rsc-items/"""
        RSCItem.objects.create(
            tenant=self.tenant,
            sku='RSC-API-001',
            name='RSC API Test',
            base_uom=self.uom_each,
            length=Decimal('12.0'),
            width=Decimal('10.0'),
            height=Decimal('8.0'),
        )
        response = self.client.get('/api/v1/rsc-items/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_create_rsc_item(self):
        """Test POST /api/v1/rsc-items/"""
        data = {
            'sku': 'RSC-NEW',
            'name': 'New RSC Box',
            'base_uom': self.uom_each.id,
            'test': 'ect32',
            'flute': 'c',
            'paper': 'k',
            'length': '12.0',
            'width': '10.0',
            'height': '8.0',
        }
        response = self.client.post('/api/v1/rsc-items/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['sku'], 'RSC-NEW')
        self.assertEqual(response.data['division'], 'corrugated')

    def test_get_rsc_item_detail(self):
        """Test GET /api/v1/rsc-items/{id}/"""
        item = RSCItem.objects.create(
            tenant=self.tenant,
            sku='RSC-DETAIL',
            name='RSC Detail Test',
            base_uom=self.uom_each,
            test='ect40',
            flute='b',
            length=Decimal('14.0'),
            width=Decimal('12.0'),
            height=Decimal('10.0'),
        )
        response = self.client.get(f'/api/v1/rsc-items/{item.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['length'], '14.0000')
        self.assertEqual(response.data['test'], 'ect40')


class DCItemAPITests(ItemsTestCase):
    """Tests for DC Item API endpoints."""

    def test_create_dc_item(self):
        """Test POST /api/v1/dc-items/"""
        data = {
            'sku': 'DC-NEW',
            'name': 'New DC Box',
            'base_uom': self.uom_each.id,
            'test': 'ect32',
            'flute': 'b',
            'length': '12.5',
            'width': '8.25',
            'blank_length': '24.0',
            'blank_width': '18.0',
            'out_per_rotary': 4,
        }
        response = self.client.post('/api/v1/dc-items/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['out_per_rotary'], 4)
        self.assertEqual(response.data['blank_length'], '24.0000')


class CorrugatedFeatureAPITests(ItemsTestCase):
    """Tests for CorrugatedFeature API endpoints."""

    def test_list_features(self):
        """Test GET /api/v1/corrugated-features/"""
        response = self.client.get('/api/v1/corrugated-features/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 2)

    def test_create_feature(self):
        """Test POST /api/v1/corrugated-features/"""
        data = {
            'code': 'wra',
            'name': 'Weather Resistant Adhesive',
            'requires_details': False,
        }
        response = self.client.post('/api/v1/corrugated-features/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['code'], 'wra')


# =============================================================================
# AUTHENTICATION & TENANT ISOLATION TESTS
# =============================================================================

class AuthenticationTests(ItemsTestCase):
    """Tests for API authentication requirements."""

    def test_unauthenticated_request_rejected(self):
        """Test that unauthenticated requests are rejected."""
        self.client.logout()
        response = self.client.get('/api/v1/items/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_request_allowed(self):
        """Test that authenticated requests are allowed."""
        response = self.client.get('/api/v1/items/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class TenantIsolationTests(ItemsTestCase):
    """Tests for tenant data isolation."""

    def test_sku_unique_per_tenant_allows_same_sku(self):
        """Test that same SKU can exist in different tenants."""
        # Create item in test tenant
        Item.objects.create(
            tenant=self.tenant,
            sku='ISOLATED-001',
            name='Tenant 1 Item',
            base_uom=self.uom_each,
        )

        # Create second tenant with own UOM and item
        tenant2 = Tenant.objects.create(
            name='Other Company',
            subdomain='other-items',
        )

        set_current_tenant(tenant2)
        uom2 = UnitOfMeasure.objects.create(
            tenant=tenant2,
            code='ea',
            name='Each',
        )
        # Same SKU should be allowed in different tenant
        item2 = Item.objects.create(
            tenant=tenant2,
            sku='ISOLATED-001',  # Same SKU, different tenant - should work
            name='Tenant 2 Item',
            base_uom=uom2,
        )

        # Verify both items exist
        self.assertEqual(item2.sku, 'ISOLATED-001')
        self.assertEqual(item2.tenant, tenant2)

        # Switch back to first tenant
        set_current_tenant(self.tenant)

        # TenantManager should only return tenant 1's items
        items = Item.objects.filter(sku='ISOLATED-001')
        self.assertEqual(items.count(), 1)
        self.assertEqual(items.first().name, 'Tenant 1 Item')
