"""
Tests for VendorImporter.
"""
import io
from django.test import TestCase

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from apps.core.importers import VendorImporter
from shared.managers import set_current_tenant
from users.models import User


HEADERS = [
    'Code', 'Name', 'PaymentTerms', 'LegalName', 'Email', 'Phone', 'Notes',
    'VendorType', 'TaxCode', 'TaxId', 'CreditLimit', 'ChargeFreight',
    'Address1', 'Address2', 'City', 'State', 'PostalCode', 'Country',
]


def make_csv(*rows, headers=None):
    if headers is None:
        headers = HEADERS
    lines = [','.join(headers)]
    for row in rows:
        lines.append(','.join(str(v) for v in row))
    f = io.BytesIO('\n'.join(lines).encode('utf-8'))
    f.name = 'test.csv'
    return f


def base_row(**overrides):
    defaults = {
        'Code': 'VEND001', 'Name': 'Supply Co', 'PaymentTerms': 'NET60',
        'LegalName': '', 'Email': '', 'Phone': '', 'Notes': '',
        'VendorType': '', 'TaxCode': '', 'TaxId': '',
        'CreditLimit': '', 'ChargeFreight': '',
        'Address1': '', 'Address2': '', 'City': '', 'State': '',
        'PostalCode': '', 'Country': '',
    }
    defaults.update(overrides)
    return [defaults[h] for h in HEADERS]


class VendorImporterTestCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Vend Test Co', subdomain='test-vend-importer')
        cls.user = User.objects.create_user(username='venduser', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def _importer(self):
        return VendorImporter(tenant=self.tenant, user=self.user)

    def test_creates_party_with_vendor_type(self):
        """Importing a new code creates Party(party_type=VENDOR) and Vendor."""
        f = make_csv(base_row(Code='NEWVEND', Name='New Vendor'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='NEWVEND')
        self.assertEqual(party.party_type, 'VENDOR')
        self.assertTrue(Vendor.objects.filter(tenant=self.tenant, party=party).exists())

    def test_existing_customer_party_promoted_to_both(self):
        """If existing party is CUSTOMER, importing as vendor promotes it to BOTH."""
        party = Party.objects.create(
            tenant=self.tenant, code='DUALV', display_name='Dual Party',
            party_type='CUSTOMER',
        )
        Customer.objects.create(tenant=self.tenant, party=party)
        f = make_csv(base_row(Code='DUALV', Name='Dual Party'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party.refresh_from_db()
        self.assertEqual(party.party_type, 'BOTH')
        self.assertTrue(Vendor.objects.filter(tenant=self.tenant, party=party).exists())

    def test_existing_other_party_promoted_to_vendor(self):
        """If existing party is OTHER, it is promoted to VENDOR."""
        Party.objects.create(
            tenant=self.tenant, code='OTHERV', display_name='Other Party',
            party_type='OTHER',
        )
        f = make_csv(base_row(Code='OTHERV', Name='Other Party'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='OTHERV')
        self.assertEqual(party.party_type, 'VENDOR')

    def test_address1_creates_warehouse_location(self):
        """When Address1 is provided a WAREHOUSE Location is created."""
        row = base_row(
            Code='ADDRV', Name='Addr Vendor',
            Address1='200 Commerce Dr', City='Atlanta', State='GA', PostalCode='30301',
        )
        f = make_csv(row)
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='ADDRV')
        loc = Location.objects.get(tenant=self.tenant, party=party, name='Imported Address')
        self.assertEqual(loc.location_type, 'WAREHOUSE')

    def test_no_address1_no_location(self):
        """When Address1 is absent no Location is created."""
        f = make_csv(base_row(Code='NOADDRV', Name='No Addr Vendor'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='NOADDRV')
        self.assertFalse(Location.objects.filter(tenant=self.tenant, party=party).exists())

    def test_invalid_vendor_type_is_error(self):
        """Invalid VendorType produces a validation error."""
        row = base_row(Code='BADVT', Name='Bad VT', VendorType='BOGUS')
        f = make_csv(row)
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('VendorType' in e['message'] for e in result['errors']))

    def test_vendor_type_defaults_to_supplier(self):
        """Blank VendorType defaults to SUPPLIER."""
        f = make_csv(base_row(Code='DEFVT', Name='Default VT'))
        self._importer().run(f, commit=True)
        party = Party.objects.get(tenant=self.tenant, code='DEFVT')
        vendor = Vendor.objects.get(tenant=self.tenant, party=party)
        self.assertEqual(vendor.vendor_type, 'SUPPLIER')

    def test_dry_run_does_not_save(self):
        """Dry run does not persist any records."""
        f = make_csv(base_row(Code='DRYVEND'))
        result = self._importer().run(f, commit=False)
        self.assertEqual(result['errors'], [])
        self.assertFalse(Party.objects.filter(tenant=self.tenant, code='DRYVEND').exists())

    def test_update_existing_vendor(self):
        """Re-importing an existing code updates the record."""
        party = Party.objects.create(
            tenant=self.tenant, code='UPDV', display_name='Old Vendor', party_type='VENDOR',
        )
        Vendor.objects.create(tenant=self.tenant, party=party, payment_terms='NET30')
        f = make_csv(base_row(Code='UPDV', Name='Updated Vendor', PaymentTerms='NET90'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        self.assertEqual(result['updated'], 1)
        party.refresh_from_db()
        self.assertEqual(party.display_name, 'Updated Vendor')
        vend = Vendor.objects.get(tenant=self.tenant, party=party)
        self.assertEqual(vend.payment_terms, 'NET90')

    # ------------------------------------------------------------------
    # Merge-semantics tests (F6 / F7)
    # ------------------------------------------------------------------

    def test_blank_email_does_not_overwrite_existing(self):
        """Re-importing with blank Email must not clear a pre-existing email."""
        party = Party.objects.create(
            tenant=self.tenant, code='MERGEVMAIL', display_name='Merge Vendor',
            party_type='VENDOR', main_email='original@vendor.com',
        )
        Vendor.objects.create(tenant=self.tenant, party=party, payment_terms='NET30')
        f = make_csv(base_row(Code='MERGEVMAIL', Name='Merge Vendor', Email=''))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party.refresh_from_db()
        self.assertEqual(party.main_email, 'original@vendor.com')

    def test_non_blank_email_does_update_existing(self):
        """Re-importing with a new non-blank Email must update the field."""
        party = Party.objects.create(
            tenant=self.tenant, code='UPDVEMAIL', display_name='Upd Email Vendor',
            party_type='VENDOR', main_email='old@vendor.com',
        )
        Vendor.objects.create(tenant=self.tenant, party=party, payment_terms='NET30')
        f = make_csv(base_row(Code='UPDVEMAIL', Name='Upd Email Vendor', Email='new@vendor.com'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party.refresh_from_db()
        self.assertEqual(party.main_email, 'new@vendor.com')

    def test_blank_tax_code_does_not_overwrite_existing(self):
        """Re-importing with blank TaxCode must not clear a pre-existing tax code."""
        party = Party.objects.create(
            tenant=self.tenant, code='MERGEVTAX', display_name='Tax Vendor',
            party_type='VENDOR',
        )
        Vendor.objects.create(
            tenant=self.tenant, party=party, payment_terms='NET30', tax_code='VTX-001',
        )
        f = make_csv(base_row(Code='MERGEVTAX', Name='Tax Vendor', TaxCode=''))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        vend = Vendor.objects.get(tenant=self.tenant, party=party)
        self.assertEqual(vend.tax_code, 'VTX-001')

    def test_non_blank_tax_code_does_update_existing(self):
        """Re-importing with a new non-blank TaxCode must update the field."""
        party = Party.objects.create(
            tenant=self.tenant, code='UPDVTAX', display_name='Tax Upd Vendor',
            party_type='VENDOR',
        )
        Vendor.objects.create(
            tenant=self.tenant, party=party, payment_terms='NET30', tax_code='OLD-VTX',
        )
        f = make_csv(base_row(Code='UPDVTAX', Name='Tax Upd Vendor', TaxCode='NEW-VTX'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        vend = Vendor.objects.get(tenant=self.tenant, party=party)
        self.assertEqual(vend.tax_code, 'NEW-VTX')
