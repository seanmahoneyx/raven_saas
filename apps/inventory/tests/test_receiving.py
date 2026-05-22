# apps/inventory/tests/test_receiving.py
"""
Tests for the ReceivingService and Receipt → Bill flow.

Covers:
- A receipt posts inventory + a balanced Dr Inventory / Cr GR/IR JE
- Partial receipts roll up to PO status correctly
- create_bill_from_receipts links bill lines back, posts Dr GR/IR / Cr A/P
- Cannot double-bill the same receipt line beyond its quantity
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import Account, AccountType, AccountingSettings
from apps.inventory.models import ItemReceipt, ItemReceiptLine
from apps.inventory.services import ReceivingService
from apps.invoicing.services import VendorBillService
from apps.items.models import Item, UnitOfMeasure
from apps.orders.models import PurchaseOrder, PurchaseOrderLine
from apps.parties.models import Location, Party, Vendor
from apps.tenants.models import Tenant
from apps.warehousing.models import Warehouse
from shared.managers import set_current_tenant


User = get_user_model()


class ReceivingServiceTestBase(TestCase):
    """Shared fixtures for receiving tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='Receipt Co', subdomain='recv-co', is_default=True,
        )
        cls.user = User.objects.create_user(
            username='recvuser', email='r@test.com', password='pw',
        )

        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        # GL accounts
        cls.inventory_acct = Account.objects.create(
            tenant=cls.tenant, code='1230', name='Inventory',
            account_type=AccountType.ASSET_CURRENT,
        )
        cls.grir_acct = Account.objects.create(
            tenant=cls.tenant, code='2050', name='GR/IR',
            account_type=AccountType.LIABILITY_CURRENT,
        )
        cls.ap_acct = Account.objects.create(
            tenant=cls.tenant, code='2010', name='AP',
            account_type=AccountType.LIABILITY_CURRENT,
        )

        # Wire defaults
        acct = AccountingSettings.get_for_tenant(cls.tenant)
        acct.default_inventory_account = cls.inventory_acct
        acct.default_grir_account = cls.grir_acct
        acct.default_ap_account = cls.ap_acct
        acct.save()

        # Vendor + Warehouse
        cls.vendor_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='V1', display_name='Test Vendor',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vendor_party)

        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant,
            code='WH1',
            name='Main Warehouse',
            is_default=True,
        )
        # Separate Location for PO.ship_to (PurchaseOrder.ship_to is a Location).
        cls.ship_to_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party,
            code='SHIPTO',
            name='Main Receiving Dock',
            location_type='SHIP_TO',
        )

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='WIDGET', name='Widget',
            base_uom=cls.uom,
            asset_account=cls.inventory_acct,
        )

    def setUp(self):
        set_current_tenant(self.tenant)


class CreateAndPostReceiptTests(ReceivingServiceTestBase):
    """create_and_post_receipt happy path + GL correctness."""

    def test_posts_balanced_grir_journal_entry(self):
        svc = ReceivingService(self.tenant, self.user)
        receipt = svc.create_and_post_receipt(
            vendor=self.vendor,
            warehouse=self.warehouse,
            lines=[{
                'item': self.item,
                'quantity': 10,
                'unit_cost': Decimal('5.00'),
            }],
        )
        self.assertEqual(receipt.status, 'posted')
        self.assertEqual(receipt.lines.count(), 1)

        # Each receive_stock call posts its own balanced JE.
        # Find the JE that came from this layer
        from apps.accounting.models import JournalEntry
        receipt_jes = JournalEntry.objects.filter(
            tenant=self.tenant,
            date=receipt.received_date,
        )
        self.assertTrue(receipt_jes.exists())
        for je in receipt_jes:
            self.assertTrue(je.is_balanced, f"JE {je.entry_number} not balanced: {je.total_debit} vs {je.total_credit}")
            # Confirm GR/IR was credited
            grir_lines = je.lines.filter(account=self.grir_acct, credit__gt=0)
            self.assertTrue(grir_lines.exists(), "Expected GR/IR to be credited on receipt")

    def test_raises_when_grir_account_missing(self):
        # Strip the GR/IR account default and confirm the service refuses
        # rather than silently mis-posting.
        acct = AccountingSettings.get_for_tenant(self.tenant)
        acct.default_grir_account = None
        acct.save()

        svc = ReceivingService(self.tenant, self.user)
        with self.assertRaises(ValidationError):
            svc.create_and_post_receipt(
                vendor=self.vendor,
                warehouse=self.warehouse,
                lines=[{
                    'item': self.item,
                    'quantity': 1,
                    'unit_cost': Decimal('1.00'),
                }],
            )

    def test_partial_then_full_po_receipt_rolls_to_complete(self):
        # Set up a PO with 100 units
        po = PurchaseOrder.objects.create(
            tenant=self.tenant, vendor=self.vendor,
            po_number='PO-PARTIAL', ship_to=self.ship_to_location,
            status='confirmed',
        )
        po_line = PurchaseOrderLine.objects.create(
            tenant=self.tenant, purchase_order=po,
            line_number=10, item=self.item, uom=self.uom,
            quantity_ordered=100, unit_cost=Decimal('2.00'),
        )

        svc = ReceivingService(self.tenant, self.user)

        # First partial — 40
        svc.create_and_post_receipt(
            vendor=self.vendor, warehouse=self.warehouse,
            purchase_order=po,
            lines=[{
                'item': self.item, 'quantity': 40,
                'unit_cost': Decimal('2.00'),
                'purchase_order_line': po_line,
            }],
        )
        po.refresh_from_db()
        po_line.refresh_from_db()
        self.assertEqual(po_line.quantity_received, 40)
        self.assertEqual(po.status, 'partially_received')

        # Second receipt — remaining 60
        svc.create_and_post_receipt(
            vendor=self.vendor, warehouse=self.warehouse,
            purchase_order=po,
            lines=[{
                'item': self.item, 'quantity': 60,
                'unit_cost': Decimal('2.00'),
                'purchase_order_line': po_line,
            }],
        )
        po.refresh_from_db()
        po_line.refresh_from_db()
        self.assertEqual(po_line.quantity_received, 100)
        self.assertEqual(po.status, 'complete')


class ReceiptToBillTests(ReceivingServiceTestBase):
    """Receipt → Bill flow via VendorBillService.create_bill_from_receipts."""

    def _make_posted_receipt(self, qty=10, cost='5.00'):
        svc = ReceivingService(self.tenant, self.user)
        return svc.create_and_post_receipt(
            vendor=self.vendor,
            warehouse=self.warehouse,
            lines=[{'item': self.item, 'quantity': qty, 'unit_cost': Decimal(cost)}],
        )

    def test_create_bill_from_one_receipt_links_lines(self):
        receipt = self._make_posted_receipt(qty=10, cost='5.00')
        rl = receipt.lines.first()

        bill_svc = VendorBillService(self.tenant, self.user)
        bill = bill_svc.create_bill_from_receipts(
            vendor=self.vendor,
            receipt_lines=[{'receipt_line': rl, 'quantity': 10}],
            vendor_invoice_number='V-RECV-001',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        self.assertEqual(bill.status, 'draft')
        self.assertEqual(bill.lines.count(), 1)

        bill_line = bill.lines.first()
        self.assertEqual(bill_line.item_receipt_line_id, rl.pk)

        # Receipt-line counter incremented; receipt status now 'billed'.
        rl.refresh_from_db()
        receipt.refresh_from_db()
        self.assertEqual(rl.quantity_billed, 10)
        self.assertEqual(receipt.status, 'billed')

    def test_posting_receipt_linked_bill_clears_grir(self):
        receipt = self._make_posted_receipt(qty=4, cost='25.00')  # $100 receipt
        rl = receipt.lines.first()

        bill_svc = VendorBillService(self.tenant, self.user)
        bill = bill_svc.create_bill_from_receipts(
            vendor=self.vendor,
            receipt_lines=[{'receipt_line': rl}],
            vendor_invoice_number='V-RECV-002',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        bill_svc.post_vendor_bill(bill)
        bill.refresh_from_db()

        self.assertEqual(bill.status, 'posted')
        self.assertIsNotNone(bill.journal_entry)

        # The bill's JE should debit GR/IR (clearing the accrual) and
        # credit A/P. NOT debit Inventory again.
        je = bill.journal_entry
        debits = list(je.lines.filter(debit__gt=0).values_list('account__code', flat=True))
        credits = list(je.lines.filter(credit__gt=0).values_list('account__code', flat=True))

        # GR/IR debit, A/P credit
        self.assertIn(self.grir_acct.code, debits)
        self.assertIn(self.ap_acct.code, credits)
        # No second hit on Inventory
        self.assertNotIn(self.inventory_acct.code, debits)
        self.assertTrue(je.is_balanced)

    def test_cannot_overbill_receipt_line(self):
        receipt = self._make_posted_receipt(qty=10, cost='5.00')
        rl = receipt.lines.first()

        bill_svc = VendorBillService(self.tenant, self.user)
        # First bill takes 7 of 10 — succeeds
        bill_svc.create_bill_from_receipts(
            vendor=self.vendor,
            receipt_lines=[{'receipt_line': rl, 'quantity': 7}],
            vendor_invoice_number='V-PART',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        rl.refresh_from_db()
        self.assertEqual(rl.quantity_billed, 7)
        self.assertEqual(rl.quantity_remaining_to_bill, 3)

        # Second bill tries to take 5 more — should fail (only 3 left)
        with self.assertRaises(ValidationError):
            bill_svc.create_bill_from_receipts(
                vendor=self.vendor,
                receipt_lines=[{'receipt_line': rl, 'quantity': 5}],
                vendor_invoice_number='V-OVER',
                due_date=timezone.now().date() + timedelta(days=30),
            )
