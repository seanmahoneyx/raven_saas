# apps/pricing/models.py
"""
Pricing models for customer price lists with quantity breaks.

Models:
- PriceListHead: Price list header with date-based validity
- PriceListLine: Quantity break pricing tiers

Business Logic:
- Price lists are customer+item specific with date ranges
- No overlapping date ranges allowed for same customer+item
- Quantity breaks determine unit price based on order quantity
"""
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from shared.models import TenantMixin, TimestampMixin


class PriceListHead(TenantMixin, TimestampMixin):
    """
    Price list header with date-based validity.

    Each price list defines pricing for a specific customer+item combination
    within a date range. Multiple price lists can exist for the same
    customer+item but their date ranges must not overlap.

    Example:
        Customer: ACME Corp
        Item: Widget-001
        Begin: 2024-01-01
        End: 2024-12-31
        Lines:
            - 1+ units: $10.00/ea
            - 100+ units: $9.00/ea
            - 1000+ units: $8.00/ea
    """
    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.CASCADE,
        related_name='price_lists',
        help_text="Customer this price list applies to"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.CASCADE,
        related_name='price_lists',
        help_text="Item this price list applies to"
    )
    begin_date = models.DateField(
        help_text="Start date for this price list"
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="End date (null = no expiration)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive price lists are ignored in pricing calculations"
    )
    notes = models.TextField(
        blank=True,
        help_text="Internal notes about this price list"
    )

    class Meta:
        verbose_name = "Price List"
        verbose_name_plural = "Price Lists"
        unique_together = [('tenant', 'customer', 'item', 'begin_date')]
        indexes = [
            models.Index(fields=['tenant', 'customer', 'item', 'begin_date']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        end = self.end_date or "ongoing"
        return f"{self.customer.party.code} - {self.item.sku} ({self.begin_date} to {end})"

    def clean(self):
        """Validate no overlapping date ranges for same customer+item."""
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
        """Check for overlapping date ranges with existing price lists."""
        overlapping = PriceListHead.objects.filter(
            tenant=self.tenant,
            customer=self.customer,
            item=self.item,
            is_active=True,
        ).exclude(pk=self.pk)

        for existing in overlapping:
            if self._dates_overlap(existing):
                raise ValidationError(
                    f"Date range overlaps with existing price list: {existing}"
                )

    def _dates_overlap(self, other):
        """Check if this price list's date range overlaps with another."""
        # self: [begin_date, end_date]
        # other: [other.begin_date, other.end_date]
        # Overlap if: self.begin <= other.end AND self.end >= other.begin

        self_end = self.end_date or timezone.datetime.max.date()
        other_end = other.end_date or timezone.datetime.max.date()

        return self.begin_date <= other_end and self_end >= other.begin_date

    def save(self, *args, **kwargs):
        """Validate before saving."""
        self.full_clean()
        super().save(*args, **kwargs)

    def is_valid_for_date(self, check_date=None):
        """Check if this price list is valid for a given date."""
        if check_date is None:
            check_date = timezone.now().date()

        if not self.is_active:
            return False

        if check_date < self.begin_date:
            return False

        if self.end_date and check_date > self.end_date:
            return False

        return True

    def get_price_for_quantity(self, quantity):
        """
        Get the unit price for a given quantity.

        Finds the highest min_quantity that is <= the requested quantity.

        Args:
            quantity: Order quantity

        Returns:
            Decimal: Unit price, or None if no matching tier
        """
        line = self.lines.filter(
            min_quantity__lte=quantity
        ).order_by('-min_quantity').first()

        return line.unit_price if line else None


class PriceListLine(TenantMixin):
    """
    Quantity break pricing tier.

    Each line represents a pricing tier based on minimum quantity.
    Higher quantities typically get better (lower) unit prices.

    Example tiers for a price list:
        min_quantity=1, unit_price=10.00 (base price)
        min_quantity=100, unit_price=9.00 (10% discount)
        min_quantity=1000, unit_price=8.00 (20% discount)
    """
    price_list = models.ForeignKey(
        PriceListHead,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent price list header"
    )
    min_quantity = models.PositiveIntegerField(
        help_text="Minimum quantity for this price tier"
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Unit price at this quantity tier"
    )

    class Meta:
        verbose_name = "Price List Line"
        verbose_name_plural = "Price List Lines"
        unique_together = [('price_list', 'min_quantity')]
        ordering = ['min_quantity']
        indexes = [
            models.Index(fields=['price_list', 'min_quantity']),
        ]

    def __str__(self):
        return f"{self.price_list.item.sku} @ {self.min_quantity}+: ${self.unit_price}"

    def clean(self):
        """Validate min_quantity >= 1."""
        super().clean()
        if self.min_quantity < 1:
            raise ValidationError({
                'min_quantity': "Minimum quantity must be at least 1."
            })

    def save(self, *args, **kwargs):
        """Ensure tenant matches parent price list."""
        if self.price_list_id:
            self.tenant = self.price_list.tenant
        self.full_clean()
        super().save(*args, **kwargs)
