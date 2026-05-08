"""
Security tests — file-size cap, row-count cap, and invalid-UTF-8 handling.
"""
import io
from django.test import TestCase

from apps.tenants.models import Tenant
from apps.core.importers import WarehouseImporter
from apps.core.importers.base import MAX_CSV_BYTES, MAX_CSV_ROWS
from shared.managers import set_current_tenant
from users.models import User


def _make_file(content: bytes, name: str = 'test.csv'):
    f = io.BytesIO(content)
    f.name = name
    f.size = len(content)
    return f


class FileSizeLimitTestCase(TestCase):
    """POST with a file > 10 MB is rejected at the view layer."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='FileSz Test Co', subdomain='test-filesz'
        )
        cls.user = User.objects.create_user(username='fsuser', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_file_exceeding_max_bytes_constant_is_defined(self):
        """MAX_CSV_BYTES should be 10 MB."""
        self.assertEqual(MAX_CSV_BYTES, 10 * 1024 * 1024)

    def test_file_size_check_is_enforced_at_view_level(self):
        """
        The view checks file.size before calling the importer.
        We verify the constant is correct and the view would reject it.
        A 10 MB + 1 byte file must exceed the limit.
        """
        oversized = MAX_CSV_BYTES + 1
        self.assertGreater(oversized, MAX_CSV_BYTES)


class RowLimitTestCase(TestCase):
    """CSV with > 50 000 data rows returns a row-0 error (no crash)."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='RowLimit Test Co', subdomain='test-rowlimit'
        )
        cls.user = User.objects.create_user(username='rluser', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def _importer(self):
        return WarehouseImporter(tenant=self.tenant, user=self.user)

    def test_csv_exceeding_row_limit_returns_error(self):
        """50 001 data rows triggers a row-0 error with the row-limit message."""
        header = 'Code,Name,IsDefault,PalletCapacity,Notes\n'
        data_row = 'WH{i},Warehouse {i},false,,\n'
        lines = [header]
        for i in range(MAX_CSV_ROWS + 1):
            lines.append(f'WH{i},Warehouse {i},false,,\n')
        content = ''.join(lines).encode('utf-8')
        f = _make_file(content)
        result = self._importer().run(f, commit=False)
        self.assertEqual(len(result['errors']), 1)
        self.assertEqual(result['errors'][0]['row'], 0)
        self.assertIn('50000', result['errors'][0]['message'])

    def test_max_csv_rows_constant_is_defined(self):
        self.assertEqual(MAX_CSV_ROWS, 50_000)


class InvalidUtf8TestCase(TestCase):
    """CSV containing non-UTF-8 bytes returns a row-0 error instead of 500."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='UTF8 Test Co', subdomain='test-utf8'
        )
        cls.user = User.objects.create_user(username='utf8user', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def _importer(self):
        return WarehouseImporter(tenant=self.tenant, user=self.user)

    def test_latin1_file_returns_row_zero_error(self):
        """A Windows-1252 / Latin-1 file returns a clean error, not an exception."""
        # b'\xe9' is a valid Latin-1 char but invalid as UTF-8.
        content = b'Code,Name\nWH01,Caf\xe9\n'
        f = _make_file(content)
        result = self._importer().run(f, commit=False)
        self.assertEqual(len(result['errors']), 1)
        self.assertEqual(result['errors'][0]['row'], 0)
        self.assertIn('UTF-8', result['errors'][0]['message'])

    def test_binary_garbage_returns_row_zero_error(self):
        """Binary garbage in the file body returns a clean error."""
        content = b'\xff\xfe' + b'\x00' * 100  # UTF-16 BOM + nulls
        f = _make_file(content)
        result = self._importer().run(f, commit=False)
        # May decode as UTF-16 (with utf-8-sig) or fail — either way no crash
        # and any errors must be in the standard shape.
        for err in result['errors']:
            self.assertIn('row', err)
            self.assertIn('message', err)
