"""
Tests for InventoryImporter.
"""
import io
from django.test import TestCase

from apps.tenants.models import Tenant
from apps.items.models import Item, UnitOfMeasure
from apps.warehousing.models import Warehouse
from apps.inventory.models import InventoryBalance, InventoryTransaction
from apps.core.importers import InventoryImporter
from shared.managers import set_current_tenant
from users.models import User


def make_csv(*rows, headers=None):
    if headers is None:
        headers = ['SKU', 'WarehouseCode', 'OnHand']
    lines = [','.join(headers)]
    for row in rows:
        lines.append(','.join(str(v) for v in row))
    f = io.BytesIO('\n'.join(lines).encode('utf-8'))
    f.name = 'test.csv'
    return f


class InventoryImporterTestCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Inv Test Co', subdomain='test-inv-importer')
        cls.user = User.objects.create_user(username='invuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='EA', name='Each')
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='MSPN-000001', name='Test Item', base_uom=cls.uom,
        )
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant, code='MAIN', name='Main WH',
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def _importer(self):
        return InventoryImporter(tenant=self.tenant, user=self.user)

    def test_creates_balance_and_transaction(self):
        """Commit creates InventoryBalance and an ADJUST transaction."""
        f = make_csv(['MSPN-000001', 'MAIN', '50'])
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        self.assertEqual(result['created'], 1)
        bal = InventoryBalance.objects.get(tenant=self.tenant, item=self.item, warehouse=self.warehouse)
        self.assertEqual(bal.on_hand, 50)
        txn = InventoryTransaction.objects.filter(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
            transaction_type='ADJUST',
        ).latest('transaction_date')
        self.assertEqual(txn.quantity, 50)
        self.assertEqual(txn.balance_on_hand, 50)
        self.assertEqual(txn.reference_type, 'IMPORT')

    def test_updates_balance_with_correct_delta(self):
        """Second import calculates delta correctly and records it."""
        InventoryBalance.objects.update_or_create(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
            defaults={'on_hand': 30, 'allocated': 0, 'on_order': 0},
        )
        f = make_csv(['MSPN-000001', 'MAIN', '80'])
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        bal = InventoryBalance.objects.get(tenant=self.tenant, item=self.item, warehouse=self.warehouse)
        self.assertEqual(bal.on_hand, 80)
        txn = InventoryTransaction.objects.filter(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
            transaction_type='ADJUST',
        ).latest('transaction_date')
        self.assertEqual(txn.quantity, 50)  # 80 - 30 = 50

    def test_validation_fails_for_missing_sku(self):
        """SKU not found in DB produces a validation error."""
        f = make_csv(['MSPN-NOTEXIST', 'MAIN', '10'])
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('SKU' in e['message'] for e in result['errors']))

    def test_validation_fails_for_missing_warehouse(self):
        """WarehouseCode not found in DB produces a validation error."""
        f = make_csv(['MSPN-000001', 'NOWHSUCH', '10'])
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('WarehouseCode' in e['message'] for e in result['errors']))

    def test_negative_on_hand_is_error(self):
        """Negative OnHand value produces a validation error."""
        f = make_csv(['MSPN-000001', 'MAIN', '-5'])
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('OnHand' in e['message'] for e in result['errors']))

    def test_non_integer_on_hand_is_error(self):
        """Non-integer OnHand produces a validation error."""
        f = make_csv(['MSPN-000001', 'MAIN', 'abc'])
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('OnHand' in e['message'] for e in result['errors']))

    def test_dry_run_does_not_save(self):
        """Dry run does not create balance or transaction."""
        initial_balance_count = InventoryBalance.objects.filter(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
        ).count()
        f = make_csv(['MSPN-000001', 'MAIN', '25'])
        result = self._importer().run(f, commit=False)
        self.assertEqual(result['errors'], [])
        after_count = InventoryBalance.objects.filter(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
        ).count()
        self.assertEqual(initial_balance_count, after_count)

    def test_missing_required_column_returns_error(self):
        """CSV missing required column returns immediate column error."""
        content = 'SKU,OnHand\nMSPN-000001,50\n'
        f = io.BytesIO(content.encode('utf-8'))
        f.name = 'test.csv'
        result = self._importer().run(f, commit=False)
        self.assertTrue(any('Missing required columns' in e['message'] for e in result['errors']))

    def test_zero_delta_does_not_create_transaction(self):
        """Re-importing the same snapshot (delta == 0) must NOT create a new ADJUST transaction."""
        # Pre-seed balance at exactly 75
        InventoryBalance.objects.update_or_create(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
            defaults={'on_hand': 75, 'allocated': 0, 'on_order': 0},
        )
        # Delete any pre-existing transactions for a clean count
        InventoryTransaction.objects.filter(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
        ).delete()

        # Import the same quantity — delta == 0
        f = make_csv(['MSPN-000001', 'MAIN', '75'])
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])

        txn_count = InventoryTransaction.objects.filter(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
            transaction_type='ADJUST',
        ).count()
        self.assertEqual(txn_count, 0, "Expected no ADJUST transaction when delta is zero.")
