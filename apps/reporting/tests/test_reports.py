# apps/reporting/tests/test_reports.py
"""
Tests for FinancialReportService: trial balance, income statement, AR aging.
"""
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location
from apps.items.models import UnitOfMeasure, Item
from apps.accounting.models import (
    Account, AccountType, AccountingSettings,
    JournalEntry, JournalEntryLine,
)
from apps.invoicing.models import Invoice, InvoiceLine
from apps.invoicing.services import InvoicingService
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.reporting.services import FinancialReportService
from shared.managers import set_current_tenant
from users.models import User


class FinancialReportTestCase(TestCase):
    """Tests for FinancialReportService."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Report Co', subdomain='test-reports')
        cls.user = User.objects.create_user(username='reportuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='ea', name='Each',
        )

        # Party / Customer
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C-RPT',
            display_name='Report Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship To', address_line1='1 Main', city='Chicago', state='IL',
            postal_code='60601',
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, party=cls.cust_party,
        )

        # GL Accounts
        cls.ar_account = Account.objects.create(
            tenant=cls.tenant, code='1100', name='Accounts Receivable',
            account_type=AccountType.ASSET_CURRENT,
        )
        cls.cash_account = Account.objects.create(
            tenant=cls.tenant, code='1000', name='Cash',
            account_type=AccountType.ASSET_CURRENT,
        )
        cls.income_account = Account.objects.create(
            tenant=cls.tenant, code='4000', name='Sales Revenue',
            account_type=AccountType.REVENUE,
        )
        cls.cogs_account = Account.objects.create(
            tenant=cls.tenant, code='5000', name='COGS',
            account_type=AccountType.EXPENSE_COGS,
        )
        cls.ap_account = Account.objects.create(
            tenant=cls.tenant, code='2000', name='Accounts Payable',
            account_type=AccountType.LIABILITY_CURRENT,
        )

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='RPT-ITEM', name='Report Widget',
            base_uom=cls.uom, income_account=cls.income_account,
        )

        # AccountingSettings
        acct = AccountingSettings.get_for_tenant(cls.tenant)
        acct.default_ar_account = cls.ar_account
        acct.default_ap_account = cls.ap_account
        acct.default_cash_account = cls.cash_account
        acct.default_income_account = cls.income_account
        acct.default_cogs_account = cls.cogs_account
        acct.save()

    def setUp(self):
        set_current_tenant(self.tenant)

    def _create_posted_je(self, date, memo, lines):
        """
        Helper: create a posted JournalEntry with given lines.
        lines: list of (account, debit, credit) tuples.
        """
        je_count = JournalEntry.objects.filter(tenant=self.tenant).count()
        je = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number=f'TEST-{je_count + 1:05d}',
            date=date,
            memo=memo,
            entry_type='standard',
            status='posted',
            posted_at=timezone.now(),
            posted_by=self.user,
            created_by=self.user,
        )
        for i, (account, debit, credit) in enumerate(lines, start=1):
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=i * 10,
                account=account,
                description=memo,
                debit=debit,
                credit=credit,
            )
        return je

    # ── 5.8a: Trial Balance ──────────────────────────────────────────────

    def test_trial_balance(self):
        """
        Trial balance aggregates posted JE lines by account.
        Debits should equal credits in total.
        """
        today = timezone.now().date()

        # JE 1: Sale - DR AR 1000, CR Revenue 1000
        self._create_posted_je(today, 'Sale', [
            (self.ar_account, Decimal('1000.00'), Decimal('0.00')),
            (self.income_account, Decimal('0.00'), Decimal('1000.00')),
        ])

        # JE 2: COGS - DR COGS 400, CR Inventory (use Cash as proxy)
        self._create_posted_je(today, 'COGS', [
            (self.cogs_account, Decimal('400.00'), Decimal('0.00')),
            (self.cash_account, Decimal('0.00'), Decimal('400.00')),
        ])

        # JE 3: Payment - DR Cash 1000, CR AR 1000
        self._create_posted_je(today, 'Payment received', [
            (self.cash_account, Decimal('1000.00'), Decimal('0.00')),
            (self.ar_account, Decimal('0.00'), Decimal('1000.00')),
        ])

        result = FinancialReportService.get_trial_balance(self.tenant, today)
        self.assertIsInstance(result, list)
        self.assertTrue(len(result) > 0)

        # Total debits == total credits
        total_debits = sum(r['total_debit'] for r in result)
        total_credits = sum(r['total_credit'] for r in result)
        self.assertEqual(total_debits, total_credits)

        # Check specific accounts
        ar_row = next((r for r in result if r['account_code'] == '1100'), None)
        self.assertIsNotNone(ar_row)
        # AR: DR 1000 - CR 1000 = net 0
        self.assertEqual(ar_row['total_debit'], Decimal('1000.00'))
        self.assertEqual(ar_row['total_credit'], Decimal('1000.00'))

        revenue_row = next((r for r in result if r['account_code'] == '4000'), None)
        self.assertIsNotNone(revenue_row)
        self.assertEqual(revenue_row['net_balance'], Decimal('1000.00'))

    # ── 5.8b: Income Statement ───────────────────────────────────────────

    def test_income_statement(self):
        """
        Income statement shows revenue, COGS, and net income for a date range.
        """
        today = timezone.now().date()
        start = today - timedelta(days=30)

        # Revenue JE
        self._create_posted_je(today, 'Revenue', [
            (self.ar_account, Decimal('5000.00'), Decimal('0.00')),
            (self.income_account, Decimal('0.00'), Decimal('5000.00')),
        ])

        # COGS JE
        self._create_posted_je(today, 'COGS', [
            (self.cogs_account, Decimal('2000.00'), Decimal('0.00')),
            (self.cash_account, Decimal('0.00'), Decimal('2000.00')),
        ])

        result = FinancialReportService.get_income_statement(
            self.tenant, start, today,
        )

        self.assertIn('sections', result)
        self.assertIn('net_income', result)

        # Revenue = 5000
        self.assertEqual(
            result['sections']['revenue']['total'],
            Decimal('5000.00'),
        )

        # COGS = 2000
        self.assertEqual(
            result['sections']['cogs']['total'],
            Decimal('2000.00'),
        )

        # Gross Profit = 5000 - 2000 = 3000
        self.assertEqual(result['sections']['gross_profit'], Decimal('3000.00'))

        # Net Income = 3000 (no operating expenses)
        self.assertEqual(result['net_income'], Decimal('3000.00'))

    # ── 5.8c: AR Aging ───────────────────────────────────────────────────

    def test_ar_aging(self):
        """
        AR aging buckets outstanding invoices by days past due.
        """
        today = timezone.now().date()

        # Create invoices with various due dates
        # Current invoice (not overdue)
        inv_current = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_number='INV-RPT-001',
            invoice_date=today - timedelta(days=5),
            due_date=today + timedelta(days=25),
            status='sent',
            total_amount=Decimal('1000.00'),
            amount_paid=Decimal('0.00'),
        )

        # 1-30 days overdue
        inv_30 = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_number='INV-RPT-002',
            invoice_date=today - timedelta(days=45),
            due_date=today - timedelta(days=15),
            status='sent',
            total_amount=Decimal('2000.00'),
            amount_paid=Decimal('0.00'),
        )

        # 31-60 days overdue
        inv_60 = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_number='INV-RPT-003',
            invoice_date=today - timedelta(days=75),
            due_date=today - timedelta(days=45),
            status='overdue',
            total_amount=Decimal('3000.00'),
            amount_paid=Decimal('500.00'),
        )

        # 90+ days overdue
        inv_90plus = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_number='INV-RPT-004',
            invoice_date=today - timedelta(days=150),
            due_date=today - timedelta(days=120),
            status='overdue',
            total_amount=Decimal('500.00'),
            amount_paid=Decimal('0.00'),
        )

        result = FinancialReportService.get_ar_aging(self.tenant, today)

        self.assertIn('customers', result)
        self.assertIn('totals', result)
        self.assertEqual(result['as_of_date'], str(today))

        # Should have one customer
        self.assertEqual(len(result['customers']), 1)
        cust_data = result['customers'][0]
        self.assertEqual(cust_data['customer_name'], 'Report Customer')

        # Verify buckets
        self.assertEqual(cust_data['current'], Decimal('1000.00'))
        self.assertEqual(cust_data['days_1_30'], Decimal('2000.00'))
        self.assertEqual(cust_data['days_31_60'], Decimal('2500.00'))  # 3000 - 500 paid
        self.assertEqual(cust_data['days_over_90'], Decimal('500.00'))

        # Grand total: 1000 + 2000 + 2500 + 500 = 6000
        self.assertEqual(result['totals']['total'], Decimal('6000.00'))
