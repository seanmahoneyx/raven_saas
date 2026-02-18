# apps/inventory/tests/test_integration.py
"""
Integration tests for InventoryService: receive, allocate, ship with FIFO costing.
"""
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.warehousing.models import Warehouse
from apps.inventory.models import (
    InventoryLot, InventoryBalance, InventoryTransaction, InventoryLayer,
)
from apps.inventory.services import InventoryService
from apps.accounting.models import Account, AccountType, AccountingSettings, JournalEntry
from shared.managers import set_current_tenant
from users.models import User


class InventoryIntegrationTestCase(TestCase):
    """Integration tests for InventoryService."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Inv Integ Co', subdomain='test-inv-integ')
        cls.user = User.objects.create_user(username='invuser', password='pass')
        set_current_tenant(cls.tenant)

        # UOM
        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='ea', name='Each',
        )

        # Party / Vendor
        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='V-INV',
            display_name='Inventory Vendor',
        )
        cls.vendor = Vendor.objects.create(
            tenant=cls.tenant, party=cls.vend_party,
        )

        # Party / Customer
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C-INV',
            display_name='Inventory Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship', address_line1='1 Main', city='Chicago', state='IL',
            postal_code='60601',
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, party=cls.cust_party,
        )

        # Warehouse (using warehousing app with label='new_warehousing')
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant, name='Main Warehouse', code='MAIN',
            is_default=True,
        )

        # GL Accounts
        cls.inventory_account = Account.objects.create(
            tenant=cls.tenant, code='1200', name='Inventory',
            account_type=AccountType.ASSET_CURRENT,
        )
        cls.ap_account = Account.objects.create(
            tenant=cls.tenant, code='2000', name='AP',
            account_type=AccountType.LIABILITY_CURRENT,
        )
        cls.cogs_account = Account.objects.create(
            tenant=cls.tenant, code='5000', name='COGS',
            account_type=AccountType.EXPENSE_COGS,
        )
        cls.income_account = Account.objects.create(
            tenant=cls.tenant, code='4000', name='Revenue',
            account_type=AccountType.REVENUE,
        )
        cls.ar_account = Account.objects.create(
            tenant=cls.tenant, code='1100', name='AR',
            account_type=AccountType.ASSET_CURRENT,
        )
        cls.cash_account = Account.objects.create(
            tenant=cls.tenant, code='1000', name='Cash',
            account_type=AccountType.ASSET_CURRENT,
        )

        # Item with GL overrides
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='INV-WIDGET', name='Inventory Widget',
            base_uom=cls.uom, income_account=cls.income_account,
            expense_account=cls.cogs_account, asset_account=cls.inventory_account,
        )

        # AccountingSettings
        acct = AccountingSettings.get_for_tenant(cls.tenant)
        acct.default_ar_account = cls.ar_account
        acct.default_ap_account = cls.ap_account
        acct.default_cash_account = cls.cash_account
        acct.default_income_account = cls.income_account
        acct.default_cogs_account = cls.cogs_account
        acct.default_inventory_account = cls.inventory_account
        acct.save()

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = InventoryService(self.tenant, self.user)

    # ── 5.6a: receive_stock creates lot, layer, balance, GL JE ───────────

    def test_receive_stock(self):
        """
        receive_stock creates InventoryLot, FIFO layer, updates balance,
        and posts a balanced GL journal entry (DR Inventory, CR AP).
        """
        lot, pallets, layer = self.svc.receive_stock(
            item=self.item,
            warehouse=self.warehouse,
            quantity=100,
            unit_cost=Decimal('5.00'),
            vendor=self.vendor,
        )

        # Lot created
        self.assertIsNotNone(lot)
        self.assertEqual(lot.item, self.item)
        self.assertEqual(lot.total_quantity, 100)
        self.assertEqual(lot.unit_cost, Decimal('5.00'))

        # Pallets
        self.assertEqual(len(pallets), 1)
        self.assertEqual(pallets[0].quantity_on_hand, 100)

        # FIFO layer
        self.assertEqual(layer.quantity_original, Decimal('100'))
        self.assertEqual(layer.quantity_remaining, Decimal('100'))
        self.assertEqual(layer.unit_cost, Decimal('5.00'))

        # Balance updated
        balance = InventoryBalance.objects.get(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
        )
        self.assertEqual(balance.on_hand, 100)
        self.assertEqual(balance.allocated, 0)

        # GL journal entry created (Inventory DR 500, AP CR 500)
        je = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith='INV-RCV',
        ).latest('id')
        self.assertEqual(je.status, 'posted')
        lines = je.lines.all().order_by('line_number')
        self.assertEqual(lines.count(), 2)
        self.assertEqual(lines[0].debit, Decimal('500.00'))
        self.assertEqual(lines[0].credit, Decimal('0.00'))
        self.assertEqual(lines[1].debit, Decimal('0.00'))
        self.assertEqual(lines[1].credit, Decimal('500.00'))

    # ── 5.6b: allocate_inventory reserves stock ──────────────────────────

    def test_allocate_inventory(self):
        """allocate_inventory increases allocated without changing on_hand."""
        self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=200, unit_cost=Decimal('3.00'), vendor=self.vendor,
        )

        balance = self.svc.allocate_inventory(
            item=self.item, warehouse=self.warehouse, quantity=50,
        )

        self.assertEqual(balance.on_hand, 200)
        self.assertEqual(balance.allocated, 50)
        self.assertEqual(balance.available, 150)

    # ── 5.6c: allocate raises ValidationError when insufficient ──────────

    def test_allocate_insufficient_raises(self):
        """Allocating more than available raises ValidationError."""
        self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=10, unit_cost=Decimal('2.00'), vendor=self.vendor,
        )

        with self.assertRaises(ValidationError):
            self.svc.allocate_inventory(
                item=self.item, warehouse=self.warehouse, quantity=20,
            )

    # ── 5.6d: ship_stock depletes FIFO layers and creates COGS JE ───────

    def test_ship_stock_fifo(self):
        """
        ship_stock depletes oldest FIFO layers first and creates a
        COGS journal entry (DR COGS, CR Inventory).
        """
        # Receive two batches at different costs
        self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=60, unit_cost=Decimal('5.00'), vendor=self.vendor,
        )
        self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=40, unit_cost=Decimal('7.00'), vendor=self.vendor,
        )

        # Allocate first so we can ship
        self.svc.allocate_inventory(
            item=self.item, warehouse=self.warehouse, quantity=80,
        )

        # Ship 80 units: should consume 60 @ $5 + 20 @ $7 = $440 COGS
        result = self.svc.ship_stock(
            item=self.item, warehouse=self.warehouse, quantity=80,
        )

        # FIFO consumption
        expected_cogs = Decimal('60') * Decimal('5.00') + Decimal('20') * Decimal('7.00')
        self.assertEqual(result['total_cogs'], expected_cogs)
        self.assertEqual(len(result['layers_consumed']), 2)

        # First layer should be fully depleted
        first_layer = InventoryLayer.objects.filter(
            tenant=self.tenant, item=self.item,
        ).order_by('date_received').first()
        self.assertEqual(first_layer.quantity_remaining, Decimal('0'))
        self.assertTrue(first_layer.is_depleted)

        # Second layer should have 20 remaining
        second_layer = InventoryLayer.objects.filter(
            tenant=self.tenant, item=self.item,
        ).order_by('date_received').last()
        self.assertEqual(second_layer.quantity_remaining, Decimal('20'))

        # Balance updated
        balance = InventoryBalance.objects.get(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
        )
        self.assertEqual(balance.on_hand, 20)  # 100 received - 80 shipped

        # COGS journal entry
        je = result['journal_entry']
        self.assertEqual(je.status, 'posted')
        cogs_line = je.lines.get(line_number=10)
        inv_line = je.lines.get(line_number=20)
        self.assertEqual(cogs_line.debit, expected_cogs)
        self.assertEqual(inv_line.credit, expected_cogs)

    # ── 5.6e: Full cycle: receive -> allocate -> ship ────────────────────

    def test_full_inventory_cycle(self):
        """
        Full cycle: receive stock, allocate for order, ship with FIFO,
        verify final balance and transaction audit trail.
        """
        # 1. Receive
        lot, pallets, layer = self.svc.receive_stock(
            item=self.item, warehouse=self.warehouse,
            quantity=500, unit_cost=Decimal('4.50'), vendor=self.vendor,
        )
        balance = self.svc.get_balance(self.item, self.warehouse)
        self.assertEqual(balance.on_hand, 500)

        # 2. Allocate
        self.svc.allocate_inventory(
            item=self.item, warehouse=self.warehouse, quantity=200,
        )
        balance.refresh_from_db()
        self.assertEqual(balance.allocated, 200)
        self.assertEqual(balance.available, 300)

        # 3. Ship
        result = self.svc.ship_stock(
            item=self.item, warehouse=self.warehouse, quantity=200,
        )
        balance.refresh_from_db()
        self.assertEqual(balance.on_hand, 300)
        self.assertEqual(balance.allocated, 0)  # Allocation cleared

        # COGS = 200 * 4.50 = 900
        self.assertEqual(result['total_cogs'], Decimal('200') * Decimal('4.50'))

        # Layer partially depleted
        layer.refresh_from_db()
        self.assertEqual(layer.quantity_remaining, Decimal('300'))

        # Audit trail: RECEIPT + ALLOCATE + ISSUE transactions
        txns = InventoryTransaction.objects.filter(
            tenant=self.tenant, item=self.item,
        ).order_by('id')
        txn_types = list(txns.values_list('transaction_type', flat=True))
        self.assertIn('RECEIPT', txn_types)
        self.assertIn('ALLOCATE', txn_types)
        self.assertIn('ISSUE', txn_types)
