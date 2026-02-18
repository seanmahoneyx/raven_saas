# apps/parties/tests.py
"""
Tests for Party, Customer, Vendor, and Location models.
"""
from django.test import TestCase
from django.db import IntegrityError

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from shared.managers import set_current_tenant
from users.models import User


class PartyModelTestCase(TestCase):
    """Tests for the Party model and its extensions."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Party Co', subdomain='test-parties')
        cls.user = User.objects.create_user(username='partyuser', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    # ── 5.1a: Create a Party with party_type=CUSTOMER ────────────────────

    def test_create_customer_party(self):
        """Create a Party with party_type=CUSTOMER and verify __str__."""
        party = Party.objects.create(
            tenant=self.tenant,
            party_type='CUSTOMER',
            code='CUST-001',
            display_name='Acme Corp',
        )
        self.assertEqual(party.party_type, 'CUSTOMER')
        self.assertEqual(str(party), 'CUST-001 - Acme Corp')
        self.assertTrue(party.is_active)

    # ── 5.1b: Create a Party with party_type=VENDOR ──────────────────────

    def test_create_vendor_party(self):
        """Create a Party with party_type=VENDOR and verify __str__."""
        party = Party.objects.create(
            tenant=self.tenant,
            party_type='VENDOR',
            code='VEND-001',
            display_name='SupplyMax',
        )
        self.assertEqual(party.party_type, 'VENDOR')
        self.assertEqual(str(party), 'VEND-001 - SupplyMax')

    # ── 5.1c: Duplicate code within same tenant raises IntegrityError ────

    def test_duplicate_code_same_tenant(self):
        """Duplicate party code within the same tenant raises IntegrityError."""
        Party.objects.create(
            tenant=self.tenant,
            party_type='CUSTOMER',
            code='DUP-001',
            display_name='First Party',
        )
        with self.assertRaises(IntegrityError):
            Party.objects.create(
                tenant=self.tenant,
                party_type='VENDOR',
                code='DUP-001',
                display_name='Second Party',
            )

    # ── 5.1d: Same code in different tenant succeeds ─────────────────────

    def test_same_code_different_tenant(self):
        """Same party code in a different tenant does not conflict."""
        Party.objects.create(
            tenant=self.tenant,
            party_type='CUSTOMER',
            code='CROSS-001',
            display_name='Tenant1 Party',
        )
        other_tenant = Tenant.objects.create(name='Other Co', subdomain='test-parties-other')
        set_current_tenant(other_tenant)
        party2 = Party.objects.create(
            tenant=other_tenant,
            party_type='CUSTOMER',
            code='CROSS-001',
            display_name='Tenant2 Party',
        )
        self.assertEqual(party2.code, 'CROSS-001')
        # Reset tenant
        set_current_tenant(self.tenant)

    # ── 5.1e: Customer record linked to Party ────────────────────────────

    def test_customer_one_to_one(self):
        """Customer OneToOne with Party; verify credit_limit and payment_terms."""
        party = Party.objects.create(
            tenant=self.tenant,
            party_type='CUSTOMER',
            code='C-LINK',
            display_name='Linked Customer',
        )
        customer = Customer.objects.create(
            tenant=self.tenant,
            party=party,
            payment_terms='NET60',
            credit_limit=50000,
        )
        self.assertEqual(customer.party, party)
        self.assertEqual(customer.payment_terms, 'NET60')
        self.assertEqual(customer.credit_limit, 50000)
        self.assertTrue(party.is_customer)
        self.assertFalse(party.is_vendor)

    # ── 5.1f: Vendor record linked to Party ──────────────────────────────

    def test_vendor_one_to_one(self):
        """Vendor OneToOne with Party; verify payment_terms."""
        party = Party.objects.create(
            tenant=self.tenant,
            party_type='VENDOR',
            code='V-LINK',
            display_name='Linked Vendor',
        )
        vendor = Vendor.objects.create(
            tenant=self.tenant,
            party=party,
            payment_terms='NET45',
        )
        self.assertEqual(vendor.party, party)
        self.assertEqual(vendor.payment_terms, 'NET45')
        self.assertTrue(party.is_vendor)
        self.assertFalse(party.is_customer)

    # ── 5.1g: Party with BOTH Customer and Vendor ────────────────────────

    def test_party_both_customer_and_vendor(self):
        """A single Party can have both Customer and Vendor records."""
        party = Party.objects.create(
            tenant=self.tenant,
            party_type='BOTH',
            code='BOTH-001',
            display_name='Dual Role',
        )
        Customer.objects.create(tenant=self.tenant, party=party)
        Vendor.objects.create(tenant=self.tenant, party=party)
        self.assertTrue(party.is_customer)
        self.assertTrue(party.is_vendor)

    # ── 5.1h: Location creation and types ────────────────────────────────

    def test_location_creation(self):
        """Create Location with SHIP_TO type and verify fields."""
        party = Party.objects.create(
            tenant=self.tenant,
            party_type='CUSTOMER',
            code='LOC-PARTY',
            display_name='Location Party',
        )
        location = Location.objects.create(
            tenant=self.tenant,
            party=party,
            location_type='SHIP_TO',
            name='Main Warehouse',
            address_line1='100 Industrial Blvd',
            city='Springfield',
            state='IL',
            postal_code='62701',
        )
        self.assertEqual(location.party, party)
        self.assertEqual(location.location_type, 'SHIP_TO')
        self.assertEqual(location.city, 'Springfield')

    # ── 5.1i: Multiple location types per party ──────────────────────────

    def test_multiple_location_types(self):
        """A party can have multiple locations with different types."""
        party = Party.objects.create(
            tenant=self.tenant,
            party_type='CUSTOMER',
            code='MULTI-LOC',
            display_name='Multi Location',
        )
        ship_to = Location.objects.create(
            tenant=self.tenant, party=party, location_type='SHIP_TO',
            name='Ship To', address_line1='1 Ship St', city='A', state='IL', postal_code='60601',
        )
        bill_to = Location.objects.create(
            tenant=self.tenant, party=party, location_type='BILL_TO',
            name='Bill To', address_line1='2 Bill St', city='B', state='IL', postal_code='60602',
        )
        warehouse = Location.objects.create(
            tenant=self.tenant, party=party, location_type='WAREHOUSE',
            name='Warehouse', address_line1='3 WH St', city='C', state='IL', postal_code='60603',
        )
        office = Location.objects.create(
            tenant=self.tenant, party=party, location_type='OFFICE',
            name='Office', address_line1='4 Office St', city='D', state='IL', postal_code='60604',
        )
        locations = party.locations.all()
        self.assertEqual(locations.count(), 4)
        types = set(locations.values_list('location_type', flat=True))
        self.assertEqual(types, {'SHIP_TO', 'BILL_TO', 'WAREHOUSE', 'OFFICE'})
