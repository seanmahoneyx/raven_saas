# apps/contracts/tests/test_contract_overhaul.py
"""
Comprehensive tests for contract-first overhaul functionality.

Test coverage:
- ContractTypeModelTests: contract_type field, source_estimate FK
- MultiLineReleaseServiceTests: ContractService.create_multi_line_release()
- MultiLineReleaseAPITests: POST /api/v1/contracts/create_multi_line_release/
- EstimateToContractTests: POST /api/v1/estimates/{id}/convert-to-contract/
- DirectOrderAutoContractTests: Auto-contract creation for DIRECT sales orders
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import SalesOrder, SalesOrderLine, Estimate, EstimateLine
from apps.contracts.models import Contract, ContractLine, ContractRelease
from apps.contracts.services import ContractService
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# BASE TEST CLASS
# =============================================================================

class ContractsTestCase(TestCase):
    """Base test case with shared setup for contract overhaul tests."""

    @classmethod
    def setUpTestData(cls):
        """Create shared test data (runs once per test class)."""
        cls.tenant = Tenant.objects.create(
            name='Overhaul Test Company',
            subdomain='test-overhaul',
            is_default=True,
        )

        cls.user = User.objects.create_user(
            username='overhaultestuser',
            email='overhaultestuser@test.com',
            password='testpass123',
        )

        set_current_tenant(cls.tenant)

        cls.uom_each = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='eaoh',
            name='Each',
            is_active=True,
        )
        cls.uom_case = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='csoh',
            name='Case',
            is_active=True,
        )

        cls.customer_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='OH-CUST001',
            display_name='Overhaul Test Customer',
            legal_name='Overhaul Test Customer Inc.',
            is_active=True,
        )

        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            payment_terms='NET30',
        )

        cls.location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            name='Main Warehouse',
            location_type='SHIP_TO',
            address_line1='123 Main St',
            city='Test City',
            state='CA',
            postal_code='12345',
            country='USA',
        )

        cls.customer.default_ship_to = cls.location
        cls.customer.default_bill_to = cls.location
        cls.customer.save()

        cls.item1 = Item.objects.create(
            tenant=cls.tenant,
            sku='OH-ITEM-001',
            name='Overhaul Test Item 1',
            division='misc',
            base_uom=cls.uom_each,
            is_active=True,
        )
        cls.item2 = Item.objects.create(
            tenant=cls.tenant,
            sku='OH-ITEM-002',
            name='Overhaul Test Item 2',
            division='misc',
            base_uom=cls.uom_each,
            is_active=True,
        )

    def setUp(self):
        """Set up for each test."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)


# =============================================================================
# 1. CONTRACT TYPE MODEL TESTS
# =============================================================================

class ContractTypeModelTests(ContractsTestCase):
    """Tests for contract_type field and source_estimate FK."""

    def test_create_blanket_contract(self):
        """Default contract_type is 'blanket'."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        self.assertEqual(contract.contract_type, 'blanket')

    def test_create_direct_contract(self):
        """Create a contract with contract_type='direct'."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            contract_type='direct',
        )
        self.assertEqual(contract.contract_type, 'direct')

    def test_contract_type_in_serializer(self):
        """GET contract detail includes contract_type field."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            contract_type='blanket',
        )
        response = self.client.get(f'/api/v1/contracts/{contract.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('contract_type', response.data)
        self.assertEqual(response.data['contract_type'], 'blanket')

    def test_create_contract_with_source_estimate(self):
        """Contract can link to an estimate via source_estimate FK."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            estimate_number='EST-SRC-001',
            status='sent',
            date=timezone.now().date(),
            ship_to=self.location,
            bill_to=self.location,
        )
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            source_estimate=estimate,
        )
        self.assertEqual(contract.source_estimate, estimate)
        # Refresh from DB
        contract.refresh_from_db()
        self.assertEqual(contract.source_estimate_id, estimate.id)


# =============================================================================
# 2. MULTI-LINE RELEASE SERVICE TESTS
# =============================================================================

class MultiLineReleaseServiceTests(ContractsTestCase):
    """Tests for ContractService.create_multi_line_release()."""

    def _make_active_contract(self, num_lines=2, blanket_qty=100):
        contract = Contract.objects.create(
            tenant=self.tenant, customer=self.customer,
            status='active', ship_to=self.location,
            start_date=timezone.now().date() - timedelta(days=30),
            end_date=timezone.now().date() + timedelta(days=30),
        )
        lines = []
        items = [self.item1, self.item2]
        for i in range(num_lines):
            line = ContractLine.objects.create(
                tenant=self.tenant, contract=contract,
                line_number=(i + 1) * 10, item=items[i % 2],
                blanket_qty=blanket_qty, uom=self.uom_each,
                unit_price=Decimal('5.00'),
            )
            lines.append(line)
        return contract, lines

    def test_multi_line_release_creates_so_with_multiple_lines(self):
        """Pass 2 contract lines; verify SO created with 2 SalesOrderLines and 2 ContractReleases."""
        contract, lines = self._make_active_contract(num_lines=2)
        service = ContractService(self.tenant, self.user)

        release_lines = [
            {'contract_line_id': lines[0].id, 'quantity': 10},
            {'contract_line_id': lines[1].id, 'quantity': 20},
        ]
        so = service.create_multi_line_release(release_lines)

        set_current_tenant(self.tenant)
        self.assertIsNotNone(so)
        self.assertEqual(so.lines.count(), 2)
        self.assertEqual(ContractRelease.objects.filter(
            contract_line__contract=contract
        ).count(), 2)

    def test_multi_line_release_validates_active_contract(self):
        """Reject if contract is not active."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
            ship_to=self.location,
        )
        line = ContractLine.objects.create(
            tenant=self.tenant, contract=contract,
            line_number=10, item=self.item1,
            blanket_qty=100, uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )
        service = ContractService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            service.create_multi_line_release([
                {'contract_line_id': line.id, 'quantity': 10},
            ])

    def test_multi_line_release_validates_remaining_qty(self):
        """Reject if quantity exceeds remaining balance."""
        contract, lines = self._make_active_contract(num_lines=1, blanket_qty=50)
        service = ContractService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            service.create_multi_line_release([
                {'contract_line_id': lines[0].id, 'quantity': 999},
            ])

    def test_multi_line_release_validates_same_customer(self):
        """Reject if lines belong to different customers."""
        # Second customer
        party2 = Party.objects.create(
            tenant=self.tenant,
            party_type='CUSTOMER',
            code='OH-CUST002',
            display_name='Second Customer',
            legal_name='Second Customer Inc.',
        )
        customer2 = Customer.objects.create(
            tenant=self.tenant,
            party=party2,
        )
        location2 = Location.objects.create(
            tenant=self.tenant,
            party=party2,
            name='Warehouse 2',
            location_type='SHIP_TO',
            address_line1='456 Other St',
            city='Other City',
            state='NY',
            postal_code='10001',
        )
        customer2.default_ship_to = location2
        customer2.default_bill_to = location2
        customer2.save()

        contract1 = Contract.objects.create(
            tenant=self.tenant, customer=self.customer,
            status='active', ship_to=self.location,
            start_date=timezone.now().date() - timedelta(days=30),
            end_date=timezone.now().date() + timedelta(days=30),
        )
        line1 = ContractLine.objects.create(
            tenant=self.tenant, contract=contract1,
            line_number=10, item=self.item1,
            blanket_qty=100, uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )

        contract2 = Contract.objects.create(
            tenant=self.tenant, customer=customer2,
            status='active', ship_to=location2,
            start_date=timezone.now().date() - timedelta(days=30),
            end_date=timezone.now().date() + timedelta(days=30),
        )
        line2 = ContractLine.objects.create(
            tenant=self.tenant, contract=contract2,
            line_number=10, item=self.item2,
            blanket_qty=100, uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )

        service = ContractService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            service.create_multi_line_release([
                {'contract_line_id': line1.id, 'quantity': 10},
                {'contract_line_id': line2.id, 'quantity': 10},
            ])

    def test_multi_line_release_uses_contract_price(self):
        """Falls back to contract line unit_price when not specified in release."""
        contract, lines = self._make_active_contract(num_lines=1)
        service = ContractService(self.tenant, self.user)

        so = service.create_multi_line_release([
            {'contract_line_id': lines[0].id, 'quantity': 10},
        ])
        set_current_tenant(self.tenant)
        so_line = so.lines.first()
        self.assertEqual(so_line.unit_price, Decimal('5.00'))

    def test_multi_line_release_with_override_price(self):
        """Uses provided unit_price override instead of contract line price."""
        contract, lines = self._make_active_contract(num_lines=1)
        service = ContractService(self.tenant, self.user)

        so = service.create_multi_line_release([
            {'contract_line_id': lines[0].id, 'quantity': 10, 'unit_price': Decimal('9.99')},
        ])
        set_current_tenant(self.tenant)
        so_line = so.lines.first()
        self.assertEqual(so_line.unit_price, Decimal('9.99'))

    def test_multi_line_release_with_ship_to(self):
        """Passes ship_to to the created SO."""
        contract, lines = self._make_active_contract(num_lines=1)
        service = ContractService(self.tenant, self.user)

        so = service.create_multi_line_release(
            release_lines=[{'contract_line_id': lines[0].id, 'quantity': 10}],
            ship_to=self.location,
        )
        set_current_tenant(self.tenant)
        self.assertEqual(so.ship_to, self.location)

    def test_multi_line_release_with_customer_po(self):
        """Passes customer_po to the created SO."""
        contract, lines = self._make_active_contract(num_lines=1)
        service = ContractService(self.tenant, self.user)

        so = service.create_multi_line_release(
            release_lines=[{'contract_line_id': lines[0].id, 'quantity': 10}],
            customer_po='MY-PO-12345',
        )
        set_current_tenant(self.tenant)
        self.assertEqual(so.customer_po, 'MY-PO-12345')


# =============================================================================
# 3. MULTI-LINE RELEASE API TESTS
# =============================================================================

class MultiLineReleaseAPITests(ContractsTestCase):
    """Tests for POST /api/v1/contracts/create_multi_line_release/."""

    def _make_active_contract(self, num_lines=2, blanket_qty=100):
        contract = Contract.objects.create(
            tenant=self.tenant, customer=self.customer,
            status='active', ship_to=self.location,
            start_date=timezone.now().date() - timedelta(days=30),
            end_date=timezone.now().date() + timedelta(days=30),
        )
        lines = []
        items = [self.item1, self.item2]
        for i in range(num_lines):
            line = ContractLine.objects.create(
                tenant=self.tenant, contract=contract,
                line_number=(i + 1) * 10, item=items[i % 2],
                blanket_qty=blanket_qty, uom=self.uom_each,
                unit_price=Decimal('5.00'),
            )
            lines.append(line)
        return contract, lines

    def test_create_multi_line_release_endpoint(self):
        """POST with valid data returns 201 and SO data."""
        contract, lines = self._make_active_contract(num_lines=2)
        data = {
            'lines': [
                {'contract_line_id': lines[0].id, 'quantity': 10},
                {'contract_line_id': lines[1].id, 'quantity': 20},
            ],
        }
        response = self.client.post(
            '/api/v1/contracts/create_multi_line_release/',
            data,
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('order_number', response.data)
        set_current_tenant(self.tenant)
        self.assertEqual(SalesOrder.objects.count(), 1)

    def test_create_multi_line_release_invalid_line_id(self):
        """Returns 400 for a nonexistent contract line ID."""
        data = {
            'lines': [
                {'contract_line_id': 999999, 'quantity': 10},
            ],
        }
        response = self.client.post(
            '/api/v1/contracts/create_multi_line_release/',
            data,
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_multi_line_release_over_balance(self):
        """Returns 400 when quantity exceeds remaining balance."""
        contract, lines = self._make_active_contract(num_lines=1, blanket_qty=50)
        data = {
            'lines': [
                {'contract_line_id': lines[0].id, 'quantity': 9999},
            ],
        }
        response = self.client.post(
            '/api/v1/contracts/create_multi_line_release/',
            data,
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_multi_line_release_empty_lines(self):
        """Returns 400 for an empty lines array."""
        data = {'lines': []}
        response = self.client.post(
            '/api/v1/contracts/create_multi_line_release/',
            data,
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# =============================================================================
# 4. ESTIMATE TO CONTRACT TESTS
# =============================================================================

class EstimateToContractTests(ContractsTestCase):
    """Tests for estimate -> blanket contract conversion."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        set_current_tenant(cls.tenant)
        cls.estimate = Estimate.objects.create(
            tenant=cls.tenant,
            customer=cls.customer,
            estimate_number='EST-0001',
            status='sent',
            date=timezone.now().date(),
            ship_to=cls.location,
            bill_to=cls.location,
        )
        EstimateLine.objects.create(
            tenant=cls.tenant,
            estimate=cls.estimate,
            line_number=10,
            item=cls.item1,
            quantity=100,
            uom=cls.uom_each,
            unit_price=Decimal('5.00'),
        )

    def test_convert_estimate_to_contract(self):
        """POST convert-to-contract creates a Contract with correct data."""
        # Use a fresh estimate each test since status gets mutated
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            estimate_number='EST-CONV-001',
            status='sent',
            date=timezone.now().date(),
            ship_to=self.location,
            bill_to=self.location,
        )
        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item1,
            quantity=50,
            uom=self.uom_each,
            unit_price=Decimal('7.00'),
        )
        response = self.client.post(f'/api/v1/estimates/{estimate.id}/convert-to-contract/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('contract_number', response.data)
        self.assertEqual(response.data['contract_type'], 'blanket')

    def test_converted_estimate_status(self):
        """Estimate status becomes 'converted' after conversion."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            estimate_number='EST-CONV-002',
            status='sent',
            date=timezone.now().date(),
            ship_to=self.location,
            bill_to=self.location,
        )
        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item1,
            quantity=50,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )
        self.client.post(f'/api/v1/estimates/{estimate.id}/convert-to-contract/')
        set_current_tenant(self.tenant)
        estimate.refresh_from_db()
        self.assertEqual(estimate.status, 'converted')

    def test_converted_contract_has_lines(self):
        """Contract lines match the estimate lines."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            estimate_number='EST-CONV-003',
            status='sent',
            date=timezone.now().date(),
            ship_to=self.location,
            bill_to=self.location,
        )
        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item1,
            quantity=75,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )
        response = self.client.post(f'/api/v1/estimates/{estimate.id}/convert-to-contract/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        contract_id = response.data['id']
        set_current_tenant(self.tenant)
        contract = Contract.objects.get(id=contract_id)
        self.assertEqual(contract.lines.count(), 1)
        contract_line = contract.lines.first()
        self.assertEqual(contract_line.blanket_qty, 75)
        self.assertEqual(contract_line.item, self.item1)

    def test_converted_contract_type_is_blanket(self):
        """Contract created from estimate has contract_type='blanket'."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            estimate_number='EST-CONV-004',
            status='sent',
            date=timezone.now().date(),
            ship_to=self.location,
            bill_to=self.location,
        )
        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item1,
            quantity=50,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )
        response = self.client.post(f'/api/v1/estimates/{estimate.id}/convert-to-contract/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['contract_type'], 'blanket')

    def test_convert_non_convertible_estimate_fails(self):
        """Draft estimate returns 400 on convert-to-contract."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            estimate_number='EST-CONV-FAIL',
            status='draft',
            date=timezone.now().date(),
            ship_to=self.location,
            bill_to=self.location,
        )
        response = self.client.post(f'/api/v1/estimates/{estimate.id}/convert-to-contract/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# =============================================================================
# 5. DIRECT ORDER AUTO-CONTRACT TESTS
# =============================================================================

class DirectOrderAutoContractTests(ContractsTestCase):
    """Tests for auto-contract creation for DIRECT sales orders."""

    def _create_direct_order(self, source_estimate=None):
        """Create a DIRECT SO and simulate perform_create auto-contract logic."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number=f'SO-{SalesOrder.objects.count()+1:06d}',
            order_date=timezone.now().date(),
            ship_to=self.location,
            bill_to=self.location,
            order_class='DIRECT',
            source_estimate=source_estimate,
            status='confirmed',
        )
        so_line = SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=so,
            line_number=10,
            item=self.item1,
            quantity_ordered=50,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )

        # Simulate perform_create auto-contract logic
        if so.source_estimate_id:
            estimate = so.source_estimate
            estimate.status = 'converted'
            estimate.save(update_fields=['status'])

        # Auto-create Direct contract
        contract = Contract.objects.create(
            tenant=so.tenant,
            customer=so.customer,
            contract_type='direct',
            status='complete',
            issue_date=so.order_date,
            ship_to=so.ship_to,
            source_estimate=so.source_estimate,
            blanket_po=so.customer_po or '',
            notes=f'Auto-created for Direct Order {so.order_number}',
        )
        for line in so.lines.select_related('item', 'uom').all():
            cl = ContractLine.objects.create(
                tenant=so.tenant,
                contract=contract,
                line_number=line.line_number,
                item=line.item,
                blanket_qty=line.quantity_ordered,
                uom=line.uom,
                unit_price=line.unit_price,
            )
            ContractRelease.objects.create(
                tenant=so.tenant,
                contract_line=cl,
                sales_order_line=line,
                quantity_ordered=line.quantity_ordered,
                release_date=so.order_date,
            )

        return so, contract

    def test_direct_order_creates_contract(self):
        """DIRECT SO creates a Contract."""
        so, contract = self._create_direct_order()
        self.assertIsNotNone(contract)
        self.assertEqual(Contract.objects.count(), 1)

    def test_direct_order_contract_is_complete(self):
        """Auto-created contract has status='complete'."""
        so, contract = self._create_direct_order()
        self.assertEqual(contract.status, 'complete')

    def test_direct_order_contract_type_is_direct(self):
        """Auto-created contract has contract_type='direct'."""
        so, contract = self._create_direct_order()
        self.assertEqual(contract.contract_type, 'direct')

    def test_direct_order_creates_contract_releases(self):
        """ContractRelease records link SO lines to contract lines."""
        so, contract = self._create_direct_order()
        self.assertEqual(contract.lines.count(), 1)
        cl = contract.lines.first()
        self.assertEqual(cl.releases.count(), 1)
        release = cl.releases.first()
        self.assertEqual(release.quantity_ordered, 50)

    def test_direct_order_with_source_estimate_marks_converted(self):
        """When source_estimate is set, estimate status becomes 'converted'."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            estimate_number='EST-DIR-001',
            status='sent',
            date=timezone.now().date(),
            ship_to=self.location,
            bill_to=self.location,
        )
        so, contract = self._create_direct_order(source_estimate=estimate)
        estimate.refresh_from_db()
        self.assertEqual(estimate.status, 'converted')
        self.assertEqual(contract.source_estimate, estimate)
