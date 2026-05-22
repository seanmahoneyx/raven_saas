# apps/api/tests/test_bills.py
"""
API-level tests for the VendorBill (AP) endpoints.

Mirrors the AR Invoice API test pattern. Verifies:
- Tenant scoping
- Bill creation (auto bill_number)
- post/void custom actions
- Line and payment nested actions
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounting.models import Account, AccountType, AccountingSettings
from apps.invoicing.models import VendorBill, VendorBillLine, BillPayment
from apps.invoicing.services import VendorBillService
from apps.items.models import Item, UnitOfMeasure
from apps.parties.models import Party, Vendor
from apps.tenants.models import Tenant
from shared.managers import set_current_tenant


User = get_user_model()


class BillsAPIBaseTestCase(TestCase):
    """Shared fixtures for the bills API tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='Bills Co', subdomain='bills-co', is_default=True,
        )
        cls.user = User.objects.create_user(
            username='billsuser', email='bills@test.com', password='pass',
        )

        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='ea', name='Each',
        )

        # Vendor
        cls.vendor_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR',
            code='V1', display_name='Bill Vendor',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vendor_party)

        # GL accounts
        cls.ap_account = Account.objects.create(
            tenant=cls.tenant, code='2000', name='AP',
            account_type=AccountType.LIABILITY_CURRENT,
        )
        cls.cash_account = Account.objects.create(
            tenant=cls.tenant, code='1000', name='Cash',
            account_type=AccountType.ASSET_CURRENT,
        )
        cls.cogs_account = Account.objects.create(
            tenant=cls.tenant, code='5000', name='COGS',
            account_type=AccountType.EXPENSE_COGS,
        )

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='BILL-ITEM', name='Billable Widget',
            base_uom=cls.uom, expense_account=cls.cogs_account,
        )

        # Wire defaults so post_vendor_bill resolves accounts
        acct = AccountingSettings.get_for_tenant(cls.tenant)
        acct.default_ap_account = cls.ap_account
        acct.default_cash_account = cls.cash_account
        acct.default_cogs_account = cls.cogs_account
        acct.save()

    def setUp(self):
        set_current_tenant(self.tenant)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        # APIClient does not auto-populate request.tenant; route via middleware.
        # The TenantMiddleware reads from the user; for tests, attach via header.
        self.client.defaults['HTTP_X_TENANT'] = self.tenant.subdomain

    def _create_draft_bill_via_service(self, vendor_invoice_number='V-001', amount='100.00'):
        """Helper that creates a bill+line via the service (used by tests that
        need a posted bill — exercising service code directly is acceptable since
        we're testing the API, not the service)."""
        svc = VendorBillService(self.tenant, self.user)
        bill = svc.create_bill(
            vendor=self.vendor,
            vendor_invoice_number=vendor_invoice_number,
            due_date=timezone.now().date() + timedelta(days=30),
        )
        svc.add_line(
            bill=bill, description='Stuff', quantity=1,
            unit_price=Decimal(amount), item=self.item,
        )
        bill.refresh_from_db()
        return bill


class BillListAPITests(BillsAPIBaseTestCase):
    """Tests for GET /api/v1/bills/."""

    def test_list_bills_scoped_to_tenant(self):
        # Bill in our tenant
        self._create_draft_bill_via_service(vendor_invoice_number='MINE-001')

        # Bill in a different tenant
        other_tenant = Tenant.objects.create(name='Other Co', subdomain='other-co')
        set_current_tenant(other_tenant)
        other_party = Party.objects.create(
            tenant=other_tenant, party_type='VENDOR',
            code='OV', display_name='Other Vendor',
        )
        other_vendor = Vendor.objects.create(tenant=other_tenant, party=other_party)
        VendorBill.objects.create(
            tenant=other_tenant, vendor=other_vendor,
            vendor_invoice_number='OTHER-001', bill_number='OTHER-BN',
            due_date=timezone.now().date() + timedelta(days=30),
        )
        set_current_tenant(self.tenant)

        response = self.client.get('/api/v1/bills/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        # Should only see our tenant's bill
        numbers = [b['vendor_invoice_number'] for b in results]
        self.assertIn('MINE-001', numbers)
        self.assertNotIn('OTHER-001', numbers)

    def test_list_includes_invoice_type_ap_marker(self):
        self._create_draft_bill_via_service(vendor_invoice_number='AP-TYPE')
        response = self.client.get('/api/v1/bills/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertTrue(all(b['invoice_type'] == 'AP' for b in results))


class BillCreateAPITests(BillsAPIBaseTestCase):
    """Tests for POST /api/v1/bills/."""

    def test_create_bill_minimum_fields(self):
        payload = {
            'vendor': self.vendor.pk,
            'vendor_invoice_number': 'NEW-001',
            'bill_date': str(timezone.now().date()),
            'due_date': str(timezone.now().date() + timedelta(days=30)),
        }
        response = self.client.post('/api/v1/bills/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['status'], 'draft')
        self.assertEqual(response.data['invoice_type'], 'AP')

    def test_bill_number_auto_generated(self):
        payload = {
            'vendor': self.vendor.pk,
            'vendor_invoice_number': 'AUTO-001',
            'bill_date': str(timezone.now().date()),
            'due_date': str(timezone.now().date() + timedelta(days=30)),
        }
        response = self.client.post('/api/v1/bills/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        bill_number = response.data['bill_number']
        self.assertTrue(bill_number)
        # Format: YYYYMM-NNNNN
        self.assertRegex(bill_number, r'^\d{6}-\d{5}$')


class BillPostAPITests(BillsAPIBaseTestCase):
    """Tests for the post and void custom actions."""

    def test_post_bill_creates_journal_entry(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='POST-001', amount='250.00',
        )
        response = self.client.post(f'/api/v1/bills/{bill.pk}/post/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['status'], 'posted')
        self.assertIsNotNone(response.data['journal_entry'])

        bill.refresh_from_db()
        self.assertEqual(bill.status, 'posted')
        self.assertIsNotNone(bill.journal_entry)
        self.assertTrue(bill.journal_entry.is_balanced)

    def test_post_non_draft_returns_400(self):
        bill = self._create_draft_bill_via_service(vendor_invoice_number='POST-002')
        svc = VendorBillService(self.tenant, self.user)
        svc.post_vendor_bill(bill)

        response = self.client.post(f'/api/v1/bills/{bill.pk}/post/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_void_bill_reverses_journal_entry(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='VOID-001', amount='150.00',
        )
        svc = VendorBillService(self.tenant, self.user)
        svc.post_vendor_bill(bill)
        bill.refresh_from_db()

        original_je = bill.journal_entry
        self.assertIsNotNone(original_je)
        original_debits = original_je.total_debit
        original_credits = original_je.total_credit

        response = self.client.post(f'/api/v1/bills/{bill.pk}/void/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['status'], 'void')

        # Reversing JE should exist with swapped debits/credits.
        # Use all_tenants() because thread-local current_tenant may have been
        # cleared after the request; we still filter by tenant=self.tenant.
        from apps.accounting.models import JournalEntry, JournalEntryLine
        set_current_tenant(self.tenant)
        rev = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number=f"{original_je.entry_number}-VOID",
        ).first()
        self.assertIsNotNone(rev)

        rev_lines = JournalEntryLine.objects.filter(entry=rev)
        rev_debit = sum((ln.debit for ln in rev_lines), Decimal('0'))
        rev_credit = sum((ln.credit for ln in rev_lines), Decimal('0'))
        self.assertEqual(rev_debit, original_credits)
        self.assertEqual(rev_credit, original_debits)

    def test_void_bill_with_payments_returns_400(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='VOID-PAY', amount='100.00',
        )
        svc = VendorBillService(self.tenant, self.user)
        svc.post_vendor_bill(bill)
        bill.refresh_from_db()
        svc.pay_vendor_bill(bill, amount=Decimal('25.00'), bank_account=self.cash_account)

        response = self.client.post(f'/api/v1/bills/{bill.pk}/void/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class BillPaymentAPITests(BillsAPIBaseTestCase):
    """Tests for /api/v1/bill-payments/ and the nested payments action."""

    def test_bill_payment_create(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='PAY-001', amount='500.00',
        )
        svc = VendorBillService(self.tenant, self.user)
        svc.post_vendor_bill(bill)
        bill.refresh_from_db()

        payload = {
            'bill': bill.pk,
            'payment_date': str(timezone.now().date()),
            'amount': '200.00',
            'payment_method': 'CHECK',
            'reference_number': 'CHK-1001',
        }
        response = self.client.post('/api/v1/bill-payments/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(response.data['amount']), Decimal('200.00'))
        self.assertEqual(response.data['bill_number'], bill.bill_number)

    def test_bill_payment_nested_action(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='PAY-002', amount='100.00',
        )
        svc = VendorBillService(self.tenant, self.user)
        svc.post_vendor_bill(bill)
        bill.refresh_from_db()

        payload = {
            'payment_date': str(timezone.now().date()),
            'amount': '50.00',
            'payment_method': 'ACH',
        }
        response = self.client.post(
            f'/api/v1/bills/{bill.pk}/payments/', payload, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        bill.refresh_from_db()
        self.assertEqual(bill.amount_paid, Decimal('50.00'))

    def test_bill_payment_on_draft_returns_400(self):
        bill = self._create_draft_bill_via_service(vendor_invoice_number='DRAFT-PAY')
        payload = {
            'payment_date': str(timezone.now().date()),
            'amount': '10.00',
            'payment_method': 'CHECK',
        }
        response = self.client.post(
            f'/api/v1/bills/{bill.pk}/payments/', payload, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class BillLineAPITests(BillsAPIBaseTestCase):
    """Tests for the bill-line CRUD endpoints on draft bills."""

    def test_patch_line_on_draft_recalculates_totals(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='LINE-PATCH', amount='100.00',
        )
        line = bill.lines.first()
        response = self.client.patch(
            f'/api/v1/bills/{bill.pk}/lines/{line.pk}/',
            {'quantity': '5', 'unit_price': '20.00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        bill.refresh_from_db()
        self.assertEqual(bill.subtotal, Decimal('100.00'))

    def test_delete_line_on_draft_recalculates_totals(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='LINE-DEL', amount='75.00',
        )
        line = bill.lines.first()
        response = self.client.delete(
            f'/api/v1/bills/{bill.pk}/lines/{line.pk}/',
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        bill.refresh_from_db()
        self.assertEqual(bill.lines.count(), 0)
        self.assertEqual(bill.subtotal, Decimal('0.00'))

    def test_patch_line_on_posted_bill_returns_400(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='LINE-POSTED', amount='50.00',
        )
        line = bill.lines.first()
        svc = VendorBillService(self.tenant, self.user)
        svc.post_vendor_bill(bill)

        response = self.client.patch(
            f'/api/v1/bills/{bill.pk}/lines/{line.pk}/',
            {'quantity': '999'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_line_not_found_returns_404(self):
        bill = self._create_draft_bill_via_service(
            vendor_invoice_number='LINE-404', amount='10.00',
        )
        response = self.client.delete(
            f'/api/v1/bills/{bill.pk}/lines/99999/',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
