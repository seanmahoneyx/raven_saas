# apps/reporting/models.py
"""
Reporting models for configurable business reports.

Models:
- ReportDefinition: Defines a report (name, type, parameters)
- ReportSchedule: Schedule for automatic report generation
- SavedReport: Instance of a generated report
- ReportFavorite: User's favorite reports
"""
from django.db import models
from django.conf import settings
from django.utils import timezone
from shared.models import TenantMixin, TimestampMixin


class ReportDefinition(TenantMixin, TimestampMixin):
    """
    Definition of a configurable report.

    Reports can be system-defined (built-in) or user-defined.
    Each report has a type that determines the data source and
    available columns/filters.

    Example:
        Name: AR Aging Report
        Type: AR_AGING
        Category: Finance
        Is System: True
    """
    REPORT_TYPES = [
        # Inventory Reports
        ('INVENTORY_BALANCE', 'Inventory Balance'),
        ('INVENTORY_VALUATION', 'Inventory Valuation'),
        ('INVENTORY_MOVEMENT', 'Inventory Movement'),
        ('LOT_STATUS', 'Lot Status'),
        # Sales Reports
        ('SALES_BY_CUSTOMER', 'Sales by Customer'),
        ('SALES_BY_ITEM', 'Sales by Item'),
        ('SALES_ORDER_STATUS', 'Sales Order Status'),
        ('SHIPMENT_HISTORY', 'Shipment History'),
        # Purchasing Reports
        ('PURCHASES_BY_VENDOR', 'Purchases by Vendor'),
        ('PURCHASES_BY_ITEM', 'Purchases by Item'),
        ('PO_STATUS', 'PO Status'),
        # Finance Reports
        ('AR_AGING', 'AR Aging'),
        ('INVOICE_STATUS', 'Invoice Status'),
        ('PAYMENT_HISTORY', 'Payment History'),
        # Custom
        ('CUSTOM', 'Custom Query'),
    ]

    CATEGORY_CHOICES = [
        ('INVENTORY', 'Inventory'),
        ('SALES', 'Sales'),
        ('PURCHASING', 'Purchasing'),
        ('FINANCE', 'Finance'),
        ('OPERATIONS', 'Operations'),
        ('CUSTOM', 'Custom'),
    ]

    OUTPUT_FORMAT_CHOICES = [
        ('TABLE', 'Table'),
        ('CSV', 'CSV Export'),
        ('PDF', 'PDF'),
        ('EXCEL', 'Excel'),
    ]

    name = models.CharField(
        max_length=100,
        help_text="Report name"
    )
    description = models.TextField(
        blank=True,
        help_text="Report description"
    )
    report_type = models.CharField(
        max_length=30,
        choices=REPORT_TYPES,
        help_text="Type of report (determines data source)"
    )
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='CUSTOM',
        help_text="Report category for grouping"
    )
    is_system = models.BooleanField(
        default=False,
        help_text="True if this is a built-in system report"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether report is available"
    )

    # Default output settings
    default_format = models.CharField(
        max_length=10,
        choices=OUTPUT_FORMAT_CHOICES,
        default='TABLE',
        help_text="Default output format"
    )

    # Column configuration (JSON)
    columns_config = models.JSONField(
        default=list,
        blank=True,
        help_text="Column definitions: [{name, label, type, sortable, width}]"
    )

    # Filter configuration (JSON)
    filters_config = models.JSONField(
        default=list,
        blank=True,
        help_text="Available filters: [{name, label, type, required, default}]"
    )

    # Default filter values (JSON)
    default_filters = models.JSONField(
        default=dict,
        blank=True,
        help_text="Default filter values"
    )

    # Grouping/sorting configuration
    default_group_by = models.CharField(
        max_length=50,
        blank=True,
        help_text="Default field to group by"
    )
    default_sort_by = models.CharField(
        max_length=50,
        blank=True,
        help_text="Default field to sort by"
    )
    default_sort_order = models.CharField(
        max_length=4,
        choices=[('ASC', 'Ascending'), ('DESC', 'Descending')],
        default='ASC',
        help_text="Default sort order"
    )

    # For custom reports
    custom_query = models.TextField(
        blank=True,
        help_text="Custom SQL query (for CUSTOM type reports only)"
    )

    # Ownership
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_reports',
        help_text="User who created this report"
    )

    class Meta:
        verbose_name = "Report Definition"
        verbose_name_plural = "Report Definitions"
        unique_together = [('tenant', 'name')]
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['tenant', 'report_type']),
            models.Index(fields=['tenant', 'category']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        return self.name


class ReportSchedule(TenantMixin, TimestampMixin):
    """
    Schedule for automatic report generation.

    Reports can be scheduled to run daily, weekly, or monthly
    and optionally emailed to recipients.
    """
    FREQUENCY_CHOICES = [
        ('DAILY', 'Daily'),
        ('WEEKLY', 'Weekly'),
        ('MONTHLY', 'Monthly'),
        ('QUARTERLY', 'Quarterly'),
    ]

    report = models.ForeignKey(
        ReportDefinition,
        on_delete=models.CASCADE,
        related_name='schedules',
        help_text="Report to generate"
    )
    name = models.CharField(
        max_length=100,
        help_text="Schedule name"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether schedule is active"
    )

    # Schedule settings
    frequency = models.CharField(
        max_length=10,
        choices=FREQUENCY_CHOICES,
        default='WEEKLY',
        help_text="How often to generate"
    )
    day_of_week = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Day of week (0=Monday, 6=Sunday) for weekly"
    )
    day_of_month = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Day of month (1-28) for monthly"
    )
    run_time = models.TimeField(
        default='06:00:00',
        help_text="Time to run (24h format)"
    )

    # Filter overrides (JSON)
    filter_values = models.JSONField(
        default=dict,
        blank=True,
        help_text="Filter values for this scheduled run"
    )

    # Output settings
    output_format = models.CharField(
        max_length=10,
        choices=ReportDefinition.OUTPUT_FORMAT_CHOICES,
        default='PDF',
        help_text="Output format"
    )

    # Email delivery
    email_recipients = models.TextField(
        blank=True,
        help_text="Email addresses (one per line)"
    )
    email_subject = models.CharField(
        max_length=200,
        blank=True,
        help_text="Email subject (supports {report_name}, {date})"
    )

    # Tracking
    last_run = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this schedule ran"
    )
    next_run = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Next scheduled run time"
    )

    class Meta:
        verbose_name = "Report Schedule"
        verbose_name_plural = "Report Schedules"
        indexes = [
            models.Index(fields=['tenant', 'is_active', 'next_run']),
        ]

    def __str__(self):
        return f"{self.name} ({self.frequency})"


class SavedReport(TenantMixin, TimestampMixin):
    """
    Instance of a generated report.

    Stores the parameters used and links to the output file.
    Can be generated on-demand or from a schedule.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('RUNNING', 'Running'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]

    report = models.ForeignKey(
        ReportDefinition,
        on_delete=models.CASCADE,
        related_name='saved_reports',
        help_text="Report definition"
    )
    schedule = models.ForeignKey(
        ReportSchedule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='saved_reports',
        help_text="Schedule that generated this (if scheduled)"
    )
    name = models.CharField(
        max_length=150,
        help_text="Report instance name"
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='PENDING',
        help_text="Generation status"
    )

    # Parameters used
    filter_values = models.JSONField(
        default=dict,
        help_text="Filter values used for this report"
    )
    output_format = models.CharField(
        max_length=10,
        choices=ReportDefinition.OUTPUT_FORMAT_CHOICES,
        default='TABLE',
        help_text="Output format"
    )

    # Results
    row_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of rows in result"
    )
    result_data = models.JSONField(
        null=True,
        blank=True,
        help_text="Report data (for TABLE format)"
    )
    file_path = models.CharField(
        max_length=500,
        blank=True,
        help_text="Path to generated file (for CSV/PDF/Excel)"
    )

    # Timing
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When generation started"
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When generation completed"
    )
    error_message = models.TextField(
        blank=True,
        help_text="Error message if failed"
    )

    # Who generated it
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_reports',
        help_text="User who generated this report"
    )

    class Meta:
        verbose_name = "Saved Report"
        verbose_name_plural = "Saved Reports"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'report', 'created_at']),
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'generated_by', 'created_at']),
        ]

    def __str__(self):
        return f"{self.name} ({self.status})"

    @property
    def duration_seconds(self):
        """Calculate report generation duration."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


class ReportFavorite(TenantMixin):
    """
    User's favorite reports for quick access.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='favorite_reports',
        help_text="User"
    )
    report = models.ForeignKey(
        ReportDefinition,
        on_delete=models.CASCADE,
        related_name='favorites',
        help_text="Favorited report"
    )
    display_order = models.PositiveIntegerField(
        default=0,
        help_text="Order in favorites list"
    )

    # Saved filter preset
    saved_filters = models.JSONField(
        default=dict,
        blank=True,
        help_text="Saved filter values for quick access"
    )

    class Meta:
        verbose_name = "Report Favorite"
        verbose_name_plural = "Report Favorites"
        unique_together = [('user', 'report')]
        ordering = ['display_order']

    def __str__(self):
        return f"{self.user.username} - {self.report.name}"
