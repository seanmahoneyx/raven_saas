"""
Tests for Accounting API: Account and JournalEntry models, services, and endpoints.
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant, TenantSequence
from apps.accounting.models import Account, AccountType, JournalEntry, JournalEntryLine
from apps.accounting.services import AccountingService, UnbalancedEntryError, PostedEntryError, AccountingError
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# BASE TEST CLASS
# =============================================================================

class AccountingTestCase(TestCase):
    """Base test case with shared setup for accounting tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='Test Company',
            subdomain='test-accounting',
            is_default=True,
        )
        cls.user = User.objects.create_user(
            username='testuser',
            email='testuser@test.com',
            password='testpass123',
        )
        set_current_tenant(cls.tenant)

        # Create test accounts
        cls.cash = Account.objects.create(
            tenant=cls.tenant,
            code='1000',
            name='Cash',
            account_type=AccountType.ASSET_CURRENT,
            is_active=True,
        )
        cls.ar = Account.objects.create(
            tenant=cls.tenant,
            code='1100',
            name='Accounts Receivable',
            account_type=AccountType.ASSET_CURRENT,
            is_active=True,
        )
        cls.ap = Account.objects.create(
            tenant=cls.tenant,
            code='2000',
            name='Accounts Payable',
            account_type=AccountType.LIABILITY_CURRENT,
            is_active=True,
        )
        cls.revenue = Account.objects.create(
            tenant=cls.tenant,
            code='4000',
            name='Sales Revenue',
            account_type=AccountType.REVENUE,
            is_active=True,
        )
        cls.expense = Account.objects.create(
            tenant=cls.tenant,
            code='5000',
            name='Cost of Goods Sold',
            account_type=AccountType.EXPENSE_COGS,
            is_active=True,
        )
        cls.inactive_account = Account.objects.create(
            tenant=cls.tenant,
            code='9999',
            name='Inactive Account',
            account_type=AccountType.EXPENSE_OTHER,
            is_active=False,
        )

        # Create TenantSequence for journal entry numbering
        TenantSequence.objects.create(
            tenant=cls.tenant,
            sequence_type='JE',
            prefix='JE-',
            next_value=1,
            padding=6,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)


# =============================================================================
# MODEL TESTS
# =============================================================================

class AccountModelTests(AccountingTestCase):
    """Tests for Account model."""

    def test_create_account(self):
        account = Account.objects.create(
            tenant=self.tenant,
            code='1500',
            name='Inventory',
            account_type=AccountType.ASSET_CURRENT,
            is_active=True,
        )
        self.assertEqual(account.code, '1500')
        self.assertEqual(account.name, 'Inventory')
        self.assertEqual(account.account_type, AccountType.ASSET_CURRENT)
        self.assertTrue(account.is_active)

    def test_account_str_representation(self):
        self.assertEqual(str(self.cash), '1000 - Cash')

    def test_is_debit_normal_for_asset(self):
        self.assertTrue(self.cash.is_debit_normal)

    def test_is_credit_normal_for_liability(self):
        self.assertTrue(self.ap.is_credit_normal)
        self.assertFalse(self.ap.is_debit_normal)

    def test_is_credit_normal_for_revenue(self):
        self.assertTrue(self.revenue.is_credit_normal)
        self.assertFalse(self.revenue.is_debit_normal)

    def test_is_debit_normal_for_expense(self):
        self.assertTrue(self.expense.is_debit_normal)
        self.assertFalse(self.expense.is_credit_normal)

    def test_unique_code_per_tenant(self):
        with self.assertRaises(IntegrityError):
            Account.objects.create(
                tenant=self.tenant,
                code='1000',  # Duplicate code
                name='Duplicate Cash',
                account_type=AccountType.ASSET_CURRENT,
                is_active=True,
            )

    def test_parent_child_relationship(self):
        parent_account = Account.objects.create(
            tenant=self.tenant,
            code='1200',
            name='Equipment',
            account_type=AccountType.ASSET_FIXED,
            is_active=True,
        )
        child_account = Account.objects.create(
            tenant=self.tenant,
            code='1210',
            name='Office Equipment',
            account_type=AccountType.ASSET_FIXED,
            parent=parent_account,
            is_active=True,
        )
        self.assertEqual(child_account.parent, parent_account)
        self.assertIn(child_account, parent_account.children.all())


class JournalEntryModelTests(AccountingTestCase):
    """Tests for JournalEntry model."""

    def test_create_journal_entry(self):
        entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-TEST-001',
            date=date.today(),
            memo='Test journal entry',
            entry_type='standard',
            status='draft',
            created_by=self.user,
        )
        self.assertEqual(entry.entry_number, 'JE-TEST-001')
        self.assertEqual(entry.status, 'draft')
        self.assertEqual(entry.created_by, self.user)

    def test_is_balanced_property(self):
        entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-TEST-002',
            date=date.today(),
            memo='Balanced entry',
            entry_type='standard',
            status='draft',
            created_by=self.user,
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=entry,
            line_number=10,
            account=self.cash,
            debit=Decimal('100.00'),
            credit=Decimal('0.00'),
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=entry,
            line_number=20,
            account=self.revenue,
            debit=Decimal('0.00'),
            credit=Decimal('100.00'),
        )
        self.assertTrue(entry.is_balanced)

        # Create unbalanced entry
        unbalanced_entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-TEST-003',
            date=date.today(),
            memo='Unbalanced entry',
            entry_type='standard',
            status='draft',
            created_by=self.user,
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=unbalanced_entry,
            line_number=10,
            account=self.cash,
            debit=Decimal('100.00'),
            credit=Decimal('0.00'),
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=unbalanced_entry,
            line_number=20,
            account=self.revenue,
            debit=Decimal('0.00'),
            credit=Decimal('50.00'),
        )
        self.assertFalse(unbalanced_entry.is_balanced)

    def test_total_debit_and_credit(self):
        entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-TEST-004',
            date=date.today(),
            memo='Test totals',
            entry_type='standard',
            status='draft',
            created_by=self.user,
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=entry,
            line_number=10,
            account=self.cash,
            debit=Decimal('250.00'),
            credit=Decimal('0.00'),
        )
        JournalEntryLine.objects.create(
            tenant=self.tenant,
            entry=entry,
            line_number=20,
            account=self.revenue,
            debit=Decimal('0.00'),
            credit=Decimal('250.00'),
        )
        self.assertEqual(entry.total_debit, Decimal('250.00'))
        self.assertEqual(entry.total_credit, Decimal('250.00'))

    def test_is_posted_property(self):
        draft_entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-TEST-005',
            date=date.today(),
            memo='Draft entry',
            entry_type='standard',
            status='draft',
            created_by=self.user,
        )
        self.assertFalse(draft_entry.is_posted)

        posted_entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number='JE-TEST-006',
            date=date.today(),
            memo='Posted entry',
            entry_type='standard',
            status='posted',
            created_by=self.user,
        )
        self.assertTrue(posted_entry.is_posted)


# =============================================================================
# SERVICE TESTS
# =============================================================================

class AccountingServiceTests(AccountingTestCase):
    """Tests for AccountingService."""

    def setUp(self):
        super().setUp()
        self.service = AccountingService(self.tenant)

    def test_create_entry(self):
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Test balanced entry',
            lines=[
                {'account_code': '1100', 'debit': Decimal('100.00')},
                {'account_code': '4000', 'credit': Decimal('100.00')},
            ],
            created_by=self.user,
        )
        self.assertIsNotNone(entry.id)
        self.assertEqual(entry.status, 'draft')
        self.assertEqual(entry.lines.count(), 2)
        self.assertTrue(entry.is_balanced)

    def test_create_entry_unbalanced_raises(self):
        with self.assertRaises(UnbalancedEntryError):
            self.service.create_entry(
                entry_date=date.today(),
                memo='Unbalanced entry',
                lines=[
                    {'account_code': '1100', 'debit': Decimal('100.00')},
                    {'account_code': '4000', 'credit': Decimal('50.00')},
                ],
                created_by=self.user,
            )

    def test_create_entry_less_than_2_lines_raises(self):
        with self.assertRaises(AccountingError):
            self.service.create_entry(
                entry_date=date.today(),
                memo='Single line entry',
                lines=[
                    {'account_code': '1100', 'debit': Decimal('100.00')},
                ],
                created_by=self.user,
            )

    def test_post_entry(self):
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry to post',
            lines=[
                {'account_code': '1100', 'debit': Decimal('500.00')},
                {'account_code': '4000', 'credit': Decimal('500.00')},
            ],
            created_by=self.user,
        )
        posted_entry = self.service.post_entry(entry.id, posted_by=self.user)
        self.assertEqual(posted_entry.status, 'posted')
        self.assertIsNotNone(posted_entry.posted_at)
        self.assertEqual(posted_entry.posted_by, self.user)

    def test_post_already_posted_raises(self):
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry to post',
            lines=[
                {'account_code': '1100', 'debit': Decimal('300.00')},
                {'account_code': '4000', 'credit': Decimal('300.00')},
            ],
            created_by=self.user,
        )
        self.service.post_entry(entry.id, posted_by=self.user)

        with self.assertRaises(PostedEntryError):
            self.service.post_entry(entry.id, posted_by=self.user)

    def test_reverse_entry(self):
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Entry to reverse',
            lines=[
                {'account_code': '1100', 'debit': Decimal('200.00')},
                {'account_code': '4000', 'credit': Decimal('200.00')},
            ],
            created_by=self.user,
        )
        self.service.post_entry(entry.id, posted_by=self.user)

        reversing_entry = self.service.reverse_entry(
            entry_id=entry.id,
            reversal_date=date.today(),
            memo='Reversal',
            created_by=self.user,
        )
        self.assertIsNotNone(reversing_entry.id)
        self.assertEqual(reversing_entry.entry_type, 'reversing')
        self.assertEqual(reversing_entry.lines.count(), 2)

        # Check debits/credits are swapped
        original_lines = list(entry.lines.order_by('line_number'))
        reversing_lines = list(reversing_entry.lines.order_by('line_number'))

        for orig, rev in zip(original_lines, reversing_lines):
            self.assertEqual(rev.debit, orig.credit)
            self.assertEqual(rev.credit, orig.debit)

    def test_reverse_non_posted_raises(self):
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Draft entry',
            lines=[
                {'account_code': '1100', 'debit': Decimal('150.00')},
                {'account_code': '4000', 'credit': Decimal('150.00')},
            ],
            created_by=self.user,
        )

        with self.assertRaises(AccountingError):
            self.service.reverse_entry(
                entry_id=entry.id,
                reversal_date=date.today(),
                memo='Reversal',
                created_by=self.user,
            )

    def test_get_account_balance(self):
        # Create and post an entry
        entry = self.service.create_entry(
            entry_date=date.today(),
            memo='Balance test',
            lines=[
                {'account_code': '1100', 'debit': Decimal('1000.00')},
                {'account_code': '4000', 'credit': Decimal('1000.00')},
            ],
            created_by=self.user,
        )
        self.service.post_entry(entry.id, posted_by=self.user)

        # Check AR balance (debit normal asset - should have positive balance)
        ar_balance = self.service.get_account_balance(self.ar.id, as_of_date=date.today())
        self.assertEqual(ar_balance.balance, Decimal('1000.00'))
        self.assertTrue(ar_balance.is_debit_balance)

        # Check revenue balance (credit normal - should have positive balance)
        rev_balance = self.service.get_account_balance(self.revenue.id, as_of_date=date.today())
        self.assertEqual(rev_balance.balance, Decimal('1000.00'))
        self.assertFalse(rev_balance.is_debit_balance)


# =============================================================================
# ACCOUNT API TESTS
# =============================================================================

class AccountAPITests(AccountingTestCase):
    """Tests for Account API endpoints."""

    def test_list_accounts(self):
        response = self.client.get('/api/v1/accounts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 5)

    def test_list_accounts_has_children_count(self):
        parent = Account.objects.create(
            tenant=self.tenant,
            code='3000',
            name='Parent Account',
            account_type=AccountType.EQUITY,
            is_active=True,
        )
        Account.objects.create(
            tenant=self.tenant,
            code='3100',
            name='Child Account',
            account_type=AccountType.EQUITY,
            parent=parent,
            is_active=True,
        )

        response = self.client.get('/api/v1/accounts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        parent_data = next(
            (item for item in response.data['results'] if item['code'] == '3000'),
            None
        )
        self.assertIsNotNone(parent_data)
        self.assertEqual(parent_data['children_count'], 1)

    def test_retrieve_account(self):
        response = self.client.get(f'/api/v1/accounts/{self.cash.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['code'], '1000')
        self.assertEqual(response.data['name'], 'Cash')

    def test_create_account_via_api(self):
        response = self.client.post('/api/v1/accounts/', {
            'code': '1300',
            'name': 'Prepaid Expenses',
            'account_type': AccountType.ASSET_CURRENT,
            'is_active': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['code'], '1300')
        self.assertEqual(response.data['name'], 'Prepaid Expenses')

    def test_update_account_via_api(self):
        response = self.client.patch(f'/api/v1/accounts/{self.cash.id}/', {
            'name': 'Cash on Hand',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Cash on Hand')

    def test_filter_by_account_type(self):
        response = self.client.get('/api/v1/accounts/', {
            'account_type': AccountType.ASSET_CURRENT,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for account in response.data['results']:
            self.assertEqual(account['account_type'], AccountType.ASSET_CURRENT)

    def test_filter_by_is_active(self):
        response = self.client.get('/api/v1/accounts/', {
            'is_active': 'true',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for account in response.data['results']:
            self.assertTrue(account['is_active'])

    def test_search_by_name(self):
        response = self.client.get('/api/v1/accounts/', {
            'search': 'Cash',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)
        self.assertTrue(
            any('Cash' in account['name'] for account in response.data['results'])
        )

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/v1/accounts/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# =============================================================================
# JOURNAL ENTRY API TESTS
# =============================================================================

class JournalEntryAPITests(AccountingTestCase):
    """Tests for JournalEntry API endpoints."""

    def _create_test_entry(self, memo='Test entry', amount='100.00'):
        """Helper to create a journal entry via the service."""
        service = AccountingService(self.tenant)
        return service.create_entry(
            entry_date=date.today(),
            memo=memo,
            lines=[
                {'account_code': '1100', 'debit': Decimal(amount)},
                {'account_code': '4000', 'credit': Decimal(amount)},
            ],
            created_by=self.user,
        )

    def test_list_journal_entries(self):
        self._create_test_entry()

        response = self.client.get('/api/v1/journal-entries/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_retrieve_journal_entry_with_lines(self):
        entry = self._create_test_entry(memo='Entry with lines', amount='200.00')

        response = self.client.get(f'/api/v1/journal-entries/{entry.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['memo'], 'Entry with lines')
        self.assertEqual(len(response.data['lines']), 2)

    def test_create_journal_entry_via_api(self):
        response = self.client.post('/api/v1/journal-entries/', {
            'date': '2026-01-15',
            'memo': 'Test entry via API',
            'entry_type': 'standard',
            'lines': [
                {'account_code': '1100', 'debit': '100.00', 'credit': '0.00'},
                {'account_code': '4000', 'debit': '0.00', 'credit': '100.00'},
            ]
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        # Verify the entry was created in the database
        set_current_tenant(self.tenant)
        entry = JournalEntry.objects.get(memo='Test entry via API')
        self.assertEqual(entry.lines.count(), 2)

    def test_create_unbalanced_entry_returns_400(self):
        response = self.client.post('/api/v1/journal-entries/', {
            'date': '2026-01-15',
            'memo': 'Unbalanced entry',
            'entry_type': 'standard',
            'lines': [
                {'account_code': '1100', 'debit': '100.00', 'credit': '0.00'},
                {'account_code': '4000', 'debit': '0.00', 'credit': '50.00'},
            ]
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_draft_entry(self):
        entry = self._create_test_entry(memo='Entry to post', amount='500.00')

        response = self.client.post(f'/api/v1/journal-entries/{entry.id}/post/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'posted')
        self.assertIsNotNone(response.data['posted_at'])

    def test_post_non_draft_returns_400(self):
        entry = self._create_test_entry(memo='Entry to post', amount='300.00')
        service = AccountingService(self.tenant)
        service.post_entry(entry.id, posted_by=self.user)

        response = self.client.post(f'/api/v1/journal-entries/{entry.id}/post/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reverse_posted_entry(self):
        entry = self._create_test_entry(memo='Entry to reverse', amount='400.00')
        service = AccountingService(self.tenant)
        service.post_entry(entry.id, posted_by=self.user)

        response = self.client.post(
            f'/api/v1/journal-entries/{entry.id}/reverse/',
            {'memo': 'Reversal via API'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['entry_type'], 'reversing')

    def test_reverse_non_posted_returns_400(self):
        entry = self._create_test_entry(memo='Draft entry', amount='150.00')

        response = self.client.post(
            f'/api/v1/journal-entries/{entry.id}/reverse/',
            {'memo': 'Reversal'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_entry_lines(self):
        entry = self._create_test_entry(memo='Entry for lines test', amount='250.00')

        response = self.client.get(f'/api/v1/journal-entries/{entry.id}/lines/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_filter_by_status(self):
        self._create_test_entry(memo='Draft entry')

        response = self.client.get('/api/v1/journal-entries/', {
            'status': 'draft',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for entry in response.data['results']:
            self.assertEqual(entry['status'], 'draft')

    def test_search_by_memo(self):
        self._create_test_entry(memo='Searchable test entry', amount='75.00')

        response = self.client.get('/api/v1/journal-entries/', {
            'search': 'Searchable',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)
        self.assertTrue(
            any('Searchable' in entry['memo'] for entry in response.data['results'])
        )
