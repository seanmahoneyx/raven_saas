# apps/scheduling/models.py
"""
Scheduling models for delivery management.

Models:
- DeliveryRun: A batch of orders assigned to a truck for a specific date
- SchedulerNote: Sticky notes that can be attached to dates, trucks, orders, or runs
- PriorityLinePriority: Priority order for PO lines within vendor/date/box-type bins
- VendorKickAllotment: Default daily production limits per vendor/box-type
- DailyKickOverride: Per-day overrides to default allotments
"""
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords
from shared.models import TenantMixin, TimestampMixin


class DeliveryRun(TenantMixin, TimestampMixin):
    """
    A delivery run represents a batch of orders for a truck on a specific date.

    Trucks can have multiple delivery runs per day, each containing a set of orders
    that will be delivered/received together (e.g., morning run, afternoon run).
    """
    name = models.CharField(
        max_length=100,
        help_text="Run name (e.g., 'Morning Run', 'Route A')"
    )
    truck = models.ForeignKey(
        'parties.Truck',
        on_delete=models.CASCADE,
        related_name='delivery_runs',
        help_text="Truck assigned to this run"
    )
    scheduled_date = models.DateField(
        help_text="Date of this delivery run"
    )
    sequence = models.PositiveSmallIntegerField(
        default=1,
        help_text="Order of this run within the day (1=first run, 2=second, etc.)"
    )
    departure_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Planned departure time"
    )
    notes = models.TextField(
        blank=True,
        help_text="Run notes/instructions"
    )
    is_complete = models.BooleanField(
        default=False,
        help_text="Whether this run has been completed"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'truck', 'scheduled_date', 'sequence')]
        ordering = ['scheduled_date', 'truck', 'sequence']
        indexes = [
            models.Index(fields=['tenant', 'scheduled_date']),
            models.Index(fields=['tenant', 'truck', 'scheduled_date']),
        ]

    def __str__(self):
        return f"{self.truck.name} - {self.scheduled_date} - {self.name}"

    @property
    def order_count(self):
        """Count of orders in this run."""
        return self.sales_orders.count() + self.purchase_orders.count()


class SchedulerNote(TenantMixin, TimestampMixin):
    """
    A sticky note that can be attached to:
    - A specific date/truck cell (for general reminders)
    - A delivery run (for run-specific instructions)
    - A sales order or purchase order (for order-specific notes)

    Notes appear as cards in the scheduler UI and can be color-coded.
    """
    COLOR_CHOICES = [
        ('yellow', 'Yellow'),
        ('blue', 'Blue'),
        ('green', 'Green'),
        ('red', 'Red'),
        ('purple', 'Purple'),
        ('orange', 'Orange'),
    ]

    content = models.TextField(
        help_text="Note content/text"
    )
    color = models.CharField(
        max_length=20,
        choices=COLOR_CHOICES,
        default='yellow',
        help_text="Note color for visual distinction"
    )

    # Optional: attach to a specific date/truck cell
    scheduled_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date this note is attached to"
    )
    truck = models.ForeignKey(
        'parties.Truck',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='scheduler_notes',
        help_text="Truck this note is attached to (combine with date for cell attachment)"
    )

    # Optional: attach to a delivery run
    delivery_run = models.ForeignKey(
        'DeliveryRun',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='scheduler_notes',
        help_text="Delivery run this note is attached to"
    )

    # Optional: attach to a specific order
    sales_order = models.ForeignKey(
        'orders.SalesOrder',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='scheduler_notes',
        help_text="Sales order this note is attached to"
    )
    purchase_order = models.ForeignKey(
        'orders.PurchaseOrder',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='scheduler_notes',
        help_text="Purchase order this note is attached to"
    )

    # Metadata
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='scheduler_notes',
        help_text="User who created this note"
    )
    is_pinned = models.BooleanField(
        default=False,
        help_text="Pinned notes appear at the top"
    )

    history = HistoricalRecords()

    class Meta:
        ordering = ['-is_pinned', '-created_at']
        indexes = [
            models.Index(fields=['tenant', 'scheduled_date']),
            models.Index(fields=['tenant', 'scheduled_date', 'truck']),
        ]

    def __str__(self):
        preview = self.content[:50] + '...' if len(self.content) > 50 else self.content
        return f"Note: {preview}"

    @property
    def attachment_type(self):
        """Returns the type of attachment for this note."""
        if self.sales_order_id:
            return 'sales_order'
        if self.purchase_order_id:
            return 'purchase_order'
        if self.delivery_run_id:
            return 'delivery_run'
        if self.scheduled_date and self.truck_id:
            return 'cell'
        if self.scheduled_date:
            return 'date'
        return 'floating'


# =============================================================================
# PRIORITY LIST MODELS
# =============================================================================

BOX_TYPE_CHOICES = [
    ('RSC', 'RSC'),
    ('DC', 'D/C'),
    ('HSC', 'HSC'),
    ('FOL', 'FOL'),
    ('TELE', 'Tele'),
    ('OTHER', 'Other'),
]


class PriorityLinePriority(TenantMixin, TimestampMixin):
    """
    Stores priority order for PO lines within a vendor/date/box-type bin.

    Lines are ordered by sequence (0 = top/hottest priority).
    When a line moves to a different date, both this record and the parent
    PurchaseOrder.scheduled_date are updated.
    """
    purchase_order_line = models.OneToOneField(
        'orders.PurchaseOrderLine',
        on_delete=models.CASCADE,
        related_name='priority_entry',
        help_text="The PO line being prioritized"
    )
    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.CASCADE,
        related_name='priority_entries',
        help_text="Vendor for this PO line (denormalized for query efficiency)"
    )
    scheduled_date = models.DateField(
        help_text="Date this line is scheduled for production"
    )
    box_type = models.CharField(
        max_length=10,
        choices=BOX_TYPE_CHOICES,
        help_text="Box type derived from the Item model"
    )
    sequence = models.PositiveIntegerField(
        default=0,
        help_text="Priority order within bin (0 = top/hottest)"
    )

    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'purchase_order_line')]
        indexes = [
            models.Index(fields=['tenant', 'vendor', 'scheduled_date', 'box_type', 'sequence']),
            models.Index(fields=['tenant', 'scheduled_date']),
        ]

    def __str__(self):
        return f"{self.purchase_order_line} - {self.scheduled_date} - seq {self.sequence}"


class VendorKickAllotment(TenantMixin, TimestampMixin):
    """
    Default daily production limits (kicks) per vendor/box-type.

    A "kick" represents a unit of production capacity. This model stores
    the baseline daily allotment that can be overridden for specific dates.
    """
    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.CASCADE,
        related_name='kick_allotments',
        help_text="Vendor this allotment applies to"
    )
    box_type = models.CharField(
        max_length=10,
        choices=BOX_TYPE_CHOICES,
        help_text="Box type this allotment applies to"
    )
    daily_allotment = models.PositiveIntegerField(
        default=0,
        help_text="Default daily kick allotment"
    )

    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'vendor', 'box_type')]
        indexes = [
            models.Index(fields=['tenant', 'vendor']),
        ]

    def __str__(self):
        return f"{self.vendor} - {self.box_type}: {self.daily_allotment} kicks/day"


class DailyKickOverride(TenantMixin, TimestampMixin):
    """
    Per-day overrides to default vendor kick allotments.

    Used when a specific date has different capacity than the default
    (e.g., reduced capacity on a holiday, increased for rush orders).
    """
    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.CASCADE,
        related_name='kick_overrides',
        help_text="Vendor this override applies to"
    )
    box_type = models.CharField(
        max_length=10,
        choices=BOX_TYPE_CHOICES,
        help_text="Box type this override applies to"
    )
    date = models.DateField(
        help_text="Specific date for this override"
    )
    allotment = models.PositiveIntegerField(
        help_text="Override allotment for this date"
    )

    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'vendor', 'box_type', 'date')]
        indexes = [
            models.Index(fields=['tenant', 'vendor', 'date']),
            models.Index(fields=['tenant', 'date']),
        ]

    def __str__(self):
        return f"{self.vendor} - {self.box_type} on {self.date}: {self.allotment} kicks"
