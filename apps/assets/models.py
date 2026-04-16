"""
Fixed Asset Register — tracks physical assets, depreciation, and lifecycle events.
"""
from decimal import Decimal
from django.db import models
from django.conf import settings
from shared.models import TenantMixin, TimestampMixin


class AssetCategory(TenantMixin, TimestampMixin):
    """Category grouping for fixed assets (e.g., Vehicles, Equipment, Computers)."""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)

    # Default GL accounts for this category
    asset_account = models.ForeignKey(
        'accounting.Account', on_delete=models.PROTECT,
        related_name='asset_categories',
        help_text="Balance sheet asset account (e.g., 1540 Vehicles)"
    )
    depreciation_expense_account = models.ForeignKey(
        'accounting.Account', on_delete=models.PROTECT,
        related_name='depreciation_expense_categories',
        help_text="Income statement depreciation expense (e.g., 6830 Depreciation - Vehicles)"
    )
    accumulated_depreciation_account = models.ForeignKey(
        'accounting.Account', on_delete=models.PROTECT,
        related_name='accum_depr_categories',
        help_text="Contra-asset account (e.g., 1545 Accumulated Depreciation - Vehicles)"
    )

    # Default depreciation settings
    default_useful_life_months = models.PositiveIntegerField(default=60)
    default_depreciation_method = models.CharField(
        max_length=20,
        choices=[
            ('straight_line', 'Straight-Line'),
            ('declining_balance', 'Declining Balance'),
            ('double_declining', 'Double Declining Balance'),
            ('sum_of_years', 'Sum of Years Digits'),
            ('units_of_production', 'Units of Production'),
        ],
        default='straight_line'
    )
    default_salvage_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        help_text="Default salvage value as % of cost (e.g., 10.00 = 10%)"
    )

    class Meta:
        ordering = ['code']
        unique_together = [('tenant', 'code')]
        verbose_name_plural = 'Asset Categories'

    def __str__(self):
        return f"{self.code} - {self.name}"


class FixedAsset(TenantMixin, TimestampMixin):
    """Individual fixed asset record."""
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('fully_depreciated', 'Fully Depreciated'),
        ('disposed', 'Disposed'),
        ('written_off', 'Written Off'),
    ]

    # Identification
    asset_number = models.CharField(max_length=50, help_text="Unique asset tag/number")
    description = models.CharField(max_length=255)
    category = models.ForeignKey(AssetCategory, on_delete=models.PROTECT, related_name='assets')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    # Physical details
    serial_number = models.CharField(max_length=100, blank=True)
    location = models.CharField(max_length=200, blank=True, help_text="Physical location")
    custodian = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='assigned_assets',
        help_text="Person responsible for this asset"
    )

    # Acquisition
    acquisition_date = models.DateField()
    acquisition_cost = models.DecimalField(max_digits=12, decimal_places=2)
    vendor = models.ForeignKey(
        'parties.Vendor', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='sold_assets'
    )
    purchase_order = models.ForeignKey(
        'orders.PurchaseOrder', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='acquired_assets'
    )
    invoice_reference = models.CharField(max_length=100, blank=True)

    # Depreciation settings
    depreciation_method = models.CharField(
        max_length=20,
        choices=[
            ('straight_line', 'Straight-Line'),
            ('declining_balance', 'Declining Balance'),
            ('double_declining', 'Double Declining Balance'),
            ('sum_of_years', 'Sum of Years Digits'),
            ('units_of_production', 'Units of Production'),
        ],
        default='straight_line'
    )
    useful_life_months = models.PositiveIntegerField(default=60)
    salvage_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    depreciation_start_date = models.DateField(
        help_text="Date depreciation begins (usually same as acquisition or next month)"
    )

    # GL account overrides (defaults come from category)
    asset_account = models.ForeignKey(
        'accounting.Account', on_delete=models.PROTECT,
        related_name='fixed_assets', null=True, blank=True,
        help_text="Override category default"
    )
    depreciation_expense_account = models.ForeignKey(
        'accounting.Account', on_delete=models.PROTECT,
        related_name='depreciation_assets', null=True, blank=True,
        help_text="Override category default"
    )
    accumulated_depreciation_account = models.ForeignKey(
        'accounting.Account', on_delete=models.PROTECT,
        related_name='accum_depr_assets', null=True, blank=True,
        help_text="Override category default"
    )

    # Calculated fields (updated by depreciation runs)
    accumulated_depreciation = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00')
    )

    # Disposal
    disposal_date = models.DateField(null=True, blank=True)
    disposal_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    disposal_method = models.CharField(
        max_length=20, blank=True,
        choices=[
            ('sold', 'Sold'),
            ('scrapped', 'Scrapped'),
            ('donated', 'Donated'),
            ('traded_in', 'Traded In'),
            ('stolen', 'Stolen/Lost'),
        ]
    )
    disposal_notes = models.TextField(blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['asset_number']
        unique_together = [('tenant', 'asset_number')]

    def __str__(self):
        return f"{self.asset_number} - {self.description}"

    @property
    def net_book_value(self):
        return self.acquisition_cost - self.accumulated_depreciation

    @property
    def depreciable_amount(self):
        return self.acquisition_cost - self.salvage_value

    @property
    def is_fully_depreciated(self):
        return self.accumulated_depreciation >= self.depreciable_amount

    @property
    def remaining_life_months(self):
        if self.is_fully_depreciated:
            return 0
        from dateutil.relativedelta import relativedelta
        end_date = self.depreciation_start_date + relativedelta(months=self.useful_life_months)
        from django.utils import timezone
        today = timezone.now().date()
        if today >= end_date:
            return 0
        diff = relativedelta(end_date, today)
        return diff.years * 12 + diff.months

    def get_asset_account(self):
        return self.asset_account or self.category.asset_account

    def get_depreciation_expense_account(self):
        return self.depreciation_expense_account or self.category.depreciation_expense_account

    def get_accumulated_depreciation_account(self):
        return self.accumulated_depreciation_account or self.category.accumulated_depreciation_account

    def calculate_monthly_depreciation(self):
        """Calculate monthly depreciation amount based on method."""
        if self.is_fully_depreciated or self.status != 'active':
            return Decimal('0.00')

        depreciable = self.depreciable_amount

        if self.depreciation_method == 'straight_line':
            if self.useful_life_months == 0:
                return Decimal('0.00')
            monthly = depreciable / self.useful_life_months
            # Don't exceed remaining depreciable amount
            remaining = depreciable - self.accumulated_depreciation
            return min(monthly, remaining).quantize(Decimal('0.01'))

        elif self.depreciation_method == 'declining_balance':
            rate = Decimal('1') / self.useful_life_months
            nbv = self.net_book_value
            monthly = (nbv * rate).quantize(Decimal('0.01'))
            remaining = depreciable - self.accumulated_depreciation
            return min(monthly, remaining).quantize(Decimal('0.01'))

        elif self.depreciation_method == 'double_declining':
            rate = Decimal('2') / self.useful_life_months
            nbv = self.net_book_value
            monthly = (nbv * rate).quantize(Decimal('0.01'))
            remaining = nbv - self.salvage_value
            return min(monthly, max(remaining, Decimal('0.00'))).quantize(Decimal('0.01'))

        # Default fallback to straight-line
        if self.useful_life_months == 0:
            return Decimal('0.00')
        monthly = depreciable / self.useful_life_months
        remaining = depreciable - self.accumulated_depreciation
        return min(monthly, remaining).quantize(Decimal('0.01'))


class DepreciationEntry(TenantMixin, TimestampMixin):
    """Record of a depreciation charge for an asset in a given period."""
    asset = models.ForeignKey(FixedAsset, on_delete=models.CASCADE, related_name='depreciation_entries')
    period_date = models.DateField(help_text="First of the month for this depreciation period")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    accumulated_after = models.DecimalField(
        max_digits=12, decimal_places=2,
        help_text="Accumulated depreciation after this entry"
    )
    net_book_value_after = models.DecimalField(
        max_digits=12, decimal_places=2,
        help_text="Net book value after this entry"
    )
    journal_entry = models.ForeignKey(
        'accounting.JournalEntry', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='depreciation_entries'
    )

    class Meta:
        ordering = ['asset', 'period_date']
        unique_together = [('tenant', 'asset', 'period_date')]
        verbose_name_plural = 'Depreciation Entries'

    def __str__(self):
        return f"{self.asset.asset_number} - {self.period_date} - ${self.amount}"


class AssetTransaction(TenantMixin, TimestampMixin):
    """Lifecycle events for an asset (acquisition, improvement, transfer, disposal)."""
    TRANSACTION_TYPES = [
        ('acquisition', 'Acquisition'),
        ('improvement', 'Capital Improvement'),
        ('transfer', 'Location Transfer'),
        ('revaluation', 'Revaluation'),
        ('disposal', 'Disposal'),
        ('write_off', 'Write-Off'),
        ('impairment', 'Impairment'),
    ]

    asset = models.ForeignKey(FixedAsset, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    transaction_date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    description = models.TextField()

    # For transfers
    from_location = models.CharField(max_length=200, blank=True)
    to_location = models.CharField(max_length=200, blank=True)

    # GL link
    journal_entry = models.ForeignKey(
        'accounting.JournalEntry', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='asset_transactions'
    )

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True
    )

    class Meta:
        ordering = ['-transaction_date', '-created_at']

    def __str__(self):
        return f"{self.asset.asset_number} - {self.transaction_type} - {self.transaction_date}"
