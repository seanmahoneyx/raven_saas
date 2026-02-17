# apps/costing/tests/test_services.py
"""
Tests for CostingService: get_cost, get_cost_list, get_all_quantity_breaks,
calculate_line_total, get_best_vendor_cost.
"""
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Vendor
from apps.items.models import UnitOfMeasure, Item
from apps.costing.models import CostListHead, CostListLine
from apps.costing.services import CostingService
from shared.managers import set_current_tenant
from users.models import User


class CostingBaseTestCase(TestCase):
    """Base test case for costing service tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Cost Co', subdomain='test-costing')
        cls.user = User.objects.create_user(username='costuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='CV1', display_name='Cost Vendor',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party)

        cls.vend_party2 = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='CV2', display_name='Cheap Vendor',
        )
        cls.vendor2 = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party2)

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='CST-001', name='Costed Widget', base_uom=cls.uom,
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = CostingService(self.tenant)

    def _make_cost_list(self, vendor=None, begin_date=None, end_date=None, breaks=None):
        """Helper to create a cost list with quantity break lines."""
        if vendor is None:
            vendor = self.vendor
        if begin_date is None:
            begin_date = timezone.now().date() - timedelta(days=30)
        cl = CostListHead.objects.create(
            tenant=self.tenant, vendor=vendor, item=self.item,
            begin_date=begin_date, end_date=end_date, is_active=True,
        )
        if breaks is None:
            breaks = [(1, Decimal('5.0000')), (100, Decimal('4.5000')), (1000, Decimal('4.0000'))]
        for min_qty, cost in breaks:
            CostListLine.objects.create(
                cost_list=cl, min_quantity=min_qty, unit_cost=cost,
            )
        return cl


class GetCostTest(CostingBaseTestCase):
    """Tests for get_cost."""

    def test_base_cost(self):
        self._make_cost_list()
        cost = self.svc.get_cost(self.vendor, self.item, quantity=1)
        self.assertEqual(cost, Decimal('5.0000'))

    def test_quantity_break_100(self):
        self._make_cost_list()
        cost = self.svc.get_cost(self.vendor, self.item, quantity=100)
        self.assertEqual(cost, Decimal('4.5000'))

    def test_quantity_break_1000(self):
        self._make_cost_list()
        cost = self.svc.get_cost(self.vendor, self.item, quantity=1000)
        self.assertEqual(cost, Decimal('4.0000'))

    def test_quantity_between_breaks(self):
        self._make_cost_list()
        cost = self.svc.get_cost(self.vendor, self.item, quantity=500)
        self.assertEqual(cost, Decimal('4.5000'))

    def test_no_cost_list_returns_none(self):
        cost = self.svc.get_cost(self.vendor, self.item, quantity=1)
        self.assertIsNone(cost)

    def test_expired_cost_list_returns_none(self):
        self._make_cost_list(
            begin_date=timezone.now().date() - timedelta(days=60),
            end_date=timezone.now().date() - timedelta(days=1),
        )
        cost = self.svc.get_cost(self.vendor, self.item, quantity=1)
        self.assertIsNone(cost)

    def test_future_cost_list_returns_none(self):
        self._make_cost_list(
            begin_date=timezone.now().date() + timedelta(days=30),
        )
        cost = self.svc.get_cost(self.vendor, self.item, quantity=1)
        self.assertIsNone(cost)

    def test_open_ended_cost_list(self):
        self._make_cost_list(end_date=None)
        cost = self.svc.get_cost(self.vendor, self.item, quantity=1)
        self.assertEqual(cost, Decimal('5.0000'))


class GetCostListTest(CostingBaseTestCase):
    """Tests for get_cost_list."""

    def test_returns_active_cost_list(self):
        cl = self._make_cost_list()
        result = self.svc.get_cost_list(self.vendor, self.item)
        self.assertEqual(result.pk, cl.pk)

    def test_returns_none_when_no_list(self):
        result = self.svc.get_cost_list(self.vendor, self.item)
        self.assertIsNone(result)


class GetAllQuantityBreaksTest(CostingBaseTestCase):
    """Tests for get_all_quantity_breaks."""

    def test_returns_all_breaks(self):
        self._make_cost_list()
        breaks = self.svc.get_all_quantity_breaks(self.vendor, self.item)
        self.assertEqual(len(breaks), 3)
        self.assertEqual(breaks[0]['min_quantity'], 1)
        self.assertEqual(breaks[0]['unit_cost'], Decimal('5.0000'))

    def test_empty_when_no_list(self):
        breaks = self.svc.get_all_quantity_breaks(self.vendor, self.item)
        self.assertEqual(breaks, [])


class CalculateLineTotalTest(CostingBaseTestCase):
    """Tests for calculate_line_total."""

    def test_line_total_base(self):
        self._make_cost_list()
        total = self.svc.calculate_line_total(self.vendor, self.item, quantity=50)
        # 50 * 5.00 = 250.00
        self.assertEqual(total, Decimal('250.0000'))

    def test_line_total_with_break(self):
        self._make_cost_list()
        total = self.svc.calculate_line_total(self.vendor, self.item, quantity=100)
        # 100 * 4.50 = 450.00
        self.assertEqual(total, Decimal('450.0000'))

    def test_line_total_no_list_returns_none(self):
        total = self.svc.calculate_line_total(self.vendor, self.item, quantity=50)
        self.assertIsNone(total)


class GetBestVendorCostTest(CostingBaseTestCase):
    """Tests for get_best_vendor_cost."""

    def test_best_vendor_single(self):
        self._make_cost_list(vendor=self.vendor)
        result = self.svc.get_best_vendor_cost(self.item, quantity=1)
        self.assertIsNotNone(result)
        self.assertEqual(result['vendor'], self.vendor)
        self.assertEqual(result['unit_cost'], Decimal('5.0000'))

    def test_best_vendor_picks_cheapest(self):
        self._make_cost_list(
            vendor=self.vendor,
            breaks=[(1, Decimal('5.0000'))],
        )
        self._make_cost_list(
            vendor=self.vendor2,
            breaks=[(1, Decimal('3.0000'))],
        )
        result = self.svc.get_best_vendor_cost(self.item, quantity=1)
        self.assertEqual(result['vendor'], self.vendor2)
        self.assertEqual(result['unit_cost'], Decimal('3.0000'))

    def test_best_vendor_no_lists_returns_none(self):
        result = self.svc.get_best_vendor_cost(self.item, quantity=1)
        self.assertIsNone(result)

    def test_best_vendor_respects_quantity_breaks(self):
        self._make_cost_list(
            vendor=self.vendor,
            breaks=[(1, Decimal('10.0000')), (500, Decimal('3.0000'))],
        )
        self._make_cost_list(
            vendor=self.vendor2,
            breaks=[(1, Decimal('4.0000'))],
        )
        # At qty 1, vendor2 is cheaper (4 < 10)
        result1 = self.svc.get_best_vendor_cost(self.item, quantity=1)
        self.assertEqual(result1['vendor'], self.vendor2)
        # At qty 500, vendor1 is cheaper (3 < 4)
        result500 = self.svc.get_best_vendor_cost(self.item, quantity=500)
        self.assertEqual(result500['vendor'], self.vendor)
