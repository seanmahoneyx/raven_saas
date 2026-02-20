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


class VendorFieldsTestCase(TestCase):
    """Tests for new vendor fields added in Phase 7."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Vendor Fields Co', subdomain='test-vendor-fields')
        cls.user = User.objects.create_user(username='vendortest', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_vendor_type_default(self):
        """Vendor type defaults to SUPPLIER."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-001', display_name='Default Type Vendor',
        )
        vendor = Vendor.objects.create(tenant=self.tenant, party=party)
        self.assertEqual(vendor.vendor_type, 'SUPPLIER')

    def test_vendor_type_choices(self):
        """Vendor type can be set to different choices."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-002', display_name='Broker Vendor',
        )
        vendor = Vendor.objects.create(
            tenant=self.tenant, party=party, vendor_type='BROKER',
        )
        self.assertEqual(vendor.vendor_type, 'BROKER')

    def test_vendor_tax_fields(self):
        """Vendor tax_code and tax_id can be set."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-003', display_name='Tax Vendor',
        )
        vendor = Vendor.objects.create(
            tenant=self.tenant, party=party,
            tax_code='EXEMPT', tax_id='12-3456789',
        )
        self.assertEqual(vendor.tax_code, 'EXEMPT')
        self.assertEqual(vendor.tax_id, '12-3456789')

    def test_vendor_credit_limit(self):
        """Vendor credit_limit can be set."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-004', display_name='Credit Vendor',
        )
        vendor = Vendor.objects.create(
            tenant=self.tenant, party=party, credit_limit=25000,
        )
        self.assertEqual(vendor.credit_limit, 25000)

    def test_vendor_credit_limit_nullable(self):
        """Vendor credit_limit can be null."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-005', display_name='No Credit Vendor',
        )
        vendor = Vendor.objects.create(tenant=self.tenant, party=party)
        self.assertIsNone(vendor.credit_limit)

    def test_vendor_charge_freight_default(self):
        """Vendor charge_freight defaults to True."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-006', display_name='Freight Vendor',
        )
        vendor = Vendor.objects.create(tenant=self.tenant, party=party)
        self.assertTrue(vendor.charge_freight)

    def test_vendor_charge_freight_false(self):
        """Vendor charge_freight can be set to False."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-007', display_name='No Freight Vendor',
        )
        vendor = Vendor.objects.create(
            tenant=self.tenant, party=party, charge_freight=False,
        )
        self.assertFalse(vendor.charge_freight)

    def test_vendor_invoice_delivery_method_default(self):
        """Vendor invoice_delivery_method defaults to EMAIL."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-008', display_name='Invoice Vendor',
        )
        vendor = Vendor.objects.create(tenant=self.tenant, party=party)
        self.assertEqual(vendor.invoice_delivery_method, 'EMAIL')

    def test_vendor_buyer_assignment(self):
        """Vendor can be assigned a buyer (user)."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-009', display_name='Buyer Vendor',
        )
        vendor = Vendor.objects.create(
            tenant=self.tenant, party=party, buyer=self.user,
        )
        self.assertEqual(vendor.buyer, self.user)

    def test_vendor_buyer_nullable(self):
        """Vendor buyer can be null."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-010', display_name='No Buyer Vendor',
        )
        vendor = Vendor.objects.create(tenant=self.tenant, party=party)
        self.assertIsNone(vendor.buyer)

    def test_vendor_str(self):
        """Vendor __str__ returns expected format."""
        party = Party.objects.create(
            tenant=self.tenant, party_type='VENDOR',
            code='VT-011', display_name='Str Vendor',
        )
        vendor = Vendor.objects.create(tenant=self.tenant, party=party)
        self.assertEqual(str(vendor), 'Vendor: Str Vendor')
