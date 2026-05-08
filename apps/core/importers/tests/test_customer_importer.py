"""
Tests for CustomerImporter.
"""
import io
from django.test import TestCase

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location, Vendor
from apps.core.importers import CustomerImporter
from shared.managers import set_current_tenant
from users.models import User


HEADERS = [
    'Code', 'Name', 'PaymentTerms', 'LegalName', 'Email', 'Phone', 'Notes',
    'CustomerType', 'TaxCode', 'ResaleNumber', 'CreditLimit', 'ChargeFreight',
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
        'Code': 'CUST001', 'Name': 'Acme Corp', 'PaymentTerms': 'NET30',
        'LegalName': '', 'Email': '', 'Phone': '', 'Notes': '',
        'CustomerType': '', 'TaxCode': '', 'ResaleNumber': '',
        'CreditLimit': '', 'ChargeFreight': '',
        'Address1': '', 'Address2': '', 'City': '', 'State': '',
        'PostalCode': '', 'Country': '',
    }
    defaults.update(overrides)
    return [defaults[h] for h in HEADERS]


class CustomerImporterTestCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Cust Test Co', subdomain='test-cust-importer')
        cls.user = User.objects.create_user(username='custuser', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def _importer(self):
        return CustomerImporter(tenant=self.tenant, user=self.user)

    def test_creates_party_with_customer_type(self):
        """Importing a new code creates Party(party_type=CUSTOMER) and Customer."""
        f = make_csv(base_row(Code='NEWCUST', Name='New Customer'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='NEWCUST')
        self.assertEqual(party.party_type, 'CUSTOMER')
        self.assertTrue(Customer.objects.filter(tenant=self.tenant, party=party).exists())

    def test_existing_vendor_party_promoted_to_both(self):
        """If existing party is VENDOR, importing as customer promotes it to BOTH."""
        party = Party.objects.create(
            tenant=self.tenant, code='DUAL', display_name='Dual Party',
            party_type='VENDOR',
        )
        Vendor.objects.create(tenant=self.tenant, party=party)
        f = make_csv(base_row(Code='DUAL', Name='Dual Party'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party.refresh_from_db()
        self.assertEqual(party.party_type, 'BOTH')
        self.assertTrue(Customer.objects.filter(tenant=self.tenant, party=party).exists())

    def test_existing_other_party_promoted_to_customer(self):
        """If existing party is OTHER, it is promoted to CUSTOMER."""
        Party.objects.create(
            tenant=self.tenant, code='OTHER1', display_name='Other Party',
            party_type='OTHER',
        )
        f = make_csv(base_row(Code='OTHER1', Name='Other Party'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='OTHER1')
        self.assertEqual(party.party_type, 'CUSTOMER')

    def test_address1_creates_location(self):
        """When Address1 is provided a SHIP_TO Location is created."""
        row = base_row(
            Code='ADDRTEST', Name='Addr Customer',
            Address1='100 Main St', City='Chicago', State='IL', PostalCode='60601',
        )
        f = make_csv(row)
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='ADDRTEST')
        loc = Location.objects.get(tenant=self.tenant, party=party, name='Imported Address')
        self.assertEqual(loc.location_type, 'SHIP_TO')
        self.assertEqual(loc.address_line1, '100 Main St')
        self.assertEqual(loc.city, 'Chicago')

    def test_no_address1_no_location(self):
        """When Address1 is absent no Location is created."""
        f = make_csv(base_row(Code='NOADDR', Name='No Addr Customer'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='NOADDR')
        self.assertFalse(Location.objects.filter(tenant=self.tenant, party=party).exists())

    def test_address1_without_city_is_error(self):
        """Address1 without City/State/PostalCode produces validation errors."""
        row = base_row(Code='BADADD', Name='Bad Addr', Address1='100 Main St')
        f = make_csv(row)
        result = self._importer().run(f, commit=False)
        messages = [e['message'] for e in result['errors']]
        self.assertTrue(any('City' in m for m in messages))
        self.assertTrue(any('State' in m for m in messages))
        self.assertTrue(any('PostalCode' in m for m in messages))

    def test_invalid_customer_type_is_error(self):
        """Invalid CustomerType value produces a validation error."""
        row = base_row(Code='BADTYPE', Name='Bad Type', CustomerType='BOGUS')
        f = make_csv(row)
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('CustomerType' in e['message'] for e in result['errors']))

    def test_negative_credit_limit_is_error(self):
        """Negative CreditLimit produces a validation error."""
        row = base_row(Code='NEGCRED', Name='Neg Credit', CreditLimit='-100')
        f = make_csv(row)
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('CreditLimit' in e['message'] for e in result['errors']))

    def test_dry_run_does_not_save(self):
        """Dry run does not persist any records."""
        f = make_csv(base_row(Code='DRYRUN'))
        result = self._importer().run(f, commit=False)
        self.assertEqual(result['errors'], [])
        self.assertFalse(Party.objects.filter(tenant=self.tenant, code='DRYRUN').exists())

    def test_update_existing_customer(self):
        """Re-importing an existing code updates the record."""
        party = Party.objects.create(
            tenant=self.tenant, code='UPDC', display_name='Old Name', party_type='CUSTOMER',
        )
        Customer.objects.create(tenant=self.tenant, party=party, payment_terms='NET30')
        f = make_csv(base_row(Code='UPDC', Name='New Name', PaymentTerms='NET60'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        self.assertEqual(result['updated'], 1)
        party.refresh_from_db()
        self.assertEqual(party.display_name, 'New Name')
        cust = Customer.objects.get(tenant=self.tenant, party=party)
        self.assertEqual(cust.payment_terms, 'NET60')

    # ------------------------------------------------------------------
    # Merge-semantics tests (F6 / F7)
    # ------------------------------------------------------------------

    def test_blank_email_does_not_overwrite_existing(self):
        """Re-importing with blank Email must not clear a pre-existing email."""
        party = Party.objects.create(
            tenant=self.tenant, code='MERGEEMAIL', display_name='Merge Co',
            party_type='CUSTOMER', main_email='original@example.com',
        )
        Customer.objects.create(tenant=self.tenant, party=party, payment_terms='NET30')
        # Row has blank Email
        f = make_csv(base_row(Code='MERGEEMAIL', Name='Merge Co', Email=''))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party.refresh_from_db()
        self.assertEqual(party.main_email, 'original@example.com')

    def test_non_blank_email_does_update_existing(self):
        """Re-importing with a new non-blank Email must update the field."""
        party = Party.objects.create(
            tenant=self.tenant, code='UPDCEMAIL', display_name='Upd Email Co',
            party_type='CUSTOMER', main_email='old@example.com',
        )
        Customer.objects.create(tenant=self.tenant, party=party, payment_terms='NET30')
        f = make_csv(base_row(Code='UPDCEMAIL', Name='Upd Email Co', Email='new@example.com'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party.refresh_from_db()
        self.assertEqual(party.main_email, 'new@example.com')

    def test_blank_tax_code_does_not_overwrite_existing(self):
        """Re-importing with blank TaxCode must not clear a pre-existing tax code."""
        party = Party.objects.create(
            tenant=self.tenant, code='MERGETAX', display_name='Tax Co',
            party_type='CUSTOMER',
        )
        Customer.objects.create(
            tenant=self.tenant, party=party, payment_terms='NET30', tax_code='TX-001',
        )
        f = make_csv(base_row(Code='MERGETAX', Name='Tax Co', TaxCode=''))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        cust = Customer.objects.get(tenant=self.tenant, party=party)
        self.assertEqual(cust.tax_code, 'TX-001')

    def test_non_blank_tax_code_does_update_existing(self):
        """Re-importing with a new non-blank TaxCode must update the field."""
        party = Party.objects.create(
            tenant=self.tenant, code='UPDCTAX', display_name='Tax Upd Co',
            party_type='CUSTOMER',
        )
        Customer.objects.create(
            tenant=self.tenant, party=party, payment_terms='NET30', tax_code='OLD-TAX',
        )
        f = make_csv(base_row(Code='UPDCTAX', Name='Tax Upd Co', TaxCode='NEW-TAX'))
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        cust = Customer.objects.get(tenant=self.tenant, party=party)
        self.assertEqual(cust.tax_code, 'NEW-TAX')
