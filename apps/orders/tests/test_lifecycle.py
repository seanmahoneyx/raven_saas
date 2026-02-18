# apps/orders/tests/test_lifecycle.py
"""
End-to-end order lifecycle test: PO receive -> SO confirm -> ship -> invoice -> payment.
"""
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.warehousing.models import Warehouse
from apps.orders.models import (
    PurchaseOrder, PurchaseOrderLine,
    SalesOrder, SalesOrderLine,
)
from apps.orders.services import OrderService
from apps.inventory.models import InventoryBalance, InventoryLayer
from apps.invoicing.models import Invoice, InvoiceLine
from apps.invoicing.services import InvoicingService
from apps.accounting.models import (
    Account, AccountType, AccountingSettings, JournalEntry, JournalEntryLine,
)
from shared.managers import set_current_tenant
from users.models import User


class OrderLifecycleTestCase(TestCase):
    """
    Task 5.7: Full order-to-cash E2E lifecycle test.

    Flow:
    1. Create + confirm PO (adds on_order)
    2. Receive PO (creates inventory lot, FIFO layer, GL entry, vendor bill)
    3. Create + confirm SO (allocates inventory)
    4. Invoice the SO and post it (creates AR JE)
    5. Record payment (creates Cash/AR JE)
    6. Verify GL balances at each step
    """

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Lifecycle Co', subdomain='test-lifecycle')
        cls.user = User.objects.create_user(username='lcuser', password='pass')
        set_current_tenant(cls.tenant)

        # UOM
        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='ea', name='Each',
        )

        # Vendor
        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='V-LC',
            display_name='LC Vendor',
        )
        cls.vendor = Vendor.objects.create(
            tenant=cls.tenant, party=cls.vend_party,
        )

        # Customer
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C-LC',
            display_name='LC Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship To', address_line1='1 Main', city='Chicago', state='IL',
            postal_code='60601',
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, party=cls.cust_party,
        )

        # Warehouse receiving location (used as ship_to on PO)
        # Need a party to attach the receiving location to; use a generic party
        cls.wh_party = Party.objects.create(
            tenant=cls.tenant, party_type='OTHER', code='WH-LC',
            display_name='LC Warehouse Party',
        )
        cls.wh_location = Location.objects.create(
            tenant=cls.tenant, party=cls.wh_party, location_type='WAREHOUSE',
            name='Receiving Dock', address_line1='1 Warehouse Way',
            city='Chicago', state='IL', postal_code='60601',
        )

        # Warehouse
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant, name='LC Warehouse', code='LCWH',
            is_default=True,
        )

        # GL Accounts
        cls.ar_account = Account.objects.create(
            tenant=cls.tenant, code='1100', name='AR',
            account_type=AccountType.ASSET_CURRENT,
        )
        cls.ap_account = Account.objects.create(
            tenant=cls.tenant, code='2000', name='AP',
            account_type=AccountType.LIABILITY_CURRENT,
        )
        cls.cash_account = Account.objects.create(
            tenant=cls.tenant, code='1000', name='Cash',
            account_type=AccountType.ASSET_CURRENT,
        )
        cls.income_account = Account.objects.create(
            tenant=cls.tenant, code='4000', name='Revenue',
            account_type=AccountType.REVENUE,
        )
        cls.cogs_account = Account.objects.create(
            tenant=cls.tenant, code='5000', name='COGS',
            account_type=AccountType.EXPENSE_COGS,
        )
        cls.inventory_account = Account.objects.create(
            tenant=cls.tenant, code='1200', name='Inventory',
            account_type=AccountType.ASSET_CURRENT,
        )

        # Item
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='LC-WIDGET', name='Lifecycle Widget',
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

    def test_full_order_to_cash_lifecycle(self):
        """
        Complete order-to-cash lifecycle:
        PO confirm -> PO receive -> SO confirm -> Invoice -> Payment.
        Verifies inventory, GL entries, and status transitions at each step.
        """
        order_svc = OrderService(self.tenant, self.user)
        inv_svc = InvoicingService(self.tenant, self.user)
        today = timezone.now().date()

        # ── Step 1: Create and confirm PO ────────────────────────────────
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            vendor=self.vendor,
            po_number='PO-LC-000001',
            order_date=today,
            status='draft',
            ship_to=self.wh_location,
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant,
            purchase_order=po,
            line_number=10,
            item=self.item,
            quantity_ordered=100,
            uom=self.uom,
            unit_cost=Decimal('5.00'),
        )

        order_svc.confirm_purchase_order(po)
        po.refresh_from_db()
        self.assertEqual(po.status, 'confirmed')

        # on_order should increase
        balance = InventoryBalance.objects.get(
            tenant=self.tenant, item=self.item, warehouse=self.warehouse,
        )
        self.assertEqual(balance.on_order, 100)

        # ── Step 2: Receive PO ───────────────────────────────────────────
        result = order_svc.receive_purchase_order(po)
        po.refresh_from_db()
        self.assertEqual(po.status, 'complete')
        self.assertTrue(len(result['lots_created']) > 0)

        # Inventory on_hand should increase, on_order should decrease
        balance.refresh_from_db()
        self.assertEqual(balance.on_hand, 100)
        self.assertEqual(balance.on_order, 0)

        # FIFO layer created
        layers = InventoryLayer.objects.filter(
            tenant=self.tenant, item=self.item,
        )
        self.assertEqual(layers.count(), 1)
        self.assertEqual(layers.first().unit_cost, Decimal('5.00'))

        # GL: Inventory receipt JE exists
        inv_jes = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith='INV-RCV',
        )
        self.assertTrue(inv_jes.exists())

        # ── Step 3: Create and confirm SO ────────────────────────────────
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-LC-000001',
            order_date=today,
            status='draft',
            ship_to=self.cust_location,
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=so,
            line_number=10,
            item=self.item,
            quantity_ordered=50,
            uom=self.uom,
            unit_price=Decimal('10.00'),
        )

        order_svc.confirm_sales_order(so)
        so.refresh_from_db()
        self.assertEqual(so.status, 'confirmed')

        # Inventory allocated
        balance.refresh_from_db()
        self.assertEqual(balance.allocated, 50)
        self.assertEqual(balance.available, 50)

        # ── Step 4: Create and post invoice ──────────────────────────────
        invoice = inv_svc.create_invoice_from_order(so)
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.customer, self.customer)
        self.assertEqual(invoice.total_amount, Decimal('500.00'))  # 50 * 10

        # Post invoice
        inv_svc.post_invoice(invoice)
        invoice.refresh_from_db()
        self.assertIn(invoice.status, ('posted', 'sent'))

        # GL: Invoice posting JE (DR AR, CR Income)
        inv_posting_je = JournalEntry.objects.filter(
            tenant=self.tenant,
            memo__icontains='Invoice',
        ).exclude(entry_number__startswith='INV-RCV').latest('id')
        self.assertEqual(inv_posting_je.status, 'posted')
        self.assertTrue(inv_posting_je.is_balanced)

        # ── Step 5: Record payment ───────────────────────────────────────
        inv_svc.record_payment(invoice, Decimal('500.00'))
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal('500.00'))
        self.assertEqual(invoice.balance_due, Decimal('0.00'))

        # GL: Payment JE (DR Cash, CR AR)
        payment_jes = JournalEntry.objects.filter(
            tenant=self.tenant,
            memo__icontains='Payment',
        )
        self.assertTrue(payment_jes.exists())
        payment_je = payment_jes.latest('id')
        self.assertTrue(payment_je.is_balanced)

        # ── Step 6: Verify overall GL integrity ──────────────────────────
        # All journal entries should be balanced
        all_jes = JournalEntry.objects.filter(tenant=self.tenant, status='posted')
        for je in all_jes:
            total_dr = sum(line.debit for line in je.lines.all())
            total_cr = sum(line.credit for line in je.lines.all())
            self.assertEqual(
                total_dr, total_cr,
                f"JE {je.entry_number} is unbalanced: DR={total_dr}, CR={total_cr}",
            )
