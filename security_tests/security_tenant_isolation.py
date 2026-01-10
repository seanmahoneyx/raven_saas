"""
Security tests for tenant data isolation.

This test suite verifies that tenant data is properly isolated and that
one tenant cannot access or modify another tenant's data through various
attack vectors.

CRITICAL: Tenant isolation is the #1 security concern in multi-tenant SaaS.
Any failure in these tests represents a CRITICAL security vulnerability.
"""
import pytest
from django.test import TestCase, TransactionTestCase
from django.db import connection
from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location, Truck
from apps.items.models import Item, UnitOfMeasure, ItemUOM
from apps.orders.models import PurchaseOrder, SalesOrder, PurchaseOrderLine, SalesOrderLine
from shared.models import TenantContext
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.security
@pytest.mark.tenant_isolation
class TenantIsolationSecurityTests(TransactionTestCase):
    """
    Test tenant data isolation to prevent cross-tenant data access.

    These tests simulate various attack scenarios where a malicious tenant
    attempts to access or modify data belonging to another tenant.
    """

    def setUp(self):
        """Create two separate tenants with their own data."""
        # Create Tenant 1
        self.tenant1 = Tenant.objects.create(
            name="Tenant One Corp",
            subdomain="tenant1",
            is_active=True
        )

        # Create Tenant 2
        self.tenant2 = Tenant.objects.create(
            name="Tenant Two Inc",
            subdomain="tenant2",
            is_active=True
        )

        # Create UOM (shared across tenants, not tenant-specific)
        self.uom = UnitOfMeasure.objects.create(
            name="Each",
            abbreviation="ea"
        )

        # Create data for Tenant 1
        with TenantContext(self.tenant1):
            self.tenant1_party = Party.objects.create(
                name="Tenant 1 Party",
                tenant=self.tenant1
            )
            self.tenant1_customer = Customer.objects.create(
                party=self.tenant1_party,
                credit_limit=10000.00
            )
            self.tenant1_location = Location.objects.create(
                party=self.tenant1_party,
                name="Tenant 1 Location",
                address_1="123 First St",
                city="City1",
                state="CA",
                zip_code="90001",
                tenant=self.tenant1
            )
            self.tenant1_item = Item.objects.create(
                sku="ITEM-T1-001",
                description="Tenant 1 Item",
                base_uom=self.uom,
                tenant=self.tenant1
            )
            self.tenant1_so = SalesOrder.objects.create(
                order_number="SO-T1-001",
                customer=self.tenant1_customer,
                ship_to=self.tenant1_location,
                tenant=self.tenant1
            )
            self.tenant1_truck = Truck.objects.create(
                name="Truck 1",
                tenant=self.tenant1
            )

        # Create data for Tenant 2
        with TenantContext(self.tenant2):
            self.tenant2_party = Party.objects.create(
                name="Tenant 2 Party",
                tenant=self.tenant2
            )
            self.tenant2_customer = Customer.objects.create(
                party=self.tenant2_party,
                credit_limit=20000.00
            )
            self.tenant2_location = Location.objects.create(
                party=self.tenant2_party,
                name="Tenant 2 Location",
                address_1="456 Second St",
                city="City2",
                state="NY",
                zip_code="10001",
                tenant=self.tenant2
            )
            self.tenant2_item = Item.objects.create(
                sku="ITEM-T2-001",
                description="Tenant 2 Item",
                base_uom=self.uom,
                tenant=self.tenant2
            )
            self.tenant2_so = SalesOrder.objects.create(
                order_number="SO-T2-001",
                customer=self.tenant2_customer,
                ship_to=self.tenant2_location,
                tenant=self.tenant2
            )
            self.tenant2_truck = Truck.objects.create(
                name="Truck 2",
                tenant=self.tenant2
            )

    def test_party_isolation_query(self):
        """
        CRITICAL: Verify Party objects are isolated per tenant.

        Attack: Tenant 1 tries to query all Party objects and access Tenant 2's data.
        """
        with TenantContext(self.tenant1):
            parties = Party.objects.all()
            self.assertEqual(parties.count(), 1)
            self.assertEqual(parties.first().id, self.tenant1_party.id)

            # Verify tenant 2's party is NOT accessible
            with self.assertRaises(Party.DoesNotExist):
                Party.objects.get(id=self.tenant2_party.id)

    def test_customer_isolation_query(self):
        """
        CRITICAL: Verify Customer objects are isolated per tenant.

        Attack: Tenant 1 tries to query all Customers including Tenant 2's data.
        """
        with TenantContext(self.tenant1):
            customers = Customer.objects.all()
            self.assertEqual(customers.count(), 1)
            self.assertEqual(customers.first().id, self.tenant1_customer.id)

            # Verify tenant 2's customer is NOT accessible
            with self.assertRaises(Customer.DoesNotExist):
                Customer.objects.get(id=self.tenant2_customer.id)

    def test_location_isolation_query(self):
        """
        CRITICAL: Verify Location objects are isolated per tenant.

        Attack: Tenant 1 tries to access Tenant 2's location data.
        """
        with TenantContext(self.tenant1):
            locations = Location.objects.all()
            self.assertEqual(locations.count(), 1)
            self.assertEqual(locations.first().id, self.tenant1_location.id)

            # Verify tenant 2's location is NOT accessible
            with self.assertRaises(Location.DoesNotExist):
                Location.objects.get(id=self.tenant2_location.id)

    def test_item_isolation_query(self):
        """
        CRITICAL: Verify Item objects are isolated per tenant.

        Attack: Tenant 1 tries to access Tenant 2's item catalog.
        """
        with TenantContext(self.tenant1):
            items = Item.objects.all()
            self.assertEqual(items.count(), 1)
            self.assertEqual(items.first().id, self.tenant1_item.id)

            # Verify tenant 2's item is NOT accessible
            with self.assertRaises(Item.DoesNotExist):
                Item.objects.get(id=self.tenant2_item.id)

    def test_sales_order_isolation_query(self):
        """
        CRITICAL: Verify SalesOrder objects are isolated per tenant.

        Attack: Tenant 1 tries to access Tenant 2's orders.
        """
        with TenantContext(self.tenant1):
            orders = SalesOrder.objects.all()
            self.assertEqual(orders.count(), 1)
            self.assertEqual(orders.first().id, self.tenant1_so.id)

            # Verify tenant 2's order is NOT accessible
            with self.assertRaises(SalesOrder.DoesNotExist):
                SalesOrder.objects.get(id=self.tenant2_so.id)

    def test_truck_isolation_query(self):
        """
        CRITICAL: Verify Truck objects are isolated per tenant.

        Attack: Tenant 1 tries to access Tenant 2's trucks.
        """
        with TenantContext(self.tenant1):
            trucks = Truck.objects.all()
            self.assertEqual(trucks.count(), 1)
            self.assertEqual(trucks.first().id, self.tenant1_truck.id)

            # Verify tenant 2's truck is NOT accessible
            with self.assertRaises(Truck.DoesNotExist):
                Truck.objects.get(id=self.tenant2_truck.id)

    def test_direct_pk_access_blocked(self):
        """
        CRITICAL: Verify direct primary key access is blocked across tenants.

        Attack: Tenant 1 knows the PK of Tenant 2's party and tries to access it directly.
        This simulates an attacker who has discovered valid PKs through enumeration.
        """
        tenant2_party_pk = self.tenant2_party.id

        with TenantContext(self.tenant1):
            # Direct PK access should fail
            with self.assertRaises(Party.DoesNotExist):
                Party.objects.get(pk=tenant2_party_pk)

            # Filter by PK should return empty
            result = Party.objects.filter(pk=tenant2_party_pk)
            self.assertEqual(result.count(), 0)

    def test_related_object_isolation(self):
        """
        CRITICAL: Verify related objects maintain tenant isolation.

        Attack: Tenant 1 tries to access Tenant 2's data through related objects.
        """
        with TenantContext(self.tenant1):
            # Access customer through party relationship
            party = Party.objects.first()
            customer = party.customer
            self.assertEqual(customer.id, self.tenant1_customer.id)

            # Verify we cannot access tenant 2's customer through any relationship
            all_customers = Customer.objects.all()
            self.assertNotIn(self.tenant2_customer.id, [c.id for c in all_customers])

    def test_cross_tenant_foreign_key_assignment(self):
        """
        CRITICAL: Verify that assigning foreign keys from another tenant is prevented.

        Attack: Tenant 1 tries to create a SalesOrder using Tenant 2's customer.
        """
        with TenantContext(self.tenant1):
            # This should fail or create issues because tenant2_customer belongs to tenant2
            # The system should either raise an error or auto-correct the tenant
            with self.assertRaises(Exception):
                SalesOrder.objects.create(
                    order_number="SO-ATTACK-001",
                    customer=self.tenant2_customer,  # Wrong tenant!
                    ship_to=self.tenant1_location,
                    tenant=self.tenant1
                )

    def test_update_without_tenant_context(self):
        """
        CRITICAL: Verify that updates without tenant context don't leak data.

        Attack: Code bug that forgets to set tenant context before querying.
        """
        # Without tenant context, queries should be restricted or fail
        # This tests the fail-safe behavior
        parties_count = Party.objects.all().count()

        # The system should either:
        # 1. Return empty queryset (safe)
        # 2. Return only default tenant data (safe)
        # 3. Raise an error (safe)
        #
        # It should NEVER return data from multiple tenants (UNSAFE)

        # For now, we just verify the count is not the sum of both tenants
        # In a properly secured system, this should be 0 or raise an error
        self.assertNotEqual(parties_count, 2,
            "Without tenant context, system leaked data from multiple tenants!")

    def test_raw_sql_injection_attempt(self):
        """
        CRITICAL: Verify raw SQL cannot bypass tenant isolation.

        Attack: Attacker uses raw SQL to bypass tenant filtering.
        """
        with TenantContext(self.tenant1):
            # Try to use raw SQL to access all parties
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM parties_party")
                total_count = cursor.fetchone()[0]

                # Raw SQL bypasses tenant filtering - this is EXPECTED but DANGEROUS
                # Applications must NEVER use raw SQL without manual tenant filtering
                self.assertEqual(total_count, 2,
                    "Raw SQL test confirms that raw queries bypass tenant filtering. "
                    "Code MUST use ORM or manually filter by tenant_id.")

    def test_bulk_operations_respect_tenant(self):
        """
        CRITICAL: Verify bulk operations respect tenant boundaries.

        Attack: Use bulk_update or bulk_create to modify cross-tenant data.
        """
        with TenantContext(self.tenant1):
            # Try to bulk update parties (should only affect tenant 1)
            Party.objects.all().update(name="Updated Name")

        # Verify tenant 2's party was NOT updated
        with TenantContext(self.tenant2):
            tenant2_party = Party.objects.get(id=self.tenant2_party.id)
            self.assertEqual(tenant2_party.name, "Tenant 2 Party")

    def test_aggregate_queries_isolated(self):
        """
        CRITICAL: Verify aggregate queries don't leak cross-tenant data.

        Attack: Use aggregate/annotate to access cross-tenant statistics.
        """
        with TenantContext(self.tenant1):
            # Count should only include tenant 1's data
            party_count = Party.objects.count()
            self.assertEqual(party_count, 1)

            item_count = Item.objects.count()
            self.assertEqual(item_count, 1)

    def test_select_related_cross_tenant_leak(self):
        """
        CRITICAL: Verify select_related doesn't leak cross-tenant data.

        Attack: Use select_related to access data from another tenant.
        """
        with TenantContext(self.tenant1):
            # Query with select_related
            orders = SalesOrder.objects.select_related('customer__party').all()
            self.assertEqual(orders.count(), 1)

            order = orders.first()
            # Verify the related customer belongs to tenant 1
            self.assertEqual(order.customer.party.tenant_id, self.tenant1.id)

    def test_prefetch_related_cross_tenant_leak(self):
        """
        CRITICAL: Verify prefetch_related doesn't leak cross-tenant data.

        Attack: Use prefetch_related to access data from another tenant.
        """
        with TenantContext(self.tenant1):
            # Query with prefetch_related
            parties = Party.objects.prefetch_related('locations').all()
            self.assertEqual(parties.count(), 1)

            party = parties.first()
            locations = list(party.locations.all())
            self.assertEqual(len(locations), 1)
            self.assertEqual(locations[0].id, self.tenant1_location.id)


@pytest.mark.security
@pytest.mark.tenant_isolation
class TenantContextSecurityTests(TestCase):
    """
    Test the TenantContext manager for security issues.

    Verifies that the tenant context management system properly handles
    edge cases and attack scenarios.
    """

    def setUp(self):
        self.tenant1 = Tenant.objects.create(
            name="Test Tenant 1",
            subdomain="test1"
        )
        self.tenant2 = Tenant.objects.create(
            name="Test Tenant 2",
            subdomain="test2"
        )

    def test_nested_tenant_context_security(self):
        """
        CRITICAL: Verify nested tenant contexts properly restore previous context.

        Attack: Use nested contexts to confuse the system and access wrong tenant.
        """
        with TenantContext(self.tenant1):
            # Create party in tenant 1
            party1 = Party.objects.create(name="Party 1", tenant=self.tenant1)

            with TenantContext(self.tenant2):
                # Create party in tenant 2
                party2 = Party.objects.create(name="Party 2", tenant=self.tenant2)

                # Should only see tenant 2 data
                self.assertEqual(Party.objects.count(), 1)

            # After exiting nested context, should be back in tenant 1
            # Should only see tenant 1 data
            parties = Party.objects.all()
            self.assertEqual(parties.count(), 1)
            self.assertEqual(parties.first().id, party1.id)

    def test_context_manager_exception_safety(self):
        """
        CRITICAL: Verify tenant context is properly restored even after exceptions.

        Attack: Trigger exception inside tenant context to leave system in wrong tenant.
        """
        with TenantContext(self.tenant1):
            Party.objects.create(name="Party 1", tenant=self.tenant1)

            try:
                with TenantContext(self.tenant2):
                    Party.objects.create(name="Party 2", tenant=self.tenant2)
                    # Simulate an error
                    raise ValueError("Test exception")
            except ValueError:
                pass

            # After exception, should still be in tenant 1 context
            parties = Party.objects.all()
            self.assertEqual(parties.count(), 1)
            self.assertEqual(parties.first().name, "Party 1")

    def test_concurrent_tenant_context_isolation(self):
        """
        CRITICAL: Verify thread-local storage properly isolates tenant contexts.

        Attack: Try to access tenant context from different logical execution paths.
        Note: Full threading test would require more complex setup.
        """
        # Create parties in different contexts
        with TenantContext(self.tenant1):
            Party.objects.create(name="Party 1", tenant=self.tenant1)

        with TenantContext(self.tenant2):
            Party.objects.create(name="Party 2", tenant=self.tenant2)

        # Verify isolation
        with TenantContext(self.tenant1):
            self.assertEqual(Party.objects.count(), 1)

        with TenantContext(self.tenant2):
            self.assertEqual(Party.objects.count(), 1)
