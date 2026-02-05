"""
Double-Entry General Ledger System for Raven SaaS.

This module implements strict double-entry accounting principles:
- Every transaction must have equal debits and credits
- Accounts have "normal balances" (debit or credit based on type)
- Journal entries can be draft or posted (locked)
- Full audit trail via historical records

Account Types and Normal Balances:
- Assets: Debit normal (increase with debit)
- Liabilities: Credit normal (increase with credit)
- Equity: Credit normal (increase with credit)
- Revenue: Credit normal (increase with credit)
- Expenses: Debit normal (increase with debit)
"""

from decimal import Decimal
from django.db import models
from django.db.models import Sum, Q
from django.conf import settings
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from simple_history.models import HistoricalRecords

from shared.models import TenantMixin, TimestampMixin


# ─── Account Type Choices ───────────────────────────────────────────────────────

class AccountType(models.TextChoices):
    """
    Standard accounting classifications following GAAP.
    Each type has a "normal balance" side (debit or credit).
    """
    # Assets - Debit Normal
    ASSET_CURRENT = 'ASSET_CURRENT', 'Current Assets'
    ASSET_FIXED = 'ASSET_FIXED', 'Fixed Assets'
    ASSET_OTHER = 'ASSET_OTHER', 'Other Assets'

    # Contra-Assets - Credit Normal (reduces assets)
    CONTRA_ASSET = 'CONTRA_ASSET', 'Contra Assets'

    # Liabilities - Credit Normal
    LIABILITY_CURRENT = 'LIABILITY_CURRENT', 'Current Liabilities'
    LIABILITY_LONG_TERM = 'LIABILITY_LONG_TERM', 'Long-Term Liabilities'

    # Equity - Credit Normal
    EQUITY = 'EQUITY', 'Equity'

    # Revenue - Credit Normal
    REVENUE = 'REVENUE', 'Revenue'
    REVENUE_OTHER = 'REVENUE_OTHER', 'Other Income'

    # Contra-Revenue - Debit Normal (reduces revenue)
    CONTRA_REVENUE = 'CONTRA_REVENUE', 'Sales Returns & Allowances'

    # Expenses - Debit Normal
    EXPENSE_COGS = 'EXPENSE_COGS', 'Cost of Goods Sold'
    EXPENSE_OPERATING = 'EXPENSE_OPERATING', 'Operating Expenses'
    EXPENSE_OTHER = 'EXPENSE_OTHER', 'Other Expenses'


# Define which account types have debit-normal balances
DEBIT_NORMAL_TYPES = {
    AccountType.ASSET_CURRENT,
    AccountType.ASSET_FIXED,
    AccountType.ASSET_OTHER,
    AccountType.EXPENSE_COGS,
    AccountType.EXPENSE_OPERATING,
    AccountType.EXPENSE_OTHER,
    AccountType.CONTRA_REVENUE,
}

CREDIT_NORMAL_TYPES = {
    AccountType.CONTRA_ASSET,
    AccountType.LIABILITY_CURRENT,
    AccountType.LIABILITY_LONG_TERM,
    AccountType.EQUITY,
    AccountType.REVENUE,
    AccountType.REVENUE_OTHER,
}


# ─── Account Model ──────────────────────────────────────────────────────────────

class Account(TenantMixin, TimestampMixin):
    """
    Chart of Accounts entry.

    Accounts are organized hierarchically with parent/child relationships.
    The account code follows a standard numbering scheme:
    - 1xxx: Assets
    - 2xxx: Liabilities
    - 3xxx: Equity
    - 4xxx: Revenue
    - 5xxx: Cost of Goods Sold
    - 6xxx: Operating Expenses
    - 7xxx: Other Income/Expenses
    """
    code = models.CharField(
        max_length=20,
        help_text="Account code (e.g., '1000', '1100.10')"
    )
    name = models.CharField(
        max_length=255,
        help_text="Account name (e.g., 'Cash on Hand')"
    )
    description = models.TextField(
        blank=True,
        help_text="Detailed description of account usage"
    )
    account_type = models.CharField(
        max_length=30,
        choices=AccountType.choices,
        help_text="Classification determining normal balance"
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent account for sub-accounts"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive accounts cannot receive new transactions"
    )
    is_system = models.BooleanField(
        default=False,
        help_text="System accounts cannot be deleted (AR, AP, etc.)"
    )

    # Optional: Link to specific entity for sub-ledger tracking
    # e.g., Customer-specific AR accounts, Vendor-specific AP accounts
    entity_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Entity type for sub-ledger accounts"
    )
    entity_id = models.PositiveIntegerField(null=True, blank=True)
    entity = GenericForeignKey('entity_type', 'entity_id')

    history = HistoricalRecords()

    class Meta:
        ordering = ['code']
        unique_together = [('tenant', 'code')]
        indexes = [
            models.Index(fields=['tenant', 'code']),
            models.Index(fields=['tenant', 'account_type']),
            models.Index(fields=['tenant', 'is_active']),
            models.Index(fields=['tenant', 'parent']),
        ]
        verbose_name = 'Account'
        verbose_name_plural = 'Chart of Accounts'

    def __str__(self):
        return f"{self.code} - {self.name}"

    @property
    def is_debit_normal(self) -> bool:
        """Returns True if this account increases with debits."""
        return self.account_type in DEBIT_NORMAL_TYPES

    @property
    def is_credit_normal(self) -> bool:
        """Returns True if this account increases with credits."""
        return self.account_type in CREDIT_NORMAL_TYPES

    @property
    def full_code(self) -> str:
        """Returns hierarchical code path (e.g., '1000.1100.1110')."""
        if self.parent:
            return f"{self.parent.full_code}.{self.code}"
        return self.code

    def clean(self):
        super().clean()
        # Validate parent is same account type category
        if self.parent and self.parent.account_type != self.account_type:
            raise ValidationError({
                'parent': 'Parent account must be of the same account type.'
            })


# ─── Fiscal Period Model ────────────────────────────────────────────────────────

class FiscalPeriod(TenantMixin, TimestampMixin):
    """
    Fiscal periods for period-based reporting and closing.
    Periods can be locked to prevent posting to closed periods.
    """
    class PeriodStatus(models.TextChoices):
        OPEN = 'open', 'Open'
        SOFT_CLOSE = 'soft_close', 'Soft Close'  # Warnings but allows posting
        CLOSED = 'closed', 'Closed'  # No posting allowed

    name = models.CharField(
        max_length=50,
        help_text="Period name (e.g., 'January 2026', 'Q1 2026')"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=PeriodStatus.choices,
        default=PeriodStatus.OPEN
    )
    is_year_end = models.BooleanField(
        default=False,
        help_text="Mark if this is a year-end closing period"
    )

    class Meta:
        ordering = ['start_date']
        unique_together = [('tenant', 'start_date', 'end_date')]
        indexes = [
            models.Index(fields=['tenant', 'start_date']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"{self.name} ({self.status})"

    def clean(self):
        super().clean()
        if self.end_date < self.start_date:
            raise ValidationError({
                'end_date': 'End date must be after start date.'
            })


# ─── Journal Entry Model ────────────────────────────────────────────────────────

class JournalEntry(TenantMixin, TimestampMixin):
    """
    A journal entry is a collection of debits and credits that must balance.

    Entries start as 'draft' and can be edited.
    Once 'posted', entries are locked and cannot be modified.
    To correct a posted entry, create a reversing entry.
    """
    class EntryStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        POSTED = 'posted', 'Posted'
        REVERSED = 'reversed', 'Reversed'

    class EntryType(models.TextChoices):
        """Standard journal entry classifications."""
        STANDARD = 'standard', 'Standard Entry'
        ADJUSTING = 'adjusting', 'Adjusting Entry'
        CLOSING = 'closing', 'Closing Entry'
        REVERSING = 'reversing', 'Reversing Entry'
        RECURRING = 'recurring', 'Recurring Entry'

    # Entry identification
    entry_number = models.CharField(
        max_length=30,
        help_text="Auto-generated entry number (e.g., 'JE-2026-0001')"
    )
    date = models.DateField(
        help_text="Transaction date"
    )
    memo = models.CharField(
        max_length=500,
        help_text="Description of the transaction"
    )
    reference_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="External reference (invoice #, check #, etc.)"
    )

    # Entry classification
    entry_type = models.CharField(
        max_length=20,
        choices=EntryType.choices,
        default=EntryType.STANDARD
    )
    status = models.CharField(
        max_length=20,
        choices=EntryStatus.choices,
        default=EntryStatus.DRAFT
    )

    # Fiscal period linkage
    fiscal_period = models.ForeignKey(
        FiscalPeriod,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='journal_entries',
        help_text="Fiscal period for this entry"
    )

    # Source document linkage (Generic FK)
    source_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Type of source document"
    )
    source_id = models.PositiveIntegerField(null=True, blank=True)
    source_document = GenericForeignKey('source_type', 'source_id')

    # Reversing entry linkage
    reversed_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reverses',
        help_text="Entry that reversed this entry"
    )

    # Audit fields
    posted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when entry was posted"
    )
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='posted_journal_entries',
        help_text="User who posted this entry"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='created_journal_entries',
        help_text="User who created this entry"
    )

    history = HistoricalRecords()

    class Meta:
        ordering = ['-date', '-entry_number']
        unique_together = [('tenant', 'entry_number')]
        indexes = [
            models.Index(fields=['tenant', 'entry_number']),
            models.Index(fields=['tenant', 'date']),
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'entry_type']),
            models.Index(fields=['source_type', 'source_id']),
        ]
        verbose_name = 'Journal Entry'
        verbose_name_plural = 'Journal Entries'

    def __str__(self):
        return f"{self.entry_number} - {self.date} - {self.memo[:50]}"

    @property
    def is_balanced(self) -> bool:
        """Check if total debits equal total credits."""
        totals = self.lines.aggregate(
            total_debit=Sum('debit'),
            total_credit=Sum('credit')
        )
        debit = totals['total_debit'] or Decimal('0.00')
        credit = totals['total_credit'] or Decimal('0.00')
        return debit == credit

    @property
    def total_debit(self) -> Decimal:
        """Sum of all debit amounts."""
        return self.lines.aggregate(total=Sum('debit'))['total'] or Decimal('0.00')

    @property
    def total_credit(self) -> Decimal:
        """Sum of all credit amounts."""
        return self.lines.aggregate(total=Sum('credit'))['total'] or Decimal('0.00')

    @property
    def is_posted(self) -> bool:
        """Returns True if entry is locked."""
        return self.status == self.EntryStatus.POSTED

    def clean(self):
        super().clean()
        # Prevent editing posted entries
        if self.pk:
            original = JournalEntry.objects.get(pk=self.pk)
            if original.is_posted and self.status != self.EntryStatus.REVERSED:
                raise ValidationError(
                    "Posted journal entries cannot be modified. Create a reversing entry instead."
                )


# ─── Journal Entry Line Model ───────────────────────────────────────────────────

class JournalEntryLine(TenantMixin):
    """
    Individual debit or credit line within a journal entry.

    Rules:
    - Each line must have either a debit OR credit amount (not both)
    - Zero amounts are not allowed
    - The sum of debits must equal sum of credits for the parent entry
    """
    entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent journal entry"
    )
    line_number = models.PositiveIntegerField(
        default=10,
        help_text="Line sequence (10, 20, 30...)"
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='journal_lines',
        help_text="Account to debit or credit"
    )
    description = models.CharField(
        max_length=500,
        blank=True,
        help_text="Line-specific description"
    )
    debit = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Debit amount (left side of T-account)"
    )
    credit = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Credit amount (right side of T-account)"
    )

    # Optional: Entity reference for sub-ledger tracking
    entity_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    entity_id = models.PositiveIntegerField(null=True, blank=True)
    entity = GenericForeignKey('entity_type', 'entity_id')

    class Meta:
        ordering = ['entry', 'line_number']
        indexes = [
            models.Index(fields=['tenant', 'entry']),
            models.Index(fields=['tenant', 'account']),
            models.Index(fields=['entity_type', 'entity_id']),
        ]
        verbose_name = 'Journal Entry Line'
        verbose_name_plural = 'Journal Entry Lines'

    def __str__(self):
        amount = self.debit if self.debit > 0 else self.credit
        side = 'DR' if self.debit > 0 else 'CR'
        return f"{self.account.code} {side} {amount}"

    @property
    def amount(self) -> Decimal:
        """Returns the non-zero amount (debit or credit)."""
        return self.debit if self.debit > 0 else self.credit

    @property
    def is_debit(self) -> bool:
        """Returns True if this is a debit entry."""
        return self.debit > 0

    @property
    def is_credit(self) -> bool:
        """Returns True if this is a credit entry."""
        return self.credit > 0

    def clean(self):
        super().clean()

        # Validate: cannot have both debit and credit
        if self.debit > 0 and self.credit > 0:
            raise ValidationError(
                "A line cannot have both debit and credit amounts."
            )

        # Validate: must have at least one non-zero amount
        if self.debit == 0 and self.credit == 0:
            raise ValidationError(
                "A line must have either a debit or credit amount."
            )

        # Validate: amounts must be positive
        if self.debit < 0 or self.credit < 0:
            raise ValidationError(
                "Debit and credit amounts must be positive."
            )

        # Validate: account must be active
        if not self.account.is_active:
            raise ValidationError({
                'account': f"Account {self.account.code} is inactive."
            })

        # Validate: cannot modify lines on posted entries
        if self.entry_id and self.entry.is_posted:
            raise ValidationError(
                "Cannot modify lines on a posted journal entry."
            )


# ─── Account Balance Cache ──────────────────────────────────────────────────────

class AccountBalance(TenantMixin):
    """
    Cached account balances for performance.
    Updated via signals when journal entries are posted.

    This is a denormalized table for fast balance lookups.
    The authoritative balance is always calculated from JournalEntryLine.
    """
    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name='balance_cache'
    )
    fiscal_period = models.ForeignKey(
        FiscalPeriod,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Period for period-specific balance, null for running balance"
    )

    # Period activity
    period_debit = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total debits in period"
    )
    period_credit = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total credits in period"
    )

    # Running totals
    beginning_balance = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Balance at start of period"
    )
    ending_balance = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Balance at end of period"
    )

    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('tenant', 'account', 'fiscal_period')]
        indexes = [
            models.Index(fields=['tenant', 'account']),
            models.Index(fields=['tenant', 'fiscal_period']),
        ]

    def __str__(self):
        period = self.fiscal_period.name if self.fiscal_period else 'Current'
        return f"{self.account.code} - {period}: {self.ending_balance}"

    @property
    def net_change(self) -> Decimal:
        """Net change for the period (considering normal balance)."""
        if self.account.is_debit_normal:
            return self.period_debit - self.period_credit
        return self.period_credit - self.period_debit


# ─── Recurring Entry Template ───────────────────────────────────────────────────

class RecurringEntryTemplate(TenantMixin, TimestampMixin):
    """
    Template for recurring journal entries (monthly accruals, depreciation, etc.)
    """
    class Frequency(models.TextChoices):
        DAILY = 'daily', 'Daily'
        WEEKLY = 'weekly', 'Weekly'
        MONTHLY = 'monthly', 'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'
        ANNUALLY = 'annually', 'Annually'

    name = models.CharField(max_length=100)
    memo = models.CharField(max_length=500)
    frequency = models.CharField(
        max_length=20,
        choices=Frequency.choices,
        default=Frequency.MONTHLY
    )
    next_date = models.DateField(
        help_text="Next scheduled execution date"
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Stop generating after this date"
    )
    is_active = models.BooleanField(default=True)
    auto_post = models.BooleanField(
        default=False,
        help_text="Automatically post generated entries"
    )

    class Meta:
        ordering = ['next_date']
        indexes = [
            models.Index(fields=['tenant', 'is_active', 'next_date']),
        ]

    def __str__(self):
        return f"{self.name} ({self.frequency})"


class RecurringEntryLine(TenantMixin):
    """Lines for recurring entry templates."""
    template = models.ForeignKey(
        RecurringEntryTemplate,
        on_delete=models.CASCADE,
        related_name='lines'
    )
    line_number = models.PositiveIntegerField(default=10)
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT
    )
    description = models.CharField(max_length=500, blank=True)
    debit = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=Decimal('0.00')
    )
    credit = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=Decimal('0.00')
    )

    class Meta:
        ordering = ['template', 'line_number']


# ─── Accounting Settings ────────────────────────────────────────────────────────

class AccountingSettings(TimestampMixin):
    """
    Default GL account mappings for a tenant.

    These defaults are used when creating Items, Customers, and Vendors
    without specifying explicit account mappings.
    """
    tenant = models.OneToOneField(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        related_name='accounting_settings',
        primary_key=True
    )

    # Default Revenue/Income Accounts
    default_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default revenue account for sales (typically 4000 Sales Revenue)"
    )

    # Default COGS Account
    default_cogs_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default COGS account (typically 5000 Cost of Goods Sold)"
    )

    # Default Inventory Asset Account
    default_inventory_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default inventory asset account (typically 1230 Finished Goods)"
    )

    # Default AR Account (for Customers)
    default_ar_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default A/R account for customers (typically 1110 A/R Trade)"
    )

    # Default AP Account (for Vendors)
    default_ap_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default A/P account for vendors (typically 2010 A/P Trade)"
    )

    # Additional defaults for common transactions
    default_cash_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default cash account for payments (typically 1020 Operating)"
    )

    default_freight_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default account for freight charged to customers"
    )

    default_freight_expense_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default account for freight costs"
    )

    default_sales_discount_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default account for sales discounts given"
    )

    default_purchase_discount_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Default account for purchase discounts received"
    )

    class Meta:
        verbose_name = 'Accounting Settings'
        verbose_name_plural = 'Accounting Settings'

    def __str__(self):
        return f"Accounting Settings for {self.tenant.name}"

    @classmethod
    def get_for_tenant(cls, tenant):
        """Get or create accounting settings for a tenant."""
        settings, created = cls.objects.get_or_create(tenant=tenant)
        return settings
