"""Tests for contract release validation."""
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import timedelta

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.contracts.models import Contract, ContractLine
from apps.contracts.services import ContractService
from shared.managers import set_current_tenant
from users.models import User


class ContractReleaseValidationTest(TestCase):
    """Tests for contract release over-release rejection and date validation."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Contract Co', subdomain='test-contracts-val')
        cls.user = User.objects.create_user(username='contractuser_val', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')
        cls.party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='CC1V', display_name='Contract Customer',
        )
        cls.location = Location.objects.create(
            tenant=cls.tenant, party=cls.party, location_type='SHIP_TO',
            name='Ship', address_line1='1 Main', city='Chicago', state='IL', postal_code='60601',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.party)
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='CON-ITEM-V', name='Contract Widget', base_uom=cls.uom,
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def _make_contract(self, status='active', start_date=None, end_date=None, blanket_qty=100):
        contract = Contract.objects.create(
            tenant=self.tenant, customer=self.customer,
            contract_number=f'CON-{Contract.objects.count()+1:04d}',
            status=status, ship_to=self.location,
            start_date=start_date or (timezone.now().date() - timedelta(days=30)),
            end_date=end_date or (timezone.now().date() + timedelta(days=30)),
        )
        line = ContractLine.objects.create(
            tenant=self.tenant, contract=contract,
            line_number=10, item=self.item, uom=self.uom,
            blanket_qty=blanket_qty, unit_price=Decimal('10.00'),
        )
        return contract, line

    def test_over_release_rejected(self):
        """Releasing more than remaining balance raises ValidationError."""
        contract, line = self._make_contract(blanket_qty=50)
        svc = ContractService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.create_release(line, quantity=51)

    def test_release_within_balance_succeeds(self):
        """Release within balance creates SO + release."""
        contract, line = self._make_contract(blanket_qty=100)
        svc = ContractService(self.tenant, self.user)
        result = svc.create_release(line, quantity=50)
        # Should return (SalesOrder, ContractRelease) tuple
        self.assertEqual(len(result), 2)

    def test_inactive_contract_rejected(self):
        """Non-active contract rejects release."""
        contract, line = self._make_contract(status='draft')
        svc = ContractService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.create_release(line, quantity=10)

    def test_expired_contract_rejected(self):
        """Expired contract rejects release."""
        contract, line = self._make_contract(
            end_date=timezone.now().date() - timedelta(days=1),
        )
        svc = ContractService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.create_release(line, quantity=10)

    def test_not_started_contract_rejected(self):
        """Contract that has not started yet rejects release."""
        contract, line = self._make_contract(
            start_date=timezone.now().date() + timedelta(days=1),
        )
        svc = ContractService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.create_release(line, quantity=10)

    def test_validate_release_returns_valid(self):
        contract, line = self._make_contract(blanket_qty=100)
        svc = ContractService(self.tenant, self.user)
        result = svc.validate_release(line, quantity=50)
        self.assertTrue(result['valid'])

    def test_validate_release_returns_invalid_for_over_quantity(self):
        contract, line = self._make_contract(blanket_qty=50)
        svc = ContractService(self.tenant, self.user)
        result = svc.validate_release(line, quantity=51)
        self.assertFalse(result['valid'])
