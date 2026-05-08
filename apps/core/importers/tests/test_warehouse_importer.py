"""
Tests for WarehouseImporter.
"""
import io
from django.test import TestCase

from apps.tenants.models import Tenant
from apps.warehousing.models import Warehouse
from apps.core.importers import WarehouseImporter
from shared.managers import set_current_tenant
from users.models import User


def make_csv(*rows, headers=None):
    """Build an in-memory CSV file-like object."""
    if headers is None:
        headers = ['Code', 'Name', 'IsDefault', 'PalletCapacity', 'Notes']
    lines = [','.join(headers)]
    for row in rows:
        lines.append(','.join(str(v) for v in row))
    content = '\n'.join(lines)
    f = io.BytesIO(content.encode('utf-8'))
    f.name = 'test.csv'
    return f


class WarehouseImporterTestCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='WH Test Co', subdomain='test-wh-importer')
        cls.user = User.objects.create_user(username='whuser', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def _importer(self):
        return WarehouseImporter(tenant=self.tenant, user=self.user)

    def test_dry_run_validates_without_saving(self):
        """Dry run with valid data returns no errors but does not create records."""
        f = make_csv(['MAIN', 'Main Warehouse', 'true', '500', 'Primary WH'])
        result = self._importer().run(f, commit=False)
        self.assertEqual(result['errors'], [])
        self.assertEqual(result['valid'], 1)
        self.assertFalse(Warehouse.objects.filter(tenant=self.tenant, code='MAIN').exists())

    def test_commit_creates_warehouse(self):
        """Commit mode creates the warehouse record."""
        f = make_csv(['WH01', 'Warehouse One', 'false', '200', ''])
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        self.assertEqual(result['created'], 1)
        wh = Warehouse.objects.get(tenant=self.tenant, code='WH01')
        self.assertEqual(wh.name, 'Warehouse One')
        self.assertEqual(wh.pallet_capacity, 200)
        self.assertFalse(wh.is_default)

    def test_duplicate_code_updates_existing(self):
        """Importing a code that already exists updates rather than errors."""
        Warehouse.objects.create(
            tenant=self.tenant, code='UPD', name='Old Name', is_active=True,
        )
        f = make_csv(['UPD', 'New Name', 'false', '', ''])
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        self.assertEqual(result['updated'], 1)
        wh = Warehouse.objects.get(tenant=self.tenant, code='UPD')
        self.assertEqual(wh.name, 'New Name')

    def test_missing_code_is_error(self):
        """Row with blank Code produces a validation error."""
        f = make_csv(['', 'No Code WH', '', '', ''])
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('Code' in e['message'] for e in result['errors']))

    def test_missing_name_is_error(self):
        """Row with blank Name produces a validation error."""
        f = make_csv(['NONAME', '', '', '', ''])
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('Name' in e['message'] for e in result['errors']))

    def test_invalid_pallet_capacity_is_error(self):
        """Non-integer PalletCapacity produces a validation error."""
        f = make_csv(['BADCAP', 'Bad Cap WH', 'false', 'abc', ''])
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('PalletCapacity' in e['message'] for e in result['errors']))

    def test_is_default_parsed_correctly(self):
        """IsDefault=true sets is_default=True on the warehouse."""
        f = make_csv(['DEFWH', 'Default WH', 'true', '', ''])
        self._importer().run(f, commit=True)
        wh = Warehouse.objects.get(tenant=self.tenant, code='DEFWH')
        self.assertTrue(wh.is_default)

    def test_missing_required_column_returns_error(self):
        """CSV missing a required column returns an immediate column error."""
        content = 'Name\nMain Warehouse\n'
        f = io.BytesIO(content.encode('utf-8'))
        f.name = 'test.csv'
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('Missing required columns' in e['message'] for e in result['errors']))
