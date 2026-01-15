# apps/scheduling/models.py
"""
Scheduling models for delivery management.

Models:
- DeliveryRun: A batch of orders assigned to a truck for a specific date
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
