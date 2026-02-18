"""Tests for PricingService integration with order creation."""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer
from apps.items.models import UnitOfMeasure, Item
from apps.pricing.models import PriceListHead, PriceListLine
from apps.pricing.services import PricingService
from shared.managers import set_current_tenant
from users.models import User


class PricingServiceTest(TestCase):
    """Tests for PricingService.get_price()."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Price Co', subdomain='test-pricing-resolution')
        cls.user = User.objects.create_user(username='priceuser_res', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')
        cls.party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='PC1R', display_name='Price Customer',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.party)
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='PR-ITEM-RES', name='Priced Widget', base_uom=cls.uom,
        )

        # Create price list with quantity breaks
        cls.price_list = PriceListHead.objects.create(
            tenant=cls.tenant, customer=cls.customer, item=cls.item,
            begin_date=timezone.now().date(), is_active=True,
        )
        PriceListLine.objects.create(
            tenant=cls.tenant, price_list=cls.price_list,
            min_quantity=1, unit_price=Decimal('10.00'),
        )
        PriceListLine.objects.create(
            tenant=cls.tenant, price_list=cls.price_list,
            min_quantity=100, unit_price=Decimal('8.50'),
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_get_price_basic(self):
        svc = PricingService(self.tenant)
        price = svc.get_price(self.customer, self.item, quantity=10)
        self.assertEqual(price, Decimal('10.00'))

    def test_get_price_quantity_break(self):
        svc = PricingService(self.tenant)
        price = svc.get_price(self.customer, self.item, quantity=150)
        self.assertEqual(price, Decimal('8.50'))

    def test_get_price_no_list_returns_none(self):
        other_party = Party.objects.create(
            tenant=self.tenant, party_type='CUSTOMER', code='PC2R', display_name='No Price Customer',
        )
        other_customer = Customer.objects.create(tenant=self.tenant, party=other_party)
        svc = PricingService(self.tenant)
        price = svc.get_price(other_customer, self.item, quantity=10)
        self.assertIsNone(price)
