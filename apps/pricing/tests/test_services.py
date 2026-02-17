# apps/pricing/tests/test_services.py
"""
Tests for PricingService: get_price, get_price_list, get_all_quantity_breaks, calculate_line_total.
"""
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer
from apps.items.models import UnitOfMeasure, Item
from apps.pricing.models import PriceListHead, PriceListLine
from apps.pricing.services import PricingService
from shared.managers import set_current_tenant
from users.models import User


class PricingBaseTestCase(TestCase):
    """Base test case for pricing service tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Price Co', subdomain='test-pricing')
        cls.user = User.objects.create_user(username='priceuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='PR1', display_name='Price Customer',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='PRC-001', name='Priced Widget', base_uom=cls.uom,
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = PricingService(self.tenant)

    def _make_price_list(self, begin_date=None, end_date=None, breaks=None):
        """Helper to create a price list with quantity break lines."""
        if begin_date is None:
            begin_date = timezone.now().date() - timedelta(days=30)
        pl = PriceListHead.objects.create(
            tenant=self.tenant, customer=self.customer, item=self.item,
            begin_date=begin_date, end_date=end_date, is_active=True,
        )
        if breaks is None:
            breaks = [(1, Decimal('10.0000')), (100, Decimal('9.0000')), (1000, Decimal('8.0000'))]
        for min_qty, price in breaks:
            PriceListLine.objects.create(
                price_list=pl, min_quantity=min_qty, unit_price=price,
            )
        return pl


class GetPriceTest(PricingBaseTestCase):
    """Tests for get_price."""

    def test_base_price(self):
        self._make_price_list()
        price = self.svc.get_price(self.customer, self.item, quantity=1)
        self.assertEqual(price, Decimal('10.0000'))

    def test_quantity_break_100(self):
        self._make_price_list()
        price = self.svc.get_price(self.customer, self.item, quantity=100)
        self.assertEqual(price, Decimal('9.0000'))

    def test_quantity_break_1000(self):
        self._make_price_list()
        price = self.svc.get_price(self.customer, self.item, quantity=1000)
        self.assertEqual(price, Decimal('8.0000'))

    def test_quantity_between_breaks(self):
        self._make_price_list()
        price = self.svc.get_price(self.customer, self.item, quantity=500)
        # 500 >= 100 but < 1000, so should use 100+ tier
        self.assertEqual(price, Decimal('9.0000'))

    def test_no_price_list_returns_none(self):
        price = self.svc.get_price(self.customer, self.item, quantity=1)
        self.assertIsNone(price)

    def test_expired_price_list_returns_none(self):
        self._make_price_list(
            begin_date=timezone.now().date() - timedelta(days=60),
            end_date=timezone.now().date() - timedelta(days=1),
        )
        price = self.svc.get_price(self.customer, self.item, quantity=1)
        self.assertIsNone(price)

    def test_future_price_list_returns_none(self):
        self._make_price_list(
            begin_date=timezone.now().date() + timedelta(days=30),
        )
        price = self.svc.get_price(self.customer, self.item, quantity=1)
        self.assertIsNone(price)

    def test_open_ended_price_list(self):
        self._make_price_list(end_date=None)
        price = self.svc.get_price(self.customer, self.item, quantity=1)
        self.assertEqual(price, Decimal('10.0000'))

    def test_specific_date(self):
        self._make_price_list(
            begin_date=timezone.now().date() - timedelta(days=10),
            end_date=timezone.now().date() + timedelta(days=10),
        )
        price = self.svc.get_price(
            self.customer, self.item, quantity=1,
            date=timezone.now().date(),
        )
        self.assertEqual(price, Decimal('10.0000'))


class GetPriceListTest(PricingBaseTestCase):
    """Tests for get_price_list."""

    def test_returns_active_price_list(self):
        pl = self._make_price_list()
        result = self.svc.get_price_list(self.customer, self.item)
        self.assertEqual(result.pk, pl.pk)

    def test_returns_none_when_no_list(self):
        result = self.svc.get_price_list(self.customer, self.item)
        self.assertIsNone(result)


class GetAllQuantityBreaksTest(PricingBaseTestCase):
    """Tests for get_all_quantity_breaks."""

    def test_returns_all_breaks(self):
        self._make_price_list()
        breaks = self.svc.get_all_quantity_breaks(self.customer, self.item)
        self.assertEqual(len(breaks), 3)
        self.assertEqual(breaks[0]['min_quantity'], 1)
        self.assertEqual(breaks[0]['unit_price'], Decimal('10.0000'))

    def test_empty_when_no_list(self):
        breaks = self.svc.get_all_quantity_breaks(self.customer, self.item)
        self.assertEqual(breaks, [])


class CalculateLineTotalTest(PricingBaseTestCase):
    """Tests for calculate_line_total."""

    def test_line_total_base(self):
        self._make_price_list()
        total = self.svc.calculate_line_total(self.customer, self.item, quantity=50)
        # 50 * 10.00 = 500.00
        self.assertEqual(total, Decimal('500.0000'))

    def test_line_total_with_break(self):
        self._make_price_list()
        total = self.svc.calculate_line_total(self.customer, self.item, quantity=100)
        # 100 * 9.00 = 900.00
        self.assertEqual(total, Decimal('900.0000'))

    def test_line_total_no_list_returns_none(self):
        total = self.svc.calculate_line_total(self.customer, self.item, quantity=50)
        self.assertIsNone(total)
