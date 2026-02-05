"""
Accounting Service Layer for Raven SaaS.

This service enforces strict double-entry accounting rules:
- All journal entries must balance (debits = credits)
- Posted entries are immutable
- Account balances are calculated based on normal balance rules

Usage:
    from apps.accounting.services import AccountingService

    service = AccountingService(tenant)
    entry = service.create_entry(
        date=date.today(),
        memo="Record sales invoice INV-001",
        lines=[
            {'account_code': '1100', 'debit': Decimal('1000.00')},  # AR
            {'account_code': '4000', 'credit': Decimal('1000.00')},  # Revenue
        ]
    )
    service.post_entry(entry.id)
"""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Optional, Union, Any
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Sum, Q
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.contrib.contenttypes.models import ContentType

from .models import (
    Account,
    AccountType,
    JournalEntry,
    JournalEntryLine,
    FiscalPeriod,
    AccountBalance,
    RecurringEntryTemplate,
    RecurringEntryLine,
    DEBIT_NORMAL_TYPES,
    CREDIT_NORMAL_TYPES,
)
from apps.tenants.models import Tenant, TenantSequence


# ─── Data Classes ───────────────────────────────────────────────────────────────

@dataclass
class EntryLineInput:
    """Input for creating a journal entry line."""
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    description: str = ''
    debit: Decimal = Decimal('0.00')
    credit: Decimal = Decimal('0.00')
    entity: Optional[Any] = None  # For sub-ledger tracking


@dataclass
class AccountBalanceResult:
    """Result of balance calculation."""
    account: Account
    as_of_date: date
    total_debit: Decimal
    total_credit: Decimal
    balance: Decimal  # Calculated based on normal balance
    is_debit_balance: bool


# ─── Exceptions ─────────────────────────────────────────────────────────────────

class AccountingError(Exception):
    """Base exception for accounting errors."""
    pass


class UnbalancedEntryError(AccountingError):
    """Raised when debits don't equal credits."""
    def __init__(self, debit_total: Decimal, credit_total: Decimal):
        self.debit_total = debit_total
        self.credit_total = credit_total
        difference = abs(debit_total - credit_total)
        super().__init__(
            f"Entry is unbalanced. Debits: {debit_total}, Credits: {credit_total}, "
            f"Difference: {difference}"
        )


class PostedEntryError(AccountingError):
    """Raised when attempting to modify a posted entry."""
    pass


class InactiveAccountError(AccountingError):
    """Raised when posting to an inactive account."""
    pass


class ClosedPeriodError(AccountingError):
    """Raised when posting to a closed fiscal period."""
    pass


# ─── Accounting Service ─────────────────────────────────────────────────────────

class AccountingService:
    """
    Service class for all accounting operations.

    Provides methods for:
    - Creating and posting journal entries
    - Calculating account balances
    - Managing fiscal periods
    - Generating recurring entries
    """

    def __init__(self, tenant: Tenant):
        self.tenant = tenant

    # ─── Journal Entry Operations ───────────────────────────────────────────────

    @transaction.atomic
    def create_entry(
        self,
        entry_date: date,
        memo: str,
        lines: List[Union[EntryLineInput, Dict]],
        reference_number: str = '',
        entry_type: str = JournalEntry.EntryType.STANDARD,
        source_document: Optional[Any] = None,
        created_by=None,
        auto_post: bool = False
    ) -> JournalEntry:
        """
        Create a new journal entry with validation.

        Args:
            entry_date: Date of the transaction
            memo: Description of the entry
            lines: List of line items (dicts or EntryLineInput objects)
            reference_number: External reference (invoice #, check #, etc.)
            entry_type: Type classification (standard, adjusting, etc.)
            source_document: Optional source document (Invoice, Payment, etc.)
            created_by: User creating the entry
            auto_post: If True, automatically post after creation

        Returns:
            JournalEntry: The created entry

        Raises:
            UnbalancedEntryError: If debits don't equal credits
            ValidationError: If line data is invalid
        """
        # Normalize line inputs
        normalized_lines = self._normalize_line_inputs(lines)

        # Validate balance before creating
        total_debit, total_credit = self._calculate_totals(normalized_lines)
        if total_debit != total_credit:
            raise UnbalancedEntryError(total_debit, total_credit)

        # Validate at least 2 lines
        if len(normalized_lines) < 2:
            raise ValidationError("Journal entry must have at least 2 lines.")

        # Get fiscal period
        fiscal_period = self._get_fiscal_period(entry_date)

        # Generate entry number
        entry_number = self._generate_entry_number()

        # Create the entry
        entry = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number=entry_number,
            date=entry_date,
            memo=memo,
            reference_number=reference_number,
            entry_type=entry_type,
            fiscal_period=fiscal_period,
            created_by=created_by,
            status=JournalEntry.EntryStatus.DRAFT
        )

        # Link source document if provided
        if source_document:
            entry.source_type = ContentType.objects.get_for_model(source_document)
            entry.source_id = source_document.pk
            entry.save(update_fields=['source_type', 'source_id'])

        # Create lines
        self._create_entry_lines(entry, normalized_lines)

        # Auto-post if requested
        if auto_post:
            self.post_entry(entry.id, posted_by=created_by)

        return entry

    @transaction.atomic
    def post_entry(
        self,
        entry_id: int,
        posted_by=None
    ) -> JournalEntry:
        """
        Post a journal entry, making it immutable.

        Args:
            entry_id: ID of the entry to post
            posted_by: User posting the entry

        Returns:
            JournalEntry: The posted entry

        Raises:
            PostedEntryError: If already posted
            UnbalancedEntryError: If entry doesn't balance
            ClosedPeriodError: If posting to a closed period
        """
        entry = JournalEntry.objects.select_for_update().get(
            id=entry_id,
            tenant=self.tenant
        )

        # Validate not already posted
        if entry.is_posted:
            raise PostedEntryError(
                f"Entry {entry.entry_number} is already posted."
            )

        # Validate balance
        if not entry.is_balanced:
            raise UnbalancedEntryError(entry.total_debit, entry.total_credit)

        # Validate fiscal period
        if entry.fiscal_period and entry.fiscal_period.status == FiscalPeriod.PeriodStatus.CLOSED:
            raise ClosedPeriodError(
                f"Cannot post to closed period {entry.fiscal_period.name}."
            )

        # Validate all accounts are active
        inactive_accounts = entry.lines.filter(account__is_active=False)
        if inactive_accounts.exists():
            account_codes = ', '.join(inactive_accounts.values_list('account__code', flat=True))
            raise InactiveAccountError(
                f"Cannot post with inactive accounts: {account_codes}"
            )

        # Update entry status
        entry.status = JournalEntry.EntryStatus.POSTED
        entry.posted_at = timezone.now()
        entry.posted_by = posted_by
        entry.save(update_fields=['status', 'posted_at', 'posted_by'])

        # Update account balance cache
        self._update_balance_cache(entry)

        return entry

    @transaction.atomic
    def reverse_entry(
        self,
        entry_id: int,
        reversal_date: Optional[date] = None,
        memo: str = '',
        created_by=None
    ) -> JournalEntry:
        """
        Create a reversing entry for a posted journal entry.

        Args:
            entry_id: ID of the entry to reverse
            reversal_date: Date for reversing entry (defaults to today)
            memo: Optional memo (defaults to "Reversal of [original memo]")
            created_by: User creating the reversal

        Returns:
            JournalEntry: The new reversing entry
        """
        original = JournalEntry.objects.get(
            id=entry_id,
            tenant=self.tenant
        )

        if not original.is_posted:
            raise AccountingError("Only posted entries can be reversed.")

        if original.status == JournalEntry.EntryStatus.REVERSED:
            raise AccountingError("Entry has already been reversed.")

        reversal_date = reversal_date or date.today()
        memo = memo or f"Reversal of {original.entry_number}: {original.memo}"

        # Build reversed lines (swap debits and credits)
        reversed_lines = []
        for line in original.lines.all():
            reversed_lines.append(EntryLineInput(
                account_id=line.account_id,
                description=f"Reversal: {line.description}",
                debit=line.credit,
                credit=line.debit
            ))

        # Create the reversing entry
        reversal = self.create_entry(
            entry_date=reversal_date,
            memo=memo,
            lines=reversed_lines,
            reference_number=f"REV-{original.entry_number}",
            entry_type=JournalEntry.EntryType.REVERSING,
            created_by=created_by,
            auto_post=True
        )

        # Link entries
        original.reversed_by = reversal
        original.status = JournalEntry.EntryStatus.REVERSED
        original.save(update_fields=['reversed_by', 'status'])

        return reversal

    # ─── Balance Calculations ───────────────────────────────────────────────────

    def get_account_balance(
        self,
        account_id: int,
        as_of_date: Optional[date] = None
    ) -> AccountBalanceResult:
        """
        Calculate the running balance for an account.

        The balance is calculated based on the account's normal balance:
        - Debit-normal accounts: Balance = Debits - Credits
        - Credit-normal accounts: Balance = Credits - Debits

        Args:
            account_id: ID of the account
            as_of_date: Calculate balance as of this date (defaults to today)

        Returns:
            AccountBalanceResult with balance details
        """
        account = Account.objects.get(id=account_id, tenant=self.tenant)
        as_of_date = as_of_date or date.today()

        # Sum all posted transactions up to the date
        totals = JournalEntryLine.objects.filter(
            tenant=self.tenant,
            account=account,
            entry__status=JournalEntry.EntryStatus.POSTED,
            entry__date__lte=as_of_date
        ).aggregate(
            total_debit=Sum('debit'),
            total_credit=Sum('credit')
        )

        total_debit = totals['total_debit'] or Decimal('0.00')
        total_credit = totals['total_credit'] or Decimal('0.00')

        # Calculate balance based on normal balance
        if account.is_debit_normal:
            balance = total_debit - total_credit
            is_debit_balance = balance >= 0
        else:
            balance = total_credit - total_debit
            is_debit_balance = balance < 0

        # Normalize balance to positive number
        balance = abs(balance)

        return AccountBalanceResult(
            account=account,
            as_of_date=as_of_date,
            total_debit=total_debit,
            total_credit=total_credit,
            balance=balance,
            is_debit_balance=is_debit_balance
        )

    def get_trial_balance(
        self,
        as_of_date: Optional[date] = None,
        include_zero_balances: bool = False
    ) -> List[Dict]:
        """
        Generate a trial balance report.

        Returns all accounts with their debit/credit balances.
        Total debits must equal total credits.

        Args:
            as_of_date: Date for the trial balance
            include_zero_balances: Include accounts with zero balance

        Returns:
            List of account balance dictionaries
        """
        as_of_date = as_of_date or date.today()
        results = []

        accounts = Account.objects.filter(
            tenant=self.tenant,
            is_active=True
        ).order_by('code')

        for account in accounts:
            balance_result = self.get_account_balance(account.id, as_of_date)

            if not include_zero_balances and balance_result.balance == 0:
                continue

            results.append({
                'account_code': account.code,
                'account_name': account.name,
                'account_type': account.account_type,
                'debit': balance_result.balance if balance_result.is_debit_balance else Decimal('0.00'),
                'credit': balance_result.balance if not balance_result.is_debit_balance else Decimal('0.00'),
            })

        return results

    def get_account_transactions(
        self,
        account_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_drafts: bool = False
    ) -> List[Dict]:
        """
        Get all transactions for an account within a date range.

        Args:
            account_id: ID of the account
            start_date: Start of date range
            end_date: End of date range
            include_drafts: Include non-posted entries

        Returns:
            List of transaction dictionaries with running balance
        """
        account = Account.objects.get(id=account_id, tenant=self.tenant)

        filters = Q(tenant=self.tenant, account=account)

        if not include_drafts:
            filters &= Q(entry__status=JournalEntry.EntryStatus.POSTED)
        if start_date:
            filters &= Q(entry__date__gte=start_date)
        if end_date:
            filters &= Q(entry__date__lte=end_date)

        lines = JournalEntryLine.objects.filter(filters).select_related(
            'entry'
        ).order_by('entry__date', 'entry__entry_number', 'line_number')

        # Calculate running balance
        running_balance = Decimal('0.00')
        if start_date:
            # Get opening balance
            opening = self.get_account_balance(account_id, start_date)
            running_balance = opening.balance if opening.is_debit_balance else -opening.balance

        transactions = []
        for line in lines:
            if account.is_debit_normal:
                running_balance += (line.debit - line.credit)
            else:
                running_balance += (line.credit - line.debit)

            transactions.append({
                'date': line.entry.date,
                'entry_number': line.entry.entry_number,
                'memo': line.entry.memo,
                'description': line.description,
                'debit': line.debit,
                'credit': line.credit,
                'running_balance': abs(running_balance),
                'balance_type': 'DR' if running_balance >= 0 else 'CR'
            })

        return transactions

    # ─── Fiscal Period Management ───────────────────────────────────────────────

    def create_fiscal_periods(
        self,
        year: int,
        period_type: str = 'monthly'
    ) -> List[FiscalPeriod]:
        """
        Create fiscal periods for a year.

        Args:
            year: The fiscal year
            period_type: 'monthly' or 'quarterly'

        Returns:
            List of created FiscalPeriod objects
        """
        from calendar import monthrange

        periods = []

        if period_type == 'monthly':
            for month in range(1, 13):
                _, last_day = monthrange(year, month)
                period = FiscalPeriod.objects.create(
                    tenant=self.tenant,
                    name=f"{date(year, month, 1).strftime('%B %Y')}",
                    start_date=date(year, month, 1),
                    end_date=date(year, month, last_day),
                    is_year_end=(month == 12)
                )
                periods.append(period)

        elif period_type == 'quarterly':
            quarters = [
                ('Q1', 1, 3),
                ('Q2', 4, 6),
                ('Q3', 7, 9),
                ('Q4', 10, 12)
            ]
            for name, start_month, end_month in quarters:
                _, last_day = monthrange(year, end_month)
                period = FiscalPeriod.objects.create(
                    tenant=self.tenant,
                    name=f"{name} {year}",
                    start_date=date(year, start_month, 1),
                    end_date=date(year, end_month, last_day),
                    is_year_end=(end_month == 12)
                )
                periods.append(period)

        return periods

    def close_period(self, period_id: int) -> FiscalPeriod:
        """Close a fiscal period to prevent further posting."""
        period = FiscalPeriod.objects.get(id=period_id, tenant=self.tenant)
        period.status = FiscalPeriod.PeriodStatus.CLOSED
        period.save(update_fields=['status'])
        return period

    # ─── Recurring Entries ──────────────────────────────────────────────────────

    def process_recurring_entries(self, through_date: Optional[date] = None) -> List[JournalEntry]:
        """
        Generate journal entries from recurring templates.

        Args:
            through_date: Generate entries up to this date

        Returns:
            List of generated JournalEntry objects
        """
        through_date = through_date or date.today()
        generated = []

        templates = RecurringEntryTemplate.objects.filter(
            tenant=self.tenant,
            is_active=True,
            next_date__lte=through_date
        ).prefetch_related('lines')

        for template in templates:
            while template.next_date <= through_date:
                # Check end date
                if template.end_date and template.next_date > template.end_date:
                    template.is_active = False
                    template.save(update_fields=['is_active'])
                    break

                # Build lines from template
                lines = []
                for tpl_line in template.lines.all():
                    lines.append(EntryLineInput(
                        account_id=tpl_line.account_id,
                        description=tpl_line.description,
                        debit=tpl_line.debit,
                        credit=tpl_line.credit
                    ))

                # Create entry
                entry = self.create_entry(
                    entry_date=template.next_date,
                    memo=template.memo,
                    lines=lines,
                    entry_type=JournalEntry.EntryType.RECURRING,
                    auto_post=template.auto_post
                )
                generated.append(entry)

                # Calculate next date
                template.next_date = self._calculate_next_date(
                    template.next_date,
                    template.frequency
                )
                template.save(update_fields=['next_date'])

        return generated

    # ─── Helper Methods ─────────────────────────────────────────────────────────

    def _normalize_line_inputs(
        self,
        lines: List[Union[EntryLineInput, Dict]]
    ) -> List[EntryLineInput]:
        """Convert dict inputs to EntryLineInput objects."""
        normalized = []
        for line in lines:
            if isinstance(line, dict):
                normalized.append(EntryLineInput(
                    account_code=line.get('account_code'),
                    account_id=line.get('account_id'),
                    description=line.get('description', ''),
                    debit=Decimal(str(line.get('debit', 0))).quantize(
                        Decimal('0.01'), rounding=ROUND_HALF_UP
                    ),
                    credit=Decimal(str(line.get('credit', 0))).quantize(
                        Decimal('0.01'), rounding=ROUND_HALF_UP
                    ),
                    entity=line.get('entity')
                ))
            else:
                normalized.append(line)
        return normalized

    def _calculate_totals(
        self,
        lines: List[EntryLineInput]
    ) -> tuple[Decimal, Decimal]:
        """Calculate total debits and credits."""
        total_debit = sum(line.debit for line in lines)
        total_credit = sum(line.credit for line in lines)
        return total_debit, total_credit

    def _generate_entry_number(self) -> str:
        """Generate a unique entry number."""
        from apps.tenants.models import get_next_sequence_number
        seq = get_next_sequence_number(self.tenant, 'JE')
        year = date.today().year
        return f"JE-{year}-{seq}"

    def _get_fiscal_period(self, entry_date: date) -> Optional[FiscalPeriod]:
        """Get the fiscal period for a date."""
        return FiscalPeriod.objects.filter(
            tenant=self.tenant,
            start_date__lte=entry_date,
            end_date__gte=entry_date
        ).first()

    def _create_entry_lines(
        self,
        entry: JournalEntry,
        lines: List[EntryLineInput]
    ) -> List[JournalEntryLine]:
        """Create JournalEntryLine objects for an entry."""
        created_lines = []
        line_number = 10

        for line_input in lines:
            # Resolve account
            if line_input.account_id:
                account = Account.objects.get(
                    id=line_input.account_id,
                    tenant=self.tenant
                )
            elif line_input.account_code:
                account = Account.objects.get(
                    code=line_input.account_code,
                    tenant=self.tenant
                )
            else:
                raise ValidationError("Line must have account_id or account_code")

            # Build line
            line_data = {
                'tenant': self.tenant,
                'entry': entry,
                'line_number': line_number,
                'account': account,
                'description': line_input.description,
                'debit': line_input.debit,
                'credit': line_input.credit
            }

            # Add entity reference if provided
            if line_input.entity:
                line_data['entity_type'] = ContentType.objects.get_for_model(
                    line_input.entity
                )
                line_data['entity_id'] = line_input.entity.pk

            created_lines.append(JournalEntryLine.objects.create(**line_data))
            line_number += 10

        return created_lines

    def _update_balance_cache(self, entry: JournalEntry) -> None:
        """Update AccountBalance cache after posting."""
        for line in entry.lines.all():
            balance, created = AccountBalance.objects.get_or_create(
                tenant=self.tenant,
                account=line.account,
                fiscal_period=entry.fiscal_period,
                defaults={
                    'period_debit': Decimal('0.00'),
                    'period_credit': Decimal('0.00'),
                    'beginning_balance': Decimal('0.00'),
                    'ending_balance': Decimal('0.00')
                }
            )

            balance.period_debit += line.debit
            balance.period_credit += line.credit

            # Recalculate ending balance
            if line.account.is_debit_normal:
                balance.ending_balance = (
                    balance.beginning_balance +
                    balance.period_debit -
                    balance.period_credit
                )
            else:
                balance.ending_balance = (
                    balance.beginning_balance +
                    balance.period_credit -
                    balance.period_debit
                )

            balance.save()

    def _calculate_next_date(self, current: date, frequency: str) -> date:
        """Calculate the next occurrence date."""
        from dateutil.relativedelta import relativedelta

        freq_map = {
            RecurringEntryTemplate.Frequency.DAILY: relativedelta(days=1),
            RecurringEntryTemplate.Frequency.WEEKLY: relativedelta(weeks=1),
            RecurringEntryTemplate.Frequency.MONTHLY: relativedelta(months=1),
            RecurringEntryTemplate.Frequency.QUARTERLY: relativedelta(months=3),
            RecurringEntryTemplate.Frequency.ANNUALLY: relativedelta(years=1),
        }

        return current + freq_map.get(frequency, relativedelta(months=1))


# ─── Convenience Functions ──────────────────────────────────────────────────────

def get_account_by_code(tenant: Tenant, code: str) -> Account:
    """Get an account by code for a tenant."""
    return Account.objects.get(tenant=tenant, code=code)


def create_simple_entry(
    tenant: Tenant,
    entry_date: date,
    memo: str,
    debit_account_code: str,
    credit_account_code: str,
    amount: Decimal,
    reference: str = '',
    auto_post: bool = True
) -> JournalEntry:
    """
    Create a simple two-line journal entry.

    Convenience function for common debit-credit pairs.
    """
    service = AccountingService(tenant)
    return service.create_entry(
        entry_date=entry_date,
        memo=memo,
        lines=[
            {'account_code': debit_account_code, 'debit': amount},
            {'account_code': credit_account_code, 'credit': amount},
        ],
        reference_number=reference,
        auto_post=auto_post
    )
