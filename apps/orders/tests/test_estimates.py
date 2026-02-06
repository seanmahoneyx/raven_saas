from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone
from datetime import timedelta

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import Estimate, EstimateLine, SalesOrder, SalesOrderLine
from apps.orders.services import convert_estimate_to_order
from shared.managers import set_current_tenant

User = get_user_model()


class EstimateTestCase(TestCase):
    """Base test case with common setup for all estimate tests."""

    @classmethod
    def setUpTestData(cls):
        """Set up test data that is shared across all tests."""
        cls.tenant = Tenant.objects.create(
            name='Test Co',
            subdomain='test-estimates',
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

        cls.customer_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='CUST001',
            display_name='Test Customer',
            legal_name='Test Customer Inc.',
            is_active=True
        )

        cls.location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            name='Main Office',
            location_type='billing',
            is_default=True
        )

        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party
        )

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
        """Set up tenant context for each test."""
        set_current_tenant(self.tenant)


class EstimateModelTests(EstimateTestCase):
    """Test cases for Estimate model functionality."""

    def test_create_estimate(self):
        """Test creating an estimate with all required fields."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='001',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft',
            ship_to=self.location
        )
        self.assertIsNotNone(estimate.id)
        self.assertEqual(estimate.estimate_number, '001')
        self.assertEqual(estimate.customer, self.customer)
        self.assertEqual(estimate.status, 'draft')
        self.assertEqual(estimate.ship_to, self.location)

    def test_estimate_str(self):
        """Test string representation of estimate."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='001',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft'
        )
        self.assertEqual(str(estimate), 'EST-001')

    def test_is_editable_draft(self):
        """Test that draft estimates are editable."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='002',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft'
        )
        self.assertTrue(estimate.is_editable)

    def test_is_editable_sent(self):
        """Test that sent estimates are not editable."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='003',
            customer=self.customer,
            date=timezone.now().date(),
            status='sent'
        )
        self.assertFalse(estimate.is_editable)

    def test_is_convertible_sent(self):
        """Test that sent estimates are convertible to orders."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='004',
            customer=self.customer,
            date=timezone.now().date(),
            status='sent',
            ship_to=self.location
        )
        self.assertTrue(estimate.is_convertible)

    def test_is_convertible_accepted(self):
        """Test that accepted estimates are convertible to orders."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='005',
            customer=self.customer,
            date=timezone.now().date(),
            status='accepted',
            ship_to=self.location
        )
        self.assertTrue(estimate.is_convertible)

    def test_is_convertible_draft(self):
        """Test that draft estimates are not convertible to orders."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='006',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft'
        )
        self.assertFalse(estimate.is_convertible)

    def test_is_expired(self):
        """Test that estimates with past expiration date are expired."""
        past_date = timezone.now().date() - timedelta(days=10)
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='007',
            customer=self.customer,
            date=timezone.now().date(),
            expiration_date=past_date,
            status='sent'
        )
        self.assertTrue(estimate.is_expired)

    def test_is_not_expired_no_date(self):
        """Test that estimates without expiration date are not expired."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='008',
            customer=self.customer,
            date=timezone.now().date(),
            status='sent'
        )
        self.assertFalse(estimate.is_expired)

    def test_calculate_totals(self):
        """Test calculation of estimate totals from lines."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='009',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft',
            tax_rate=Decimal('0.08')
        )

        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            description=self.item.name,
            quantity=100,
            uom=self.uom,
            unit_price=Decimal('10.50')
        )

        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=20,
            item=self.item2,
            description=self.item2.name,
            quantity=50,
            uom=self.uom,
            unit_price=Decimal('20.00')
        )

        estimate.calculate_totals()
        estimate.save()
        estimate.refresh_from_db()

        expected_subtotal = Decimal('1050.00') + Decimal('1000.00')
        expected_tax = expected_subtotal * Decimal('0.08')
        expected_total = expected_subtotal + expected_tax

        self.assertEqual(estimate.subtotal, expected_subtotal)
        self.assertEqual(estimate.tax_amount, expected_tax)
        self.assertEqual(estimate.total_amount, expected_total)

    def test_unique_together(self):
        """Test that tenant+estimate_number must be unique."""
        Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='DUP',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft'
        )

        with self.assertRaises(IntegrityError):
            Estimate.objects.create(
                tenant=self.tenant,
                estimate_number='DUP',
                customer=self.customer,
                date=timezone.now().date(),
                status='draft'
            )


class EstimateLineModelTests(EstimateTestCase):
    """Test cases for EstimateLine model functionality."""

    def test_create_line(self):
        """Test creating an estimate line with auto-calculated amount."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='LINE-001',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft'
        )

        line = EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            description=self.item.name,
            quantity=100,
            uom=self.uom,
            unit_price=Decimal('10.50')
        )

        self.assertIsNotNone(line.id)
        self.assertEqual(line.quantity, 100)
        self.assertEqual(line.unit_price, Decimal('10.50'))
        self.assertEqual(line.amount, Decimal('1050.00'))

    def test_line_str(self):
        """Test string representation of estimate line."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='LINE-002',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft'
        )

        line = EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            description=self.item.name,
            quantity=100,
            uom=self.uom,
            unit_price=Decimal('10.50')
        )

        self.assertEqual(str(line), 'LINE-002 Line 10: ITEM-001')

    def test_auto_description(self):
        """Test that blank description is auto-filled with item name."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='LINE-003',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft'
        )

        line = EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            description='',
            quantity=100,
            uom=self.uom,
            unit_price=Decimal('10.50')
        )

        line.refresh_from_db()
        self.assertEqual(line.description, self.item.name)

    def test_amount_auto_calculation(self):
        """Test that amount is automatically calculated on save."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='LINE-004',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft'
        )

        line = EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            description=self.item.name,
            quantity=75,
            uom=self.uom,
            unit_price=Decimal('12.25')
        )

        expected_amount = Decimal('75') * Decimal('12.25')
        self.assertEqual(line.amount, expected_amount)


class ConvertEstimateServiceTests(EstimateTestCase):
    """Test cases for estimate conversion service."""

    def test_convert_sent_estimate(self):
        """Test converting a sent estimate to sales order."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='CONV-001',
            customer=self.customer,
            date=timezone.now().date(),
            status='sent',
            ship_to=self.location
        )

        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            description=self.item.name,
            quantity=100,
            uom=self.uom,
            unit_price=Decimal('10.50')
        )

        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=20,
            item=self.item2,
            description=self.item2.name,
            quantity=50,
            uom=self.uom,
            unit_price=Decimal('20.00')
        )

        sales_order = convert_estimate_to_order(estimate, self.tenant, self.user)

        self.assertIsNotNone(sales_order)
        self.assertEqual(sales_order.customer, self.customer)
        self.assertTrue(sales_order.order_number.startswith('SO-'))
        self.assertEqual(sales_order.status, 'draft')
        self.assertEqual(sales_order.source_estimate, estimate)

        estimate.refresh_from_db()
        self.assertEqual(estimate.status, 'converted')

        lines = SalesOrderLine.objects.filter(sales_order=sales_order)
        self.assertEqual(lines.count(), 2)

        line1 = lines.get(line_number=10)
        self.assertEqual(line1.quantity_ordered, 100)
        self.assertEqual(line1.unit_price, Decimal('10.50'))

        line2 = lines.get(line_number=20)
        self.assertEqual(line2.quantity_ordered, 50)
        self.assertEqual(line2.unit_price, Decimal('20.00'))

    def test_convert_accepted_estimate(self):
        """Test converting an accepted estimate to sales order."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='CONV-002',
            customer=self.customer,
            date=timezone.now().date(),
            status='accepted',
            ship_to=self.location
        )

        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            description=self.item.name,
            quantity=100,
            uom=self.uom,
            unit_price=Decimal('10.50')
        )

        sales_order = convert_estimate_to_order(estimate, self.tenant, self.user)

        self.assertIsNotNone(sales_order)
        self.assertEqual(sales_order.status, 'draft')

        estimate.refresh_from_db()
        self.assertEqual(estimate.status, 'converted')

    def test_convert_draft_raises(self):
        """Test that converting draft estimate raises ValidationError."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='CONV-003',
            customer=self.customer,
            date=timezone.now().date(),
            status='draft',
            ship_to=self.location
        )

        with self.assertRaises(ValidationError) as cm:
            convert_estimate_to_order(estimate, self.tenant, self.user)

        self.assertIn('sent', str(cm.exception).lower())

    def test_convert_converted_raises(self):
        """Test that converting already converted estimate raises ValidationError."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='CONV-004',
            customer=self.customer,
            date=timezone.now().date(),
            status='converted',
            ship_to=self.location
        )

        with self.assertRaises(ValidationError) as cm:
            convert_estimate_to_order(estimate, self.tenant, self.user)

        self.assertIn('sent', str(cm.exception).lower())

    def test_convert_no_ship_to_uses_customer_location(self):
        """Test conversion without ship_to uses customer's default location."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='CONV-005',
            customer=self.customer,
            date=timezone.now().date(),
            status='sent'
        )

        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            description=self.item.name,
            quantity=100,
            uom=self.uom,
            unit_price=Decimal('10.50')
        )

        sales_order = convert_estimate_to_order(estimate, self.tenant, self.user)

        self.assertIsNotNone(sales_order)
        self.assertEqual(sales_order.ship_to, self.location)

    def test_convert_no_ship_to_no_location_raises(self):
        """Test conversion fails when no ship_to and customer has no locations."""
        customer_party_no_loc = Party.objects.create(
            tenant=self.tenant,
            party_type='CUSTOMER',
            code='CUST002',
            display_name='Customer No Location',
            legal_name='Customer No Location Inc.',
            is_active=True
        )

        customer_no_loc = Customer.objects.create(
            tenant=self.tenant,
            party=customer_party_no_loc
        )

        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='CONV-006',
            customer=customer_no_loc,
            date=timezone.now().date(),
            status='sent'
        )

        with self.assertRaises(ValidationError) as cm:
            convert_estimate_to_order(estimate, self.tenant, self.user)

        self.assertIn('location', str(cm.exception).lower())
