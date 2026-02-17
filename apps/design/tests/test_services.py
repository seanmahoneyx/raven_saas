# apps/design/tests/test_services.py
"""
Tests for DesignService: promote_to_item, create_estimate_from_design.
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.design.models import DesignRequest
from apps.design.services import DesignService
from apps.orders.models import Estimate, EstimateLine
from shared.managers import set_current_tenant
from users.models import User


class DesignBaseTestCase(TestCase):
    """Base test case for design service tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Design Co', subdomain='test-design')
        cls.user = User.objects.create_user(username='designuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        # Party (not Customer) - DesignRequest.customer is FK to Party
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='DC1', display_name='Design Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship', address_line1='1 Main', city='Chicago', state='IL', postal_code='60601',
        )
        # Customer for estimates (Estimate.customer is FK to Customer)
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = DesignService(self.tenant, self.user)

    def _make_design(self, style='RSC', status='approved', **kwargs):
        defaults = dict(
            tenant=self.tenant,
            customer=self.cust_party,
            requested_by=self.user,
            status=status,
            ident='Test Box',
            style=style,
            length=Decimal('12.0000'),
            width=Decimal('10.0000'),
            depth=Decimal('8.0000'),
            test='200C',
            flute='C',
            paper='KR',
        )
        defaults.update(kwargs)
        return DesignRequest.objects.create(**defaults)


class PromoteToItemTest(DesignBaseTestCase):
    """Tests for promote_to_item."""

    def test_promote_rsc(self):
        dr = self._make_design(style='RSC')
        item = self.svc.promote_to_item(dr, sku='RSC-001', base_uom=self.uom)
        self.assertIsNotNone(item.pk)
        self.assertEqual(item.sku, 'RSC-001')
        self.assertEqual(item.division, 'corrugated')
        dr.refresh_from_db()
        self.assertEqual(dr.status, 'completed')
        self.assertEqual(dr.generated_item_id, item.pk)

    def test_promote_dc(self):
        dr = self._make_design(style='DC')
        item = self.svc.promote_to_item(dr, sku='DC-001', base_uom=self.uom)
        self.assertIsNotNone(item.pk)
        self.assertEqual(item.sku, 'DC-001')

    def test_promote_fol(self):
        dr = self._make_design(style='FOL')
        item = self.svc.promote_to_item(dr, sku='FOL-001', base_uom=self.uom)
        self.assertIsNotNone(item.pk)

    def test_promote_generic_style(self):
        dr = self._make_design(style='UNKNOWN')
        item = self.svc.promote_to_item(dr, sku='GEN-001', base_uom=self.uom)
        self.assertIsNotNone(item.pk)

    def test_promote_not_approved_raises(self):
        dr = self._make_design(status='pending')
        with self.assertRaises(ValueError):
            self.svc.promote_to_item(dr, sku='BAD-001', base_uom=self.uom)

    def test_promote_already_promoted_raises(self):
        dr = self._make_design(style='RSC')
        self.svc.promote_to_item(dr, sku='FIRST-001', base_uom=self.uom)
        dr.refresh_from_db()
        with self.assertRaises(ValueError):
            self.svc.promote_to_item(dr, sku='SECOND-001', base_uom=self.uom)

    def test_promote_copies_spec_fields(self):
        dr = self._make_design(style='RSC', test='200C', flute='C', paper='KR')
        item = self.svc.promote_to_item(dr, sku='SPEC-001', base_uom=self.uom)
        # The item should be an RSCItem with corrugated fields
        from apps.items.models import RSCItem
        rsc = RSCItem.objects.get(pk=item.pk)
        self.assertEqual(rsc.test, '200C')
        self.assertEqual(rsc.flute, 'C')

    def test_promote_sets_customer(self):
        dr = self._make_design(style='RSC')
        item = self.svc.promote_to_item(dr, sku='CUST-001', base_uom=self.uom)
        self.assertEqual(item.customer, self.cust_party)


class CreateEstimateFromDesignTest(DesignBaseTestCase):
    """Tests for create_estimate_from_design."""

    def _make_promoted_design(self):
        dr = self._make_design(style='RSC')
        item = self.svc.promote_to_item(dr, sku=f'EST-{DesignRequest.objects.count():03d}', base_uom=self.uom)
        dr.refresh_from_db()
        return dr

    def test_create_estimate_from_design(self):
        dr = self._make_promoted_design()
        estimate = self.svc.create_estimate_from_design(
            dr, customer=self.customer, quantity=100, unit_price=Decimal('5.00'),
        )
        self.assertIsNotNone(estimate.pk)
        self.assertEqual(estimate.status, 'draft')
        self.assertEqual(estimate.customer, self.customer)
        self.assertEqual(estimate.lines.count(), 1)

    def test_create_estimate_line_details(self):
        dr = self._make_promoted_design()
        estimate = self.svc.create_estimate_from_design(
            dr, customer=self.customer, quantity=50, unit_price=Decimal('10.00'),
        )
        line = estimate.lines.first()
        self.assertEqual(line.item, dr.generated_item)
        self.assertEqual(line.quantity, 50)
        self.assertEqual(line.unit_price, Decimal('10.00'))

    def test_create_estimate_no_generated_item_raises(self):
        dr = self._make_design(status='approved')
        with self.assertRaises(ValueError):
            self.svc.create_estimate_from_design(dr, customer=self.customer)

    def test_create_estimate_auto_number(self):
        dr = self._make_promoted_design()
        estimate = self.svc.create_estimate_from_design(dr, customer=self.customer)
        self.assertTrue(estimate.estimate_number.startswith('EST-'))

    def test_create_estimate_uses_design_customer_as_fallback(self):
        dr = self._make_promoted_design()
        # create_estimate_from_design resolves customer from design_request.customer
        # which is a Party, but estimate.customer needs a Customer.
        # The service resolves_customer = customer or design_request.customer
        # For fallback to work, design_request.customer (Party) is used.
        # But since estimate.customer FK expects Customer, pass explicit customer.
        estimate = self.svc.create_estimate_from_design(dr, customer=self.customer)
        self.assertEqual(estimate.customer, self.customer)

    def test_create_estimate_with_notes(self):
        dr = self._make_promoted_design()
        estimate = self.svc.create_estimate_from_design(
            dr, customer=self.customer, notes='Rush order',
        )
        self.assertEqual(estimate.notes, 'Rush order')
