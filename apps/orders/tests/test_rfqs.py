from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import RFQ, RFQLine, PurchaseOrder, PurchaseOrderLine
from apps.orders.services import convert_rfq_to_po
from apps.warehousing.models import Warehouse
from shared.managers import set_current_tenant

User = get_user_model()


class RFQTestCase(TestCase):
    """Base test case for RFQ tests with common setup."""

    @classmethod
    def setUpTestData(cls):
        """Set up test data for all RFQ tests."""
        cls.tenant = Tenant.objects.create(
            name='Test Co',
            subdomain='test-rfqs',
            is_default=True
        )
        cls.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123'
        )
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='ea',
            name='Each',
            is_active=True
        )

        # Vendor party and location
        cls.vendor_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='VENDOR',
            code='VND001',
            display_name='Test Vendor',
            legal_name='Test Vendor Inc.',
            is_active=True
        )
        cls.location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party,
            name='Vendor Warehouse',
            location_type='shipping',
            is_default=True
        )
        cls.vendor = Vendor.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party
        )

        # Our company warehouse location
        cls.our_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='OUR001',
            display_name='Our Company',
            legal_name='Our Co',
            is_active=True
        )
        cls.warehouse_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.our_party,
            name='Main Warehouse',
            location_type='shipping',
            is_default=True
        )
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant,
            name='Main Warehouse',
            code='MAIN',
            location=cls.warehouse_location,
            is_default=True
        )

        # Items
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-001',
            name='Test Widget',
            division='corrugated',
            base_uom=cls.uom,
            is_active=True
        )
        cls.item2 = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-002',
            name='Test Gadget',
            division='corrugated',
            base_uom=cls.uom,
            is_active=True
        )

    def setUp(self):
        """Set up client and tenant for each test."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)


class RFQModelTests(RFQTestCase):
    """Tests for RFQ model."""

    def test_create_rfq(self):
        """Test creating an RFQ."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='draft',
            notes='Test RFQ'
        )
        self.assertEqual(rfq.rfq_number, 'RFQ-001')
        self.assertEqual(rfq.vendor, self.vendor)
        self.assertEqual(rfq.status, 'draft')
        self.assertEqual(rfq.notes, 'Test RFQ')

    def test_rfq_str(self):
        """Test RFQ string representation."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        self.assertEqual(str(rfq), 'RFQ-001')

    def test_is_editable_draft(self):
        """Test that draft RFQ is editable."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='draft'
        )
        self.assertTrue(rfq.is_editable)

    def test_is_editable_sent(self):
        """Test that sent RFQ is NOT editable."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent'
        )
        self.assertFalse(rfq.is_editable)

    def test_is_convertible_sent(self):
        """Test that sent RFQ is convertible."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent'
        )
        self.assertTrue(rfq.is_convertible)

    def test_is_convertible_received(self):
        """Test that received RFQ is convertible."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='received'
        )
        self.assertTrue(rfq.is_convertible)

    def test_is_convertible_draft(self):
        """Test that draft RFQ is NOT convertible."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='draft'
        )
        self.assertFalse(rfq.is_convertible)

    def test_has_all_quotes_true(self):
        """Test has_all_quotes returns True when all lines have quoted_price."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=Decimal('10.00')
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=20,
            item=self.item2,
            uom=self.uom,
            quantity=50,
            quoted_price=Decimal('15.00')
        )
        self.assertTrue(rfq.has_all_quotes)

    def test_has_all_quotes_false(self):
        """Test has_all_quotes returns False when some lines missing quoted_price."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=Decimal('10.00')
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=20,
            item=self.item2,
            uom=self.uom,
            quantity=50,
            quoted_price=None
        )
        self.assertFalse(rfq.has_all_quotes)

    def test_unique_together(self):
        """Test that tenant and rfq_number must be unique together."""
        RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        with self.assertRaises(Exception):
            RFQ.objects.create(
                tenant=self.tenant,
                rfq_number='RFQ-001',
                vendor=self.vendor,
                date='2026-02-02'
            )


class RFQLineModelTests(RFQTestCase):
    """Tests for RFQLine model."""

    def test_create_line(self):
        """Test creating an RFQLine."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        line = RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            target_price=Decimal('10.00')
        )
        self.assertEqual(line.line_number, 10)
        self.assertEqual(line.item, self.item)
        self.assertEqual(line.quantity, 100)
        self.assertEqual(line.target_price, Decimal('10.00'))

    def test_line_str(self):
        """Test RFQLine string representation."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        line = RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100
        )
        self.assertEqual(str(line), 'RFQ-001 Line 10: ITEM-001')

    def test_line_total_with_quoted_price(self):
        """Test line_total calculation with quoted_price."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        line = RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=Decimal('12.50')
        )
        self.assertEqual(line.line_total, Decimal('1250.00'))

    def test_line_total_with_target_price(self):
        """Test line_total calculation with target_price when no quoted_price."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        line = RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            target_price=Decimal('10.00'),
            quoted_price=None
        )
        self.assertEqual(line.line_total, Decimal('1000.00'))

    def test_line_total_no_price(self):
        """Test line_total returns 0 when no prices set."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        line = RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            target_price=None,
            quoted_price=None
        )
        self.assertEqual(line.line_total, Decimal('0.00'))

    def test_auto_description(self):
        """Test that blank description is auto-filled with item name."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        line = RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            description=''
        )
        line.save()
        line.refresh_from_db()
        self.assertEqual(line.description, 'Test Widget')


class ConvertRFQServiceTests(RFQTestCase):
    """Tests for convert_rfq_to_po service."""

    def test_convert_sent_rfq(self):
        """Test converting a sent RFQ to PO."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent',
            ship_to=self.location
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=Decimal('10.00')
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=20,
            item=self.item2,
            uom=self.uom,
            quantity=50,
            quoted_price=Decimal('15.00')
        )

        po = convert_rfq_to_po(rfq, self.tenant, self.user)

        self.assertIsNotNone(po)
        self.assertEqual(po.vendor, self.vendor)
        self.assertTrue(po.po_number.startswith('PO-'))
        self.assertEqual(po.status, 'draft')
        self.assertEqual(po.source_rfq, rfq)

        rfq.refresh_from_db()
        self.assertEqual(rfq.status, 'converted')

        po_lines = PurchaseOrderLine.objects.filter(purchase_order=po)
        self.assertEqual(po_lines.count(), 2)

        line1 = po_lines.get(line_number=10)
        self.assertEqual(line1.item, self.item)
        self.assertEqual(line1.quantity_ordered, 100)
        self.assertEqual(line1.unit_cost, Decimal('10.00'))

        line2 = po_lines.get(line_number=20)
        self.assertEqual(line2.item, self.item2)
        self.assertEqual(line2.quantity_ordered, 50)
        self.assertEqual(line2.unit_cost, Decimal('15.00'))

    def test_convert_received_rfq(self):
        """Test converting a received RFQ to PO."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-002',
            vendor=self.vendor,
            date='2026-02-01',
            status='received',
            ship_to=self.location
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=Decimal('10.00')
        )

        po = convert_rfq_to_po(rfq, self.tenant, self.user)

        self.assertIsNotNone(po)
        self.assertEqual(po.status, 'draft')
        rfq.refresh_from_db()
        self.assertEqual(rfq.status, 'converted')

    def test_convert_draft_raises(self):
        """Test that converting draft RFQ raises ValidationError."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-003',
            vendor=self.vendor,
            date='2026-02-01',
            status='draft'
        )

        with self.assertRaises(ValidationError) as context:
            convert_rfq_to_po(rfq, self.tenant, self.user)
        self.assertIn('Cannot convert RFQ with status', str(context.exception))

    def test_convert_converted_raises(self):
        """Test that converting already converted RFQ raises ValidationError."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-004',
            vendor=self.vendor,
            date='2026-02-01',
            status='converted'
        )

        with self.assertRaises(ValidationError) as context:
            convert_rfq_to_po(rfq, self.tenant, self.user)
        self.assertIn('Cannot convert RFQ with status', str(context.exception))

    def test_convert_no_quoted_lines_raises(self):
        """Test that RFQ with no quoted lines raises ValidationError."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-005',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent'
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=None
        )

        with self.assertRaises(ValidationError) as context:
            convert_rfq_to_po(rfq, self.tenant, self.user)
        self.assertIn('no lines have a quoted price', str(context.exception))

    def test_convert_partial_quotes(self):
        """Test that only lines with quoted_price are converted."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-006',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent',
            ship_to=self.location
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=Decimal('10.00')
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=20,
            item=self.item2,
            uom=self.uom,
            quantity=50,
            quoted_price=None
        )

        po = convert_rfq_to_po(rfq, self.tenant, self.user)

        po_lines = PurchaseOrderLine.objects.filter(purchase_order=po)
        self.assertEqual(po_lines.count(), 1)
        self.assertEqual(po_lines.first().item, self.item)

    def test_convert_no_ship_to_uses_warehouse(self):
        """Test that RFQ with no ship_to uses warehouse location."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-007',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent',
            ship_to=None
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=Decimal('10.00')
        )

        po = convert_rfq_to_po(rfq, self.tenant, self.user)

        self.assertEqual(po.ship_to, self.warehouse_location)


class RFQAPITests(RFQTestCase):
    """Tests for RFQ API endpoints."""

    def test_list_rfqs(self):
        """Test listing RFQs."""
        RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-002',
            vendor=self.vendor,
            date='2026-02-02'
        )

        response = self.client.get('/api/v1/rfqs/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 2)

    def test_create_rfq_api(self):
        """Test creating RFQ via API."""
        data = {
            'vendor': self.vendor.id,
            'date': '2026-02-01',
            'status': 'draft'
        }

        response = self.client.post('/api/v1/rfqs/', data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(response.data['rfq_number'])
        self.assertTrue(response.data['rfq_number'].startswith('RFQ-'))

    def test_create_rfq_then_add_lines(self):
        """Test creating RFQ then adding lines separately."""
        # Create RFQ
        data = {
            'vendor': self.vendor.id,
            'date': '2026-02-01',
            'status': 'draft',
        }
        response = self.client.post('/api/v1/rfqs/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        rfq_id = response.data['id']

        # Add line via add_line endpoint
        line_data = {
            'rfq': rfq_id,
            'line_number': 10,
            'item': self.item.id,
            'uom': self.uom.id,
            'quantity': 100,
            'target_price': '10.00'
        }
        response = self.client.post(f'/api/v1/rfqs/{rfq_id}/lines/', line_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify via API
        response = self.client.get(f'/api/v1/rfqs/{rfq_id}/lines/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_retrieve_rfq(self):
        """Test retrieving a single RFQ."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100
        )

        response = self.client.get(f'/api/v1/rfqs/{rfq.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['rfq_number'], 'RFQ-001')
        self.assertEqual(len(response.data['lines']), 1)

    def test_update_rfq(self):
        """Test updating RFQ."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            notes='Original notes'
        )

        response = self.client.patch(
            f'/api/v1/rfqs/{rfq.id}/',
            {'notes': 'Updated notes'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rfq.refresh_from_db()
        self.assertEqual(rfq.notes, 'Updated notes')

    def test_delete_rfq(self):
        """Test deleting RFQ."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )

        response = self.client.delete(f'/api/v1/rfqs/{rfq.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(RFQ.objects.filter(id=rfq.id).exists())

    def test_convert_rfq_api(self):
        """Test converting RFQ to PO via API."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent',
            ship_to=self.location
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=Decimal('10.00')
        )

        response = self.client.post(f'/api/v1/rfqs/{rfq.id}/convert/')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('po_number', response.data)
        self.assertTrue(response.data['po_number'].startswith('PO-'))
        rfq.refresh_from_db()
        self.assertEqual(rfq.status, 'converted')

    def test_convert_draft_fails(self):
        """Test that converting draft RFQ via API fails."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='draft'
        )

        response = self.client.post(f'/api/v1/rfqs/{rfq.id}/convert/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_convert_no_quotes_fails(self):
        """Test that converting RFQ with no quotes fails."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent'
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100,
            quoted_price=None
        )

        response = self.client.post(f'/api/v1/rfqs/{rfq.id}/convert/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_lines_action(self):
        """Test getting lines for an RFQ."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100
        )

        response = self.client.get(f'/api/v1/rfqs/{rfq.id}/lines/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_add_line_action(self):
        """Test adding a line to an RFQ."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='draft'
        )

        data = {
            'rfq': rfq.id,
            'line_number': 10,
            'item': self.item.id,
            'uom': self.uom.id,
            'quantity': 100,
            'target_price': '10.00'
        }

        response = self.client.post(
            f'/api/v1/rfqs/{rfq.id}/lines/',
            data,
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify via API
        lines_response = self.client.get(f'/api/v1/rfqs/{rfq.id}/lines/')
        self.assertEqual(len(lines_response.data), 1)

    def test_add_line_non_draft_fails(self):
        """Test that adding line to non-draft RFQ fails."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent'
        )

        data = {
            'rfq': rfq.id,
            'item': self.item.id,
            'uom': self.uom.id,
            'quantity': 100
        }

        response = self.client.post(
            f'/api/v1/rfqs/{rfq.id}/lines/',
            data,
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_record_quotes(self):
        """Test recording quotes on RFQ lines."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent'
        )
        line = RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            uom=self.uom,
            quantity=100
        )

        data = {
            'quotes': [
                {
                    'line_id': line.id,
                    'quoted_price': '12.50'
                }
            ]
        }

        response = self.client.post(
            f'/api/v1/rfqs/{rfq.id}/record-quotes/',
            data,
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['lines_updated'], 1)

        rfq.refresh_from_db()
        self.assertEqual(rfq.status, 'received')

        line.refresh_from_db()
        self.assertEqual(line.quoted_price, Decimal('12.50'))

    def test_record_quotes_empty_fails(self):
        """Test that recording empty quotes fails."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='sent'
        )

        data = {'quotes': []}

        response = self.client.post(
            f'/api/v1/rfqs/{rfq.id}/record-quotes/',
            data,
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_rfq(self):
        """Test cancelling an RFQ."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='draft'
        )

        response = self.client.post(f'/api/v1/rfqs/{rfq.id}/cancel/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rfq.refresh_from_db()
        self.assertEqual(rfq.status, 'cancelled')

    def test_cancel_converted_fails(self):
        """Test that cancelling converted RFQ fails."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='converted'
        )

        response = self.client.post(f'/api/v1/rfqs/{rfq.id}/cancel/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filter_by_status(self):
        """Test filtering RFQs by status."""
        RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01',
            status='draft'
        )
        RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-002',
            vendor=self.vendor,
            date='2026-02-02',
            status='sent'
        )

        response = self.client.get('/api/v1/rfqs/?status=draft')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'draft')

    def test_search_by_number(self):
        """Test searching RFQs by number."""
        RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-001',
            vendor=self.vendor,
            date='2026-02-01'
        )
        RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-002',
            vendor=self.vendor,
            date='2026-02-02'
        )

        response = self.client.get('/api/v1/rfqs/?search=RFQ-001')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['rfq_number'], 'RFQ-001')
