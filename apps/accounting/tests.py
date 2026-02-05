"""
Unit tests for the Accounting module.

Tests cover:
- Account model and validation
- JournalEntry model and balance validation
- JournalEntryLine model and validation
- AccountingService methods
- Fiscal period management
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from apps.tenants.models import Tenant, TenantSequence
from apps.accounting.models import (
    Account, AccountType, FiscalPeriod, JournalEntry, JournalEntryLine,
    AccountBalance, RecurringEntryTemplate, RecurringEntryLine, AccountingSettings,
    DEBIT_NORMAL_TYPES, CREDIT_NORMAL_TYPES
)
from apps.accounting.services import (
    AccountingService, UnbalancedEntryError, PostedEntryError,
    InactiveAccountError, ClosedPeriodError
)
from shared.managers import set_current_tenant


User = get_user_model()


class BaseAccountingTestCase(TestCase):
    """Base test case with common setup for accounting tests."""

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Test Company', subdomain='test-company')
        # Set tenant in thread-local storage for TenantManager
        set_current_tenant(self.tenant)
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        # Create JE sequence for the service
        TenantSequence.objects.create(
            tenant=self.tenant,
            sequence_type='JE',
            prefix='',
            next_value=1,
            padding=6
        )

    def tearDown(self):
        # Clear tenant from thread-local storage
        set_current_tenant(None)


class AccountModelTests(BaseAccountingTestCase):
    """Tests for the Account model."""

    def test_create_account(self):
        """Test creating a basic account."""
        account = Account.objects.create(
            tenant=self.tenant,
            code='1000',
            name='Cash',
            account_type=AccountType.ASSET_CURRENT
        )
        self.assertEqual(str(account), '1000 - Cash')
        self.assertTrue(account.is_active)
        self.assertFalse(account.is_system)

    def test_account_normal_balance_debit(self):
        """Test that asset accounts have debit normal balance."""
        account = Account.objects.create(
            tenant=self.tenant,
            code='1100',
            name='Accounts Receivable',
            account_type=AccountType.ASSET_CURRENT
        )
        self.assertTrue(account.is_debit_normal)
        self.assertFalse(account.is_credit_normal)

    def test_account_normal_balance_credit(self):
        """Test that liability accounts have credit normal balance."""
        account = Account.objects.create(
            tenant=self.tenant,
            code='2000',
            name='Accounts Payable',
            account_type=AccountType.LIABILITY_CURRENT
        )
        self.assertFalse(account.is_debit_normal)
        self.assertTrue(account.is_credit_normal)

    def test_account_hierarchy(self):
        """Test parent/child account relationships."""
        parent = Account.objects.create(
            tenant=self.tenant,
            code='1000',
            name='Assets',
            account_type=AccountType.ASSET_CURRENT
        )
        child = Account.objects.create(
            tenant=self.tenant,
            code='1010',
            name='Cash on Hand',
            account_type=AccountType.ASSET_CURRENT,
            parent=parent
        )
        self.assertEqual(child.parent, parent)
        # Refresh parent to get updated children queryset
        parent.refresh_from_db()
        self.assertEqual(parent.children.count(), 1)
        self.assertEqual(parent.children.first(), child)

    def test_account_unique_code_per_tenant(self):
        """Test that account codes must be unique per tenant."""
        Account.objects.create(
            tenant=self.tenant,
            code='1000',
            name='Cash',
            account_type=AccountType.ASSET_CURRENT
        )
        with self.assertRaises(Exception):
            Account.objects.create(
                tenant=self.tenant,
                code='1000',
                name='Duplicate Cash',
                account_type=AccountType.ASSET_CURRENT
            )


class JournalEntryModelTests(BaseAccountingTestCase):
    """Tests for the JournalEntry model."""

    def setUp(self):
        super().setUp()
        self.cash_account = Account.objects.create(
            tenant=self.tenant,
            code='1000',
            name='Cash',
            account_type=AccountType.ASSET_CURRENT
        )
        self.revenue_account = Account.objects.create(
            tenant=self.tenant,
            code='4000',
            name='Sales Revenue',
            account_type=AccountType.REVENUE
        )

    def test_create_journal_entry(self):
        """Test creating a basic journal entry."""
        entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-2026-0001',
            date=date.today(),
            memo='Test entry',
            created_by=self.user
        )
        self.assertEqual(entry.status, JournalEntry.EntryStatus.DRAFT)
        self.assertEqual(entry.entry_type, JournalEntry.EntryType.STANDARD)
        self.assertFalse(entry.is_posted)

    def test_journal_entry_balance_check(self):
        """Test that is_balanced property works correctly."""
        entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-2026-0001',
            date=date.today(),
            memo='Test entry',
            created_by=self.user
        )
        # Add balanced lines
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=entry,
            account=self.cash_account,
            debit=Decimal('100.00'),
            credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=entry,
            account=self.revenue_account,
            debit=Decimal('0.00'),
            credit=Decimal('100.00')
        )
        # Refresh to recalculate
        entry.refresh_from_db()
        self.assertTrue(entry.is_balanced)
        self.assertEqual(entry.total_debit, Decimal('100.00'))
        self.assertEqual(entry.total_credit, Decimal('100.00'))

    def test_journal_entry_unbalanced(self):
        """Test that unbalanced entries are detected."""
        entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-2026-0002',
            date=date.today(),
            memo='Unbalanced entry',
            created_by=self.user
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=entry,
            account=self.cash_account,
            debit=Decimal('100.00'),
            credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=entry,
            account=self.revenue_account,
            debit=Decimal('0.00'),
            credit=Decimal('50.00')  # Only 50, not 100
        )
        entry.refresh_from_db()
        self.assertFalse(entry.is_balanced)


class JournalEntryLineModelTests(BaseAccountingTestCase):
    """Tests for the JournalEntryLine model."""

    def setUp(self):
        super().setUp()
        self.cash_account = Account.objects.create(
            tenant=self.tenant,
            code='1000',
            name='Cash',
            account_type=AccountType.ASSET_CURRENT
        )
        self.entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-2026-0001',
            date=date.today(),
            memo='Test entry',
            created_by=self.user
        )

    def test_create_debit_line(self):
        """Test creating a debit line."""
        line = JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=self.entry,
            account=self.cash_account,
            debit=Decimal('100.00'),
            credit=Decimal('0.00')
        )
        self.assertTrue(line.is_debit)
        self.assertFalse(line.is_credit)
        self.assertEqual(line.amount, Decimal('100.00'))

    def test_create_credit_line(self):
        """Test creating a credit line."""
        line = JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=self.entry,
            account=self.cash_account,
            debit=Decimal('0.00'),
            credit=Decimal('100.00')
        )
        self.assertFalse(line.is_debit)
        self.assertTrue(line.is_credit)
        self.assertEqual(line.amount, Decimal('100.00'))

    def test_line_cannot_have_both_debit_and_credit(self):
        """Test that a line cannot have both debit and credit amounts."""
        line = JournalEntryLine(
            tenant=self.tenant,
            entry=self.entry,
            account=self.cash_account,
            debit=Decimal('100.00'),
            credit=Decimal('50.00')
        )
        with self.assertRaises(ValidationError):
            line.clean()

    def test_line_must_have_amount(self):
        """Test that a line must have either debit or credit."""
        line = JournalEntryLine(
            tenant=self.tenant,
            entry=self.entry,
            account=self.cash_account,
            debit=Decimal('0.00'),
            credit=Decimal('0.00')
        )
        with self.assertRaises(ValidationError):
            line.clean()

    def test_line_amounts_must_be_positive(self):
        """Test that amounts cannot be negative."""
        line = JournalEntryLine(
            tenant=self.tenant,
            entry=self.entry,
            account=self.cash_account,
            debit=Decimal('-100.00'),
            credit=Decimal('0.00')
        )
        with self.assertRaises(ValidationError):
            line.clean()


class AccountingServiceTests(BaseAccountingTestCase):
    """Tests for the AccountingService."""

    def setUp(self):
        super().setUp()
        self.service = AccountingService(self.tenant)

        # Create accounts
        self.cash_account = Account.objects.create(
            tenant=self.tenant,
            code='1000',
            name='Cash',
            account_type=AccountType.ASSET_CURRENT
        )
        self.ar_account = Account.objects.create(
            tenant=self.tenant,
            code='1100',
            name='Accounts Receivable',
            account_type=AccountType.ASSET_CURRENT
        )
        self.revenue_account = Account.objects.create(
            tenant=self.tenant,
            code='4000',
            name='Sales Revenue',
            account_type=AccountType.REVENUE
        )
        self.expense_account = Account.objects.create(
            tenant=self.tenant,
            code='6000',
            name='Office Supplies',
            account_type=AccountType.EXPENSE_OPERATING
        )
        self.inactive_account = Account.objects.create(
            tenant=self.tenant,
            code='9999',
            name='Inactive Account',
            account_type=AccountType.EXPENSE_OTHER,
            is_active=False
        )

    def test_create_entry(self):
        """Test creating a balanced journal entry via service."""
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Cash sale',
            lines=[
                {'account_id': self.cash_account.id, 'debit': Decimal('100.00')},
                {'account_id': self.revenue_account.id, 'credit': Decimal('100.00')},
            ],
            created_by=self.user
        )
        self.assertEqual(entry.status, JournalEntry.EntryStatus.DRAFT)
        self.assertTrue(entry.is_balanced)
        self.assertEqual(entry.lines.count(), 2)

    def test_create_entry_unbalanced_raises_error(self):
        """Test that creating an unbalanced entry raises UnbalancedEntryError."""
        with self.assertRaises(UnbalancedEntryError):
            self.service.create_entry(
                entry_date=date.today(),
                memo='Unbalanced entry',
                lines=[
                    {'account_id': self.cash_account.id, 'debit': Decimal('100.00')},
                    {'account_id': self.revenue_account.id, 'credit': Decimal('50.00')},
                ],
                created_by=self.user
            )

    def test_create_entry_inactive_account_posting_raises_error(self):
        """Test that posting with an inactive account raises InactiveAccountError."""
        # Create entry with inactive account (doesn't fail at creation)
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry with inactive account',
            lines=[
                {'account_id': self.cash_account.id, 'debit': Decimal('100.00')},
                {'account_id': self.inactive_account.id, 'credit': Decimal('100.00')},
            ],
            created_by=self.user
        )
        # Posting should fail
        with self.assertRaises(InactiveAccountError):
            self.service.post_entry(entry.id, posted_by=self.user)

    def test_post_entry(self):
        """Test posting a draft entry."""
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry to post',
            lines=[
                {'account_id': self.cash_account.id, 'debit': Decimal('100.00')},
                {'account_id': self.revenue_account.id, 'credit': Decimal('100.00')},
            ],
            created_by=self.user
        )
        posted_entry = self.service.post_entry(entry.id, posted_by=self.user)
        self.assertEqual(posted_entry.status, JournalEntry.EntryStatus.POSTED)
        self.assertIsNotNone(posted_entry.posted_at)
        self.assertEqual(posted_entry.posted_by, self.user)

    def test_post_entry_already_posted_raises_error(self):
        """Test that posting an already posted entry raises PostedEntryError."""
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry to post twice',
            lines=[
                {'account_id': self.cash_account.id, 'debit': Decimal('100.00')},
                {'account_id': self.revenue_account.id, 'credit': Decimal('100.00')},
            ],
            created_by=self.user
        )
        self.service.post_entry(entry.id, posted_by=self.user)

        with self.assertRaises(PostedEntryError):
            self.service.post_entry(entry.id, posted_by=self.user)

    def test_reverse_entry(self):
        """Test reversing a posted entry."""
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry to reverse',
            lines=[
                {'account_id': self.cash_account.id, 'debit': Decimal('100.00')},
                {'account_id': self.revenue_account.id, 'credit': Decimal('100.00')},
            ],
            created_by=self.user
        )
        self.service.post_entry(entry.id, posted_by=self.user)

        reversal = self.service.reverse_entry(
            entry_id=entry.id,
            reversal_date=date.today(),
            created_by=self.user
        )
        self.assertEqual(reversal.entry_type, JournalEntry.EntryType.REVERSING)
        self.assertTrue(reversal.is_balanced)

        # Check that original entry is marked as reversed
        entry.refresh_from_db()
        self.assertEqual(entry.status, JournalEntry.EntryStatus.REVERSED)
        self.assertEqual(entry.reversed_by, reversal)

        # Check reversal lines are opposite
        original_lines = list(entry.lines.order_by('line_number'))
        reversal_lines = list(reversal.lines.order_by('line_number'))
        for orig, rev in zip(original_lines, reversal_lines):
            self.assertEqual(orig.debit, rev.credit)
            self.assertEqual(orig.credit, rev.debit)

    def test_get_account_balance(self):
        """Test getting account balance."""
        # Create and post an entry
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Test balance',
            lines=[
                {'account_id': self.cash_account.id, 'debit': Decimal('500.00')},
                {'account_id': self.revenue_account.id, 'credit': Decimal('500.00')},
            ],
            created_by=self.user
        )
        self.service.post_entry(entry.id, posted_by=self.user)

        # Get balance for cash (debit normal - increases with debit)
        cash_balance = self.service.get_account_balance(self.cash_account.id)
        self.assertEqual(cash_balance.balance, Decimal('500.00'))

        # Get balance for revenue (credit normal - increases with credit)
        revenue_balance = self.service.get_account_balance(self.revenue_account.id)
        self.assertEqual(revenue_balance.balance, Decimal('500.00'))

    def test_get_trial_balance(self):
        """Test getting trial balance."""
        # Create and post entries
        entry1 = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry 1',
            lines=[
                {'account_id': self.cash_account.id, 'debit': Decimal('1000.00')},
                {'account_id': self.revenue_account.id, 'credit': Decimal('1000.00')},
            ],
            created_by=self.user
        )
        self.service.post_entry(entry1.id, posted_by=self.user)

        entry2 = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry 2',
            lines=[
                {'account_id': self.expense_account.id, 'debit': Decimal('200.00')},
                {'account_id': self.cash_account.id, 'credit': Decimal('200.00')},
            ],
            created_by=self.user
        )
        self.service.post_entry(entry2.id, posted_by=self.user)

        trial_balance = self.service.get_trial_balance()

        # Total debits should equal total credits
        total_debit = sum(item['debit'] for item in trial_balance)
        total_credit = sum(item['credit'] for item in trial_balance)
        self.assertEqual(total_debit, total_credit)


class FiscalPeriodTests(BaseAccountingTestCase):
    """Tests for fiscal period management."""

    def setUp(self):
        super().setUp()
        self.service = AccountingService(self.tenant)

    def test_create_fiscal_period(self):
        """Test creating a fiscal period."""
        period = FiscalPeriod.objects.create(
            tenant=self.tenant,
            name='January 2026',
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            status=FiscalPeriod.PeriodStatus.OPEN
        )
        self.assertEqual(str(period), 'January 2026 (open)')

    def test_fiscal_period_date_validation(self):
        """Test that end date must be after start date."""
        period = FiscalPeriod(
            tenant=self.tenant,
            name='Invalid Period',
            start_date=date(2026, 1, 31),
            end_date=date(2026, 1, 1)
        )
        with self.assertRaises(ValidationError):
            period.clean()

    def test_create_fiscal_periods_monthly(self):
        """Test creating monthly fiscal periods via service."""
        periods = self.service.create_fiscal_periods(
            year=2026,
            period_type='monthly'
        )
        self.assertEqual(len(periods), 12)
        self.assertEqual(periods[0].name, 'January 2026')
        self.assertEqual(periods[11].name, 'December 2026')

    def test_closed_period_prevents_posting(self):
        """Test that posting to a closed period raises ClosedPeriodError."""
        # Create a closed period
        period = FiscalPeriod.objects.create(
            tenant=self.tenant,
            name='Closed Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            status=FiscalPeriod.PeriodStatus.CLOSED
        )

        # Create accounts
        cash = Account.objects.create(
            tenant=self.tenant,
            code='1000',
            name='Cash',
            account_type=AccountType.ASSET_CURRENT
        )
        revenue = Account.objects.create(
            tenant=self.tenant,
            code='4000',
            name='Revenue',
            account_type=AccountType.REVENUE
        )

        # Create entry in closed period date range
        entry = self.service.create_entry(
            entry_date=date(2025, 1, 15),  # Date within closed period
            memo='Entry in closed period',
            lines=[
                {'account_id': cash.id, 'debit': Decimal('100.00')},
                {'account_id': revenue.id, 'credit': Decimal('100.00')},
            ],
            created_by=self.user
        )
        # Manually set fiscal_period to the closed one
        entry.fiscal_period = period
        entry.save()

        # Posting should fail
        with self.assertRaises(ClosedPeriodError):
            self.service.post_entry(entry.id, posted_by=self.user)


class AccountingSettingsTests(TestCase):
    """Tests for AccountingSettings model."""

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Test Company', subdomain='test-company-settings')
        set_current_tenant(self.tenant)

    def tearDown(self):
        set_current_tenant(None)

    def test_get_or_create_settings(self):
        """Test getting or creating accounting settings for a tenant."""
        settings = AccountingSettings.get_for_tenant(self.tenant)
        self.assertEqual(settings.tenant, self.tenant)

        # Getting again should return same instance
        settings2 = AccountingSettings.get_for_tenant(self.tenant)
        self.assertEqual(settings.pk, settings2.pk)

    def test_settings_default_accounts(self):
        """Test that settings can store default accounts."""
        # Create accounts
        ar_account = Account.objects.create(
            tenant=self.tenant,
            code='1100',
            name='Accounts Receivable',
            account_type=AccountType.ASSET_CURRENT
        )
        ap_account = Account.objects.create(
            tenant=self.tenant,
            code='2000',
            name='Accounts Payable',
            account_type=AccountType.LIABILITY_CURRENT
        )

        settings = AccountingSettings.get_for_tenant(self.tenant)
        settings.default_ar_account = ar_account
        settings.default_ap_account = ap_account
        settings.save()

        # Refresh and verify
        settings.refresh_from_db()
        self.assertEqual(settings.default_ar_account, ar_account)
        self.assertEqual(settings.default_ap_account, ap_account)


class AccountTypeNormalBalanceTests(TestCase):
    """Tests for account type normal balance definitions."""

    def test_all_types_have_normal_balance(self):
        """Test that all account types have a defined normal balance."""
        all_types = set(AccountType.values)
        defined_types = DEBIT_NORMAL_TYPES | CREDIT_NORMAL_TYPES

        for account_type in all_types:
            self.assertIn(
                account_type, defined_types,
                f"AccountType {account_type} does not have a defined normal balance"
            )

    def test_no_type_in_both_debit_and_credit(self):
        """Test that no account type is in both debit and credit normal sets."""
        overlap = DEBIT_NORMAL_TYPES & CREDIT_NORMAL_TYPES
        self.assertEqual(len(overlap), 0, f"Account types in both sets: {overlap}")

    def test_asset_types_are_debit_normal(self):
        """Test that asset types have debit normal balance."""
        asset_types = [
            AccountType.ASSET_CURRENT,
            AccountType.ASSET_FIXED,
            AccountType.ASSET_OTHER,
        ]
        for atype in asset_types:
            self.assertIn(atype, DEBIT_NORMAL_TYPES)

    def test_liability_types_are_credit_normal(self):
        """Test that liability types have credit normal balance."""
        liability_types = [
            AccountType.LIABILITY_CURRENT,
            AccountType.LIABILITY_LONG_TERM,
        ]
        for atype in liability_types:
            self.assertIn(atype, CREDIT_NORMAL_TYPES)

    def test_revenue_types_are_credit_normal(self):
        """Test that revenue types have credit normal balance."""
        revenue_types = [
            AccountType.REVENUE,
            AccountType.REVENUE_OTHER,
        ]
        for atype in revenue_types:
            self.assertIn(atype, CREDIT_NORMAL_TYPES)

    def test_expense_types_are_debit_normal(self):
        """Test that expense types have debit normal balance."""
        expense_types = [
            AccountType.EXPENSE_COGS,
            AccountType.EXPENSE_OPERATING,
            AccountType.EXPENSE_OTHER,
        ]
        for atype in expense_types:
            self.assertIn(atype, DEBIT_NORMAL_TYPES)
