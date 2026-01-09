# apps/warehousing/models.py
"""
Warehouse and storage location models.

Models:
- Warehouse: Physical warehouse locations
- Bin: Storage locations within a warehouse (aisle/rack/level)

Note: Truck model is in apps.parties (scheduling resource).
"""
from django.db import models
from shared.models import TenantMixin, TimestampMixin


class Warehouse(TenantMixin, TimestampMixin):
    """
    Physical warehouse location.

    Each tenant can have multiple warehouses. Inventory is tracked
    per item per warehouse.

    Example:
        - Main Warehouse (primary)
        - Cold Storage
        - Overflow / 3PL Location
    """
    name = models.CharField(
        max_length=100,
        help_text="Warehouse name (e.g., 'Main Warehouse')"
    )
    code = models.CharField(
        max_length=20,
        help_text="Short code (e.g., 'MAIN', 'COLD')"
    )
    location = models.ForeignKey(
        'parties.Location',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='warehouses',
        help_text="Physical address of this warehouse"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive warehouses are hidden from selections"
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Default warehouse for receiving and shipping"
    )
    notes = models.TextField(
        blank=True,
        help_text="Notes about this warehouse"
    )

    class Meta:
        verbose_name_plural = "Warehouses"
        unique_together = [('tenant', 'code')]
        indexes = [
            models.Index(fields=['tenant', 'code']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"

    def save(self, *args, **kwargs):
        # Ensure only one default warehouse per tenant
        if self.is_default:
            Warehouse.objects.filter(
                tenant=self.tenant,
                is_default=True
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class Bin(TenantMixin, TimestampMixin):
    """
    Storage location within a warehouse.

    Bins can be identified by aisle/rack/level for organized storage,
    or just by a simple code for simpler operations.

    Example bin codes:
        - A-01-01 (Aisle A, Rack 01, Level 01)
        - STAGING (staging area)
        - DOCK-1 (receiving dock 1)
    """
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='bins',
        help_text="Warehouse this bin is located in"
    )
    code = models.CharField(
        max_length=50,
        help_text="Bin identifier (e.g., 'A-01-01')"
    )
    aisle = models.CharField(
        max_length=10,
        blank=True,
        help_text="Aisle identifier"
    )
    rack = models.CharField(
        max_length=10,
        blank=True,
        help_text="Rack/bay identifier"
    )
    level = models.CharField(
        max_length=10,
        blank=True,
        help_text="Level/shelf identifier"
    )
    bin_type = models.CharField(
        max_length=20,
        choices=[
            ('STORAGE', 'Storage'),
            ('STAGING', 'Staging'),
            ('RECEIVING', 'Receiving'),
            ('SHIPPING', 'Shipping'),
            ('DAMAGED', 'Damaged/Hold'),
        ],
        default='STORAGE',
        help_text="Type of bin/location"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive bins are hidden from selections"
    )

    class Meta:
        unique_together = [('warehouse', 'code')]
        ordering = ['warehouse', 'code']
        indexes = [
            models.Index(fields=['warehouse', 'code']),
            models.Index(fields=['warehouse', 'is_active']),
        ]

    def __str__(self):
        return f"{self.warehouse.code}:{self.code}"

    @property
    def full_location(self):
        """Return formatted full location string."""
        parts = [self.warehouse.code]
        if self.aisle:
            parts.append(self.aisle)
        if self.rack:
            parts.append(self.rack)
        if self.level:
            parts.append(self.level)
        return '-'.join(parts) if len(parts) > 1 else self.code

    def save(self, *args, **kwargs):
        """Ensure tenant matches warehouse."""
        if self.warehouse_id:
            self.tenant = self.warehouse.tenant
        super().save(*args, **kwargs)
