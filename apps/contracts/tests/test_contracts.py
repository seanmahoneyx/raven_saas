# apps/contracts/tests/test_contracts.py
"""
Tests for Contract-related models, serializers, and API endpoints.

Test coverage:
- Model tests: Contract, ContractLine, ContractRelease properties and constraints
- API endpoint tests: CRUD operations, status transitions, releases
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.contracts.models import Contract, ContractLine, ContractRelease
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# BASE TEST CLASS
# =============================================================================

class ContractsTestCase(TestCase):
    """Base test case with shared setup for contract tests."""

    @classmethod
    def setUpTestData(cls):
        """Create shared test data (runs once per test class)."""
        # Create tenant
        cls.tenant = Tenant.objects.create(
            name='Test Company',
            subdomain='test-contracts',
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

        # Create customer party
        cls.customer_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='CUST001',
            display_name='Test Customer',
            legal_name='Test Customer Inc.',
            is_active=True,
        )

        # Create customer
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            payment_terms='NET30',
        )

        # Create location for ship_to
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

        # Set default ship to for customer
        cls.customer.default_ship_to = cls.location
        cls.customer.default_bill_to = cls.location
        cls.customer.save()

        # Create test items
        cls.item1 = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-001',
            name='Test Item 1',
            division='misc',
            base_uom=cls.uom_each,
            is_active=True,
        )
        cls.item2 = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-002',
            name='Test Item 2',
            division='misc',
            base_uom=cls.uom_each,
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

class ContractModelTests(ContractsTestCase):
    """Tests for Contract model."""

    def test_create_contract(self):
        """Test creating a basic contract."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            blanket_po='PO-12345',
            issue_date=timezone.now().date(),
            notes='Test contract',
        )
        self.assertIsNotNone(contract.contract_number)
        self.assertEqual(contract.status, 'draft')
        self.assertEqual(contract.blanket_po, 'PO-12345')

    def test_contract_number_auto_generation(self):
        """Test that contract_number is auto-generated."""
        contract1 = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        contract2 = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        self.assertEqual(contract1.contract_number, '0001')
        self.assertEqual(contract2.contract_number, '0002')

    def test_contract_str_representation(self):
        """Test contract string representation."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            contract_number='1234',
        )
        self.assertEqual(str(contract), 'CTR-1234')

    def test_contract_number_unique_per_tenant(self):
        """Test contract_number is unique per tenant."""
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            contract_number='UNIQUE-001',
        )
        with self.assertRaises(IntegrityError):
            Contract.objects.create(
                tenant=self.tenant,
                customer=self.customer,
                contract_number='UNIQUE-001',
            )

    def test_is_active_property(self):
        """Test is_active property based on status and dates."""
        # Draft contract - not active
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
        )
        self.assertFalse(contract.is_active)

        # Active contract - is active
        contract.status = 'active'
        contract.save()
        self.assertTrue(contract.is_active)

        # Active contract with future start date - not active
        contract.start_date = timezone.now().date() + timezone.timedelta(days=7)
        contract.save()
        self.assertFalse(contract.is_active)

        # Active contract with past end date - not active
        contract.start_date = None
        contract.end_date = timezone.now().date() - timezone.timedelta(days=1)
        contract.save()
        self.assertFalse(contract.is_active)

    def test_total_committed_qty(self):
        """Test total_committed_qty property."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=20,
            item=self.item2,
            blanket_qty=200,
            uom=self.uom_each,
        )
        self.assertEqual(contract.total_committed_qty, 300)

    def test_num_lines_property(self):
        """Test num_lines property."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        self.assertEqual(contract.num_lines, 0)

        ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        self.assertEqual(contract.num_lines, 1)


class ContractLineModelTests(ContractsTestCase):
    """Tests for ContractLine model."""

    def test_create_contract_line(self):
        """Test creating a contract line."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )
        self.assertEqual(line.blanket_qty, 100)
        self.assertEqual(line.unit_price, Decimal('5.00'))

    def test_contract_line_str_representation(self):
        """Test contract line string representation."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            contract_number='1234',
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        self.assertEqual(str(line), '1234 Line 10: ITEM-001')

    def test_released_qty_property(self):
        """Test released_qty property calculates from releases."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        self.assertEqual(line.released_qty, 0)

        # Create a sales order and release
        order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='00001',
            order_date=timezone.now().date(),
            ship_to=self.location,
            status='confirmed',
        )
        order_line = SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=order,
            line_number=10,
            item=self.item1,
            quantity_ordered=25,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )
        ContractRelease.objects.create(
            tenant=self.tenant,
            contract_line=line,
            sales_order_line=order_line,
            quantity_ordered=25,
            release_date=timezone.now().date(),
        )
        # Refresh from DB to clear cached property
        line = ContractLine.objects.get(pk=line.pk)
        self.assertEqual(line.released_qty, 25)

    def test_remaining_qty_property(self):
        """Test remaining_qty property."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        self.assertEqual(line.remaining_qty, 100)

        # Create release
        order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='00001',
            order_date=timezone.now().date(),
            ship_to=self.location,
            status='confirmed',
        )
        order_line = SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=order,
            line_number=10,
            item=self.item1,
            quantity_ordered=30,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )
        ContractRelease.objects.create(
            tenant=self.tenant,
            contract_line=line,
            sales_order_line=order_line,
            quantity_ordered=30,
            release_date=timezone.now().date(),
        )
        line = ContractLine.objects.get(pk=line.pk)
        self.assertEqual(line.remaining_qty, 70)

    def test_is_fully_released_property(self):
        """Test is_fully_released property."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=50,
            uom=self.uom_each,
        )
        self.assertFalse(line.is_fully_released)

        # Release full quantity
        order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='00001',
            order_date=timezone.now().date(),
            ship_to=self.location,
            status='confirmed',
        )
        order_line = SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=order,
            line_number=10,
            item=self.item1,
            quantity_ordered=50,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )
        ContractRelease.objects.create(
            tenant=self.tenant,
            contract_line=line,
            sales_order_line=order_line,
            quantity_ordered=50,
            release_date=timezone.now().date(),
        )
        line = ContractLine.objects.get(pk=line.pk)
        self.assertTrue(line.is_fully_released)


class ContractReleaseModelTests(ContractsTestCase):
    """Tests for ContractRelease model."""

    def test_create_release_with_balance_snapshot(self):
        """Test that release captures balance before/after."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )

        order = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='00001',
            order_date=timezone.now().date(),
            ship_to=self.location,
            status='confirmed',
        )
        order_line = SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=order,
            line_number=10,
            item=self.item1,
            quantity_ordered=30,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )

        release = ContractRelease.objects.create(
            tenant=self.tenant,
            contract_line=line,
            sales_order_line=order_line,
            quantity_ordered=30,
            release_date=timezone.now().date(),
        )

        self.assertEqual(release.balance_before, 100)
        self.assertEqual(release.balance_after, 70)


# =============================================================================
# API ENDPOINT TESTS
# =============================================================================

class ContractAPITests(ContractsTestCase):
    """Tests for Contract API endpoints."""

    def test_list_contracts(self):
        """Test GET /api/v1/contracts/"""
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            blanket_po='PO-001',
        )
        response = self.client.get('/api/v1/contracts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_create_contract(self):
        """Test POST /api/v1/contracts/"""
        data = {
            'customer': self.customer.id,
            'blanket_po': 'PO-NEW-001',
            'issue_date': str(timezone.now().date()),
            'notes': 'Test contract creation',
            'lines': [
                {
                    'item': self.item1.id,
                    'blanket_qty': 100,
                    'uom': self.uom_each.id,
                    'unit_price': '5.00',
                },
            ],
        }
        response = self.client.post('/api/v1/contracts/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['blanket_po'], 'PO-NEW-001')
        self.assertEqual(response.data['status'], 'draft')

    def test_get_contract_detail(self):
        """Test GET /api/v1/contracts/{id}/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            blanket_po='DETAIL-PO',
        )
        ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        response = self.client.get(f'/api/v1/contracts/{contract.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['blanket_po'], 'DETAIL-PO')
        self.assertIn('lines', response.data)
        self.assertEqual(len(response.data['lines']), 1)

    def test_update_contract(self):
        """Test PATCH /api/v1/contracts/{id}/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            blanket_po='ORIGINAL',
        )
        response = self.client.patch(
            f'/api/v1/contracts/{contract.id}/',
            {'blanket_po': 'UPDATED'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['blanket_po'], 'UPDATED')

    def test_delete_contract(self):
        """Test DELETE /api/v1/contracts/{id}/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        response = self.client.delete(f'/api/v1/contracts/{contract.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Contract.objects.filter(id=contract.id).exists())

    def test_filter_contracts_by_status(self):
        """Test filtering contracts by status."""
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
        )
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        response = self.client.get('/api/v1/contracts/', {'status': 'active'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for contract in response.data['results']:
            self.assertEqual(contract['status'], 'active')

    def test_filter_contracts_by_customer(self):
        """Test filtering contracts by customer."""
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        response = self.client.get('/api/v1/contracts/', {'customer': self.customer.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)


class ContractStatusAPITests(ContractsTestCase):
    """Tests for contract status transition endpoints."""

    def test_activate_contract(self):
        """Test POST /api/v1/contracts/{id}/activate/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
        )
        # Add a line so we can activate
        ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        response = self.client.post(f'/api/v1/contracts/{contract.id}/activate/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'active')

    def test_activate_contract_without_lines_fails(self):
        """Test activating contract with no lines fails."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
        )
        response = self.client.post(f'/api/v1/contracts/{contract.id}/activate/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_activate_non_draft_contract_fails(self):
        """Test activating non-draft contract fails."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        response = self.client.post(f'/api/v1/contracts/{contract.id}/activate/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_complete_contract(self):
        """Test POST /api/v1/contracts/{id}/complete/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        response = self.client.post(f'/api/v1/contracts/{contract.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'complete')

    def test_complete_non_active_contract_fails(self):
        """Test completing non-active contract fails."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
        )
        response = self.client.post(f'/api/v1/contracts/{contract.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_contract(self):
        """Test POST /api/v1/contracts/{id}/cancel/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        response = self.client.post(f'/api/v1/contracts/{contract.id}/cancel/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'cancelled')

    def test_cancel_completed_contract_fails(self):
        """Test cancelling completed contract fails."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='complete',
        )
        response = self.client.post(f'/api/v1/contracts/{contract.id}/cancel/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ContractReleaseAPITests(ContractsTestCase):
    """Tests for contract release endpoint."""

    def test_create_release(self):
        """Test POST /api/v1/contracts/{id}/create_release/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
            ship_to=self.location,
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )

        data = {
            'contract_line_id': line.id,
            'quantity': 25,
        }
        response = self.client.post(
            f'/api/v1/contracts/{contract.id}/create_release/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['quantity_ordered'], 25)
        self.assertEqual(response.data['balance_before'], 100)
        self.assertEqual(response.data['balance_after'], 75)

        # Verify sales order was created
        # Re-set tenant context (cleared by API middleware after request)
        set_current_tenant(self.tenant)
        self.assertEqual(SalesOrder.objects.count(), 1)
        order = SalesOrder.objects.first()
        self.assertEqual(order.customer, self.customer)
        self.assertEqual(order.customer_po, contract.blanket_po)

        # Verify order details from response
        self.assertEqual(response.data['sales_order_number'], order.order_number)

    def test_create_release_with_custom_price(self):
        """Test creating release with custom unit price."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
            ship_to=self.location,
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
            unit_price=Decimal('5.00'),
        )

        data = {
            'contract_line_id': line.id,
            'quantity': 10,
            'unit_price': '6.50',
        }
        response = self.client.post(
            f'/api/v1/contracts/{contract.id}/create_release/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify the order line has the custom price
        # Re-set tenant context (cleared by API middleware after request)
        set_current_tenant(self.tenant)
        order_line = SalesOrderLine.objects.first()
        self.assertEqual(order_line.unit_price, Decimal('6.50'))

    def test_create_release_over_balance_rejected(self):
        """Test that over-release is rejected with 400."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
            ship_to=self.location,
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=50,
            unit_price=Decimal('10.00'),
            uom=self.uom_each,
        )

        data = {
            'contract_line_id': line.id,
            'quantity': 75,  # More than blanket_qty
        }
        response = self.client.post(
            f'/api/v1/contracts/{contract.id}/create_release/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_release_from_non_active_contract_fails(self):
        """Test creating release from draft contract fails."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
        )
        line = ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )

        data = {
            'contract_line_id': line.id,
            'quantity': 10,
        }
        response = self.client.post(
            f'/api/v1/contracts/{contract.id}/create_release/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_release_invalid_line_fails(self):
        """Test creating release with invalid line ID fails."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
            ship_to=self.location,
        )

        data = {
            'contract_line_id': 99999,  # Non-existent line
            'quantity': 10,
        }
        response = self.client.post(
            f'/api/v1/contracts/{contract.id}/create_release/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)


class ContractLineAPITests(ContractsTestCase):
    """Tests for contract line endpoints."""

    def test_list_contract_lines(self):
        """Test GET /api/v1/contracts/{id}/lines/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        response = self.client.get(f'/api/v1/contracts/{contract.id}/lines/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_add_line_to_contract(self):
        """Test POST /api/v1/contracts/{id}/lines/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
        )
        data = {
            'item': self.item1.id,
            'blanket_qty': 200,
            'uom': self.uom_each.id,
        }
        response = self.client.post(
            f'/api/v1/contracts/{contract.id}/lines/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['blanket_qty'], 200)
        self.assertEqual(response.data['line_number'], 10)  # Auto-generated

    def test_add_line_to_completed_contract_fails(self):
        """Test adding line to completed contract fails."""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='complete',
        )
        data = {
            'item': self.item1.id,
            'blanket_qty': 100,
            'uom': self.uom_each.id,
        }
        response = self.client.post(
            f'/api/v1/contracts/{contract.id}/lines/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ContractFilterAPITests(ContractsTestCase):
    """Tests for contract filter endpoints."""

    def test_by_customer_endpoint(self):
        """Test GET /api/v1/contracts/by_customer/"""
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        response = self.client.get(
            '/api/v1/contracts/by_customer/',
            {'customer': self.customer.id}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_by_item_endpoint(self):
        """Test GET /api/v1/contracts/by_item/"""
        contract = Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
        )
        ContractLine.objects.create(
            tenant=self.tenant,
            contract=contract,
            line_number=10,
            item=self.item1,
            blanket_qty=100,
            uom=self.uom_each,
        )
        response = self.client.get(
            '/api/v1/contracts/by_item/',
            {'item': self.item1.id}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_by_item_endpoint_requires_item_param(self):
        """Test by_item endpoint requires item parameter."""
        response = self.client.get('/api/v1/contracts/by_item/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_active_contracts_endpoint(self):
        """Test GET /api/v1/contracts/active/"""
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='draft',
        )
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            status='active',
        )
        response = self.client.get('/api/v1/contracts/active/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for contract in response.data['results']:
            self.assertEqual(contract['status'], 'active')


# =============================================================================
# AUTHENTICATION & TENANT ISOLATION TESTS
# =============================================================================

class AuthenticationTests(ContractsTestCase):
    """Tests for API authentication requirements."""

    def test_unauthenticated_request_rejected(self):
        """Test that unauthenticated requests are rejected."""
        self.client.logout()
        response = self.client.get('/api/v1/contracts/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class TenantIsolationTests(ContractsTestCase):
    """Tests for tenant data isolation."""

    def test_contract_number_unique_per_tenant_allows_same_in_different_tenant(self):
        """Test that same contract number can exist in different tenants."""
        # Create contract in test tenant
        Contract.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            contract_number='SHARED-001',
        )

        # Create second tenant with its own customer and contract
        tenant2 = Tenant.objects.create(
            name='Other Company',
            subdomain='other-contracts',
        )
        set_current_tenant(tenant2)

        party2 = Party.objects.create(
            tenant=tenant2,
            party_type='CUSTOMER',
            code='CUST002',
            display_name='Other Customer',
            legal_name='Other Customer Inc.',
        )
        customer2 = Customer.objects.create(
            tenant=tenant2,
            party=party2,
        )

        # Same contract number should be allowed in different tenant
        contract2 = Contract.objects.create(
            tenant=tenant2,
            customer=customer2,
            contract_number='SHARED-001',
        )
        self.assertEqual(contract2.contract_number, 'SHARED-001')

        # Switch back to first tenant
        set_current_tenant(self.tenant)

        # TenantManager should only return tenant 1's contracts
        contracts = Contract.objects.filter(contract_number='SHARED-001')
        self.assertEqual(contracts.count(), 1)
        self.assertEqual(contracts.first().tenant, self.tenant)
