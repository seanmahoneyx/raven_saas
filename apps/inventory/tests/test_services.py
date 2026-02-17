# apps/inventory/tests/test_services.py
"""
Tests for InventoryService: receive, allocate, deallocate, issue, adjust, ship, on_order.
"""
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError

from apps.tenants.models import Tenant
from apps.parties.models import Party, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.warehousing.models import Warehouse
from apps.accounting.models import Account, AccountType, AccountingSettings
from apps.inventory.models import InventoryBalance, InventoryTransaction, InventoryLot, InventoryLayer
from apps.inventory.services import InventoryService
from shared.managers import set_current_tenant
from users.models import User


class InventoryServiceTestCase(TestCase):
    """Base test case with shared setup for inventory service tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Inv Test Co', subdomain='test-inv')
        cls.user = User.objects.create_user(username='invtester', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='V1', display_name='Vendor One',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party)
        cls.wh_location = Location.objects.create(
            tenant=cls.tenant, party=cls.vend_party, location_type='WAREHOUSE',
            name='WH Loc', address_line1='1 WH Rd', city='Chicago', state='IL', postal_code='60601',
        )
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant, name='Main', code='MAIN', is_default=True, location=cls.wh_location,
        )

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='INV-001', name='Inventory Widget',
            base_uom=cls.uom, is_inventory=True,
        )

        # Accounting
        cls.inv_account = Account.objects.create(
            tenant=cls.tenant, code='1200', name='Inventory', account_type=AccountType.ASSET_CURRENT,
        )
        cls.ap_account = Account.objects.create(
            tenant=cls.tenant, code='2000', name='AP', account_type=AccountType.LIABILITY_CURRENT,
        )
        cls.cogs_account = Account.objects.create(
            tenant=cls.tenant, code='5000', name='COGS', account_type=AccountType.EXPENSE_COGS,
        )
        cls.item.asset_account = cls.inv_account
        cls.item.expense_account = cls.cogs_account
        cls.item.save()

        acct = AccountingSettings.get_for_tenant(cls.tenant)
        acct.default_inventory_account = cls.inv_account
        acct.default_ap_account = cls.ap_account
        acct.default_cogs_account = cls.cogs_account
        acct.save()

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = InventoryService(self.tenant, self.user)


class ReceiveInventoryTest(InventoryServiceTestCase):
    """Tests for receive_inventory."""

    def test_receive_creates_lot_and_pallets(self):
        lot, pallets = self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=1000, unit_cost=Decimal('5.00'), vendor=self.vendor,
        )
        self.assertIsNotNone(lot.pk)
        self.assertEqual(lot.total_quantity, 1000)
        self.assertEqual(len(pallets), 1)
        self.assertEqual(pallets[0].quantity_on_hand, 1000)

    def test_receive_multiple_pallets(self):
        lot, pallets = self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=1000, unit_cost=Decimal('5.00'),
            pallet_quantities=[250, 250, 250, 250],
        )
        self.assertEqual(len(pallets), 4)
        self.assertEqual(sum(p.quantity_on_hand for p in pallets), 1000)

    def test_receive_mismatched_pallet_quantities_raises(self):
        with self.assertRaises(ValidationError):
            self.svc.receive_inventory(
                item=self.item, warehouse=self.warehouse,
                quantity=1000, unit_cost=Decimal('5.00'),
                pallet_quantities=[250, 250],
            )

    def test_receive_updates_balance(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=500, unit_cost=Decimal('5.00'),
        )
        balance = InventoryBalance.objects.get(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
        )
        self.assertEqual(balance.on_hand, 500)

    def test_receive_creates_transaction(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=100, unit_cost=Decimal('5.00'),
        )
        txn = InventoryTransaction.objects.filter(
            tenant=self.tenant, item=self.item, transaction_type='RECEIPT',
        ).first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.quantity, 100)


class ReceiveStockTest(InventoryServiceTestCase):
    """Tests for receive_stock (with FIFO layer and GL entry)."""

    def test_receive_stock_creates_fifo_layer(self):
        lot, pallets, layer = self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=200, unit_cost=Decimal('5.00'),
        )
        self.assertIsNotNone(layer.pk)
        self.assertEqual(layer.quantity_original, Decimal('200'))
        self.assertEqual(layer.quantity_remaining, Decimal('200'))
        self.assertEqual(layer.unit_cost, Decimal('5.00'))

    def test_receive_stock_creates_journal_entry(self):
        from apps.accounting.models import JournalEntry
        lot, pallets, layer = self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=100, unit_cost=Decimal('10.00'),
        )
        je = JournalEntry.objects.filter(
            tenant=self.tenant, entry_number__startswith='INV-RCV-',
        ).first()
        self.assertIsNotNone(je)
        self.assertEqual(je.status, 'posted')
        # Verify debit/credit lines
        lines = je.lines.all()
        total_debit = sum(l.debit for l in lines)
        total_credit = sum(l.credit for l in lines)
        self.assertEqual(total_debit, Decimal('1000.00'))
        self.assertEqual(total_credit, Decimal('1000.00'))


class AllocateInventoryTest(InventoryServiceTestCase):
    """Tests for allocate_inventory."""

    def test_allocate_increases_allocated(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=500, unit_cost=Decimal('5.00'),
        )
        balance = self.svc.allocate_inventory(
            item=self.item, warehouse=self.warehouse, quantity=100,
        )
        self.assertEqual(balance.allocated, 100)
        self.assertEqual(balance.available, 400)

    def test_allocate_insufficient_raises(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=50, unit_cost=Decimal('5.00'),
        )
        with self.assertRaises(ValidationError):
            self.svc.allocate_inventory(
                item=self.item, warehouse=self.warehouse, quantity=100,
            )


class DeallocateInventoryTest(InventoryServiceTestCase):
    """Tests for deallocate_inventory."""

    def test_deallocate_reduces_allocated(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=500, unit_cost=Decimal('5.00'),
        )
        self.svc.allocate_inventory(item=self.item, warehouse=self.warehouse, quantity=200)
        balance = self.svc.deallocate_inventory(
            item=self.item, warehouse=self.warehouse, quantity=100,
        )
        self.assertEqual(balance.allocated, 100)

    def test_deallocate_floors_at_zero(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=100, unit_cost=Decimal('5.00'),
        )
        self.svc.allocate_inventory(item=self.item, warehouse=self.warehouse, quantity=50)
        balance = self.svc.deallocate_inventory(
            item=self.item, warehouse=self.warehouse, quantity=100,
        )
        self.assertEqual(balance.allocated, 0)


class IssueInventoryTest(InventoryServiceTestCase):
    """Tests for issue_inventory."""

    def test_issue_reduces_on_hand(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=500, unit_cost=Decimal('5.00'),
        )
        balance = self.svc.issue_inventory(
            item=self.item, warehouse=self.warehouse, quantity=100,
        )
        self.assertEqual(balance.on_hand, 400)

    def test_issue_insufficient_raises(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=50, unit_cost=Decimal('5.00'),
        )
        with self.assertRaises(ValidationError):
            self.svc.issue_inventory(
                item=self.item, warehouse=self.warehouse, quantity=100,
            )


class AdjustInventoryTest(InventoryServiceTestCase):
    """Tests for adjust_inventory."""

    def test_positive_adjustment(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=100, unit_cost=Decimal('5.00'),
        )
        balance = self.svc.adjust_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity_change=50, reason='Found stock',
        )
        self.assertEqual(balance.on_hand, 150)

    def test_negative_adjustment(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=100, unit_cost=Decimal('5.00'),
        )
        balance = self.svc.adjust_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity_change=-30, reason='Shrinkage',
        )
        self.assertEqual(balance.on_hand, 70)

    def test_negative_beyond_on_hand_raises(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=50, unit_cost=Decimal('5.00'),
        )
        with self.assertRaises(ValidationError):
            self.svc.adjust_inventory(
                item=self.item, warehouse=self.warehouse,
                quantity_change=-100, reason='Bad count',
            )


class ShipStockTest(InventoryServiceTestCase):
    """Tests for ship_stock (FIFO COGS)."""

    def test_ship_stock_depletes_fifo_layers(self):
        self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=100, unit_cost=Decimal('5.00'),
        )
        result = self.svc.ship_stock(
            item=self.item, warehouse=self.warehouse, quantity=60,
        )
        self.assertEqual(result['total_cogs'], Decimal('300.00'))
        layer = InventoryLayer.objects.get(tenant=self.tenant, item=self.item)
        self.assertEqual(layer.quantity_remaining, Decimal('40'))

    def test_ship_stock_insufficient_layers_raises(self):
        self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=10, unit_cost=Decimal('5.00'),
        )
        with self.assertRaises(ValidationError):
            self.svc.ship_stock(
                item=self.item, warehouse=self.warehouse, quantity=100,
            )


class OnOrderTest(InventoryServiceTestCase):
    """Tests for add_on_order and remove_on_order."""

    def test_add_on_order(self):
        balance = self.svc.add_on_order(
            item=self.item, warehouse=self.warehouse, quantity=500,
        )
        self.assertEqual(balance.on_order, 500)

    def test_remove_on_order(self):
        self.svc.add_on_order(item=self.item, warehouse=self.warehouse, quantity=500)
        balance = self.svc.remove_on_order(
            item=self.item, warehouse=self.warehouse, quantity=200,
        )
        self.assertEqual(balance.on_order, 300)

    def test_remove_on_order_floors_at_zero(self):
        self.svc.add_on_order(item=self.item, warehouse=self.warehouse, quantity=100)
        balance = self.svc.remove_on_order(
            item=self.item, warehouse=self.warehouse, quantity=500,
        )
        self.assertEqual(balance.on_order, 0)


class RecalculateBalanceTest(InventoryServiceTestCase):
    """Tests for recalculate_balance."""

    def test_recalculate_from_transactions(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=1000, unit_cost=Decimal('5.00'),
        )
        self.svc.allocate_inventory(item=self.item, warehouse=self.warehouse, quantity=200)
        self.svc.issue_inventory(item=self.item, warehouse=self.warehouse, quantity=100)

        # Corrupt the balance manually
        bal = InventoryBalance.objects.get(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
        )
        bal.on_hand = 9999
        bal.allocated = 9999
        bal.save()

        # Recalculate
        balance = self.svc.recalculate_balance(item=self.item, warehouse=self.warehouse)
        self.assertEqual(balance.on_hand, 900)
        # issue_inventory reduces allocated on balance directly but doesn't create
        # a DEALLOCATE transaction, so recalculate from txns restores the ALLOCATE total
        self.assertEqual(balance.allocated, 200)


class QueryMethodsTest(InventoryServiceTestCase):
    """Tests for query methods: get_balance, get_available, get_lots_for_item."""

    def test_get_balance(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=100, unit_cost=Decimal('5.00'),
        )
        balance = self.svc.get_balance(self.item, self.warehouse)
        self.assertEqual(balance.on_hand, 100)

    def test_get_available(self):
        self.svc.receive_inventory(
            item=self.item, warehouse=self.warehouse,
            quantity=100, unit_cost=Decimal('5.00'),
        )
        self.svc.allocate_inventory(item=self.item, warehouse=self.warehouse, quantity=30)
        available = self.svc.get_available(self.item, self.warehouse)
        self.assertEqual(available, 70)

    def test_get_available_no_balance(self):
        available = self.svc.get_available(self.item, self.warehouse)
        self.assertEqual(available, 0)
