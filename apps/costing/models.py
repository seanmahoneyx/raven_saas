# apps/costing/models.py
"""
Costing models for vendor cost lists with quantity breaks.

Models:
- CostListHead: Cost list header with date-based validity
- CostListLine: Quantity break cost tiers

Business Logic:
- Cost lists are vendor+item specific with date ranges
- No overlapping date ranges allowed for same vendor+item
- Quantity breaks determine unit cost based on purchase quantity
"""
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from shared.models import TenantMixin, TimestampMixin


class CostListHead(TenantMixin, TimestampMixin):
    """
    Cost list header with date-based validity.

    Each cost list defines costs from a specific vendor for a specific item
    within a date range. Multiple cost lists can exist for the same
    vendor+item but their date ranges must not overlap.

    Example:
        Vendor: ABC Supply
        Item: Widget-001
        Begin: 2024-01-01
        End: 2024-12-31
        Lines:
            - 1+ units: $5.00/ea
            - 100+ units: $4.50/ea
            - 1000+ units: $4.00/ea
    """
    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.CASCADE,
        related_name='cost_lists',
        help_text="Vendor this cost list is from"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.CASCADE,
        related_name='cost_lists',
        help_text="Item this cost list applies to"
    )
    begin_date = models.DateField(
        help_text="Start date for this cost list"
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="End date (null = no expiration)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive cost lists are ignored in costing calculations"
    )
    notes = models.TextField(
        blank=True,
        help_text="Internal notes about this cost list"
    )

    class Meta:
        verbose_name = "Cost List"
        verbose_name_plural = "Cost Lists"
        unique_together = [('tenant', 'vendor', 'item', 'begin_date')]
        indexes = [
            models.Index(fields=['tenant', 'vendor', 'item', 'begin_date']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        end = self.end_date or "ongoing"
        return f"{self.vendor.party.code} - {self.item.sku} ({self.begin_date} to {end})"

    def clean(self):
        """Validate no overlapping date ranges for same vendor+item."""
        super().clean()
        self._validate_date_range()
        self._validate_no_overlap()

    def _validate_date_range(self):
        """Ensure end_date >= begin_date if both provided."""
        if self.end_date and self.end_date < self.begin_date:
            raise ValidationError({
                'end_date': "End date must be on or after begin date."
            })

    def _validate_no_overlap(self):
        """Check for overlapping date ranges with existing cost lists."""
        overlapping = CostListHead.objects.filter(
            tenant=self.tenant,
            vendor=self.vendor,
            item=self.item,
            is_active=True,
        ).exclude(pk=self.pk)

        for existing in overlapping:
            if self._dates_overlap(existing):
                raise ValidationError(
                    f"Date range overlaps with existing cost list: {existing}"
                )

    def _dates_overlap(self, other):
        """Check if this cost list's date range overlaps with another."""
        self_end = self.end_date or timezone.datetime.max.date()
        other_end = other.end_date or timezone.datetime.max.date()

        return self.begin_date <= other_end and self_end >= other.begin_date

    def save(self, *args, **kwargs):
        """Validate before saving."""
        self.full_clean()
        super().save(*args, **kwargs)

    def is_valid_for_date(self, check_date=None):
        """Check if this cost list is valid for a given date."""
        if check_date is None:
            check_date = timezone.now().date()

        if not self.is_active:
            return False

        if check_date < self.begin_date:
            return False

        if self.end_date and check_date > self.end_date:
            return False

        return True

    def get_cost_for_quantity(self, quantity):
        """
        Get the unit cost for a given quantity.

        Finds the highest min_quantity that is <= the requested quantity.

        Args:
            quantity: Purchase quantity

        Returns:
            Decimal: Unit cost, or None if no matching tier
        """
        line = self.lines.filter(
            min_quantity__lte=quantity
        ).order_by('-min_quantity').first()

        return line.unit_cost if line else None


class CostListLine(TenantMixin):
    """
    Quantity break cost tier.

    Each line represents a cost tier based on minimum quantity.
    Higher quantities typically get better (lower) unit costs.

    Example tiers for a cost list:
        min_quantity=1, unit_cost=5.00 (base cost)
        min_quantity=100, unit_cost=4.50 (10% discount)
        min_quantity=1000, unit_cost=4.00 (20% discount)
    """
    cost_list = models.ForeignKey(
        CostListHead,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent cost list header"
    )
    min_quantity = models.PositiveIntegerField(
        help_text="Minimum quantity for this cost tier"
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Unit cost at this quantity tier"
    )

    class Meta:
        verbose_name = "Cost List Line"
        verbose_name_plural = "Cost List Lines"
        unique_together = [('cost_list', 'min_quantity')]
        ordering = ['min_quantity']
        indexes = [
            models.Index(fields=['cost_list', 'min_quantity']),
        ]

    def __str__(self):
        return f"{self.cost_list.item.sku} @ {self.min_quantity}+: ${self.unit_cost}"

    def clean(self):
        """Validate min_quantity >= 1."""
        super().clean()
        if self.min_quantity < 1:
            raise ValidationError({
                'min_quantity': "Minimum quantity must be at least 1."
            })

    def save(self, *args, **kwargs):
        """Ensure tenant matches parent cost list."""
        if self.cost_list_id:
            self.tenant = self.cost_list.tenant
        self.full_clean()
        super().save(*args, **kwargs)
