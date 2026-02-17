# apps/warehousing/models.py
"""
Warehouse and storage location models.

Models:
- Warehouse: Physical warehouse locations
- Bin: Storage locations within a warehouse (aisle/rack/level)

Note: Truck model is in apps.parties (scheduling resource).
"""
from django.db import models
from django.conf import settings
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


class WarehouseLocation(TenantMixin, TimestampMixin):
    """
    Warehouse location for granular inventory tracking.

    Supports hierarchical organization with location types for different
    warehouse zones (receiving, storage, picking, packing, shipping).
    """
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='locations',
        help_text="Warehouse this location belongs to"
    )
    name = models.CharField(
        max_length=50,
        help_text="Location name (e.g., 'A-01-01')"
    )
    barcode = models.CharField(
        max_length=100,
        help_text="Scannable barcode for this location"
    )
    LOCATION_TYPES = [
        ('VIEW', 'View (Virtual)'),
        ('INTERNAL', 'Internal'),
        ('CUSTOMER', 'Customer'),
        ('INVENTORY', 'Inventory'),
        ('PRODUCTION', 'Production'),
        ('RECEIVING_DOCK', 'Receiving Dock'),
        ('STORAGE', 'Storage'),
        ('PICKING', 'Picking'),
        ('PACKING', 'Packing'),
        ('SHIPPING_DOCK', 'Shipping Dock'),
        ('SCRAP', 'Scrap'),
    ]

    type = models.CharField(
        max_length=20,
        choices=LOCATION_TYPES,
        help_text="Type of warehouse zone"
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent location for hierarchy (Warehouse > Zone > Bin)"
    )
    parent_path = models.CharField(
        max_length=255,
        blank=True,
        help_text="Hierarchical path (e.g., 'Zone A / Aisle 1')"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive locations are hidden from selections"
    )

    class Meta:
        unique_together = [('tenant', 'barcode')]
        indexes = [
            models.Index(fields=['tenant', 'warehouse', 'type']),
            models.Index(fields=['tenant', 'barcode']),
        ]

    def __str__(self):
        return f"{self.warehouse.code}:{self.name}"


class Lot(TenantMixin, TimestampMixin):
    """
    Lot/batch tracking for inventory items.

    Enables FEFO (First Expired, First Out) picking and traceability.
    """
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='lots',
        help_text="Item this lot belongs to"
    )
    lot_number = models.CharField(
        max_length=50,
        help_text="Lot or batch number"
    )
    vendor_batch = models.CharField(
        max_length=100,
        blank=True,
        help_text="Vendor's batch identifier"
    )
    manufacturer_batch_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Manufacturer's original batch/lot ID"
    )
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expiration date for FEFO picking"
    )

    class Meta:
        unique_together = [('tenant', 'item', 'lot_number')]
        indexes = [
            models.Index(fields=['tenant', 'lot_number']),
        ]

    def __str__(self):
        return f"{self.lot_number} ({self.item.sku})"


class StockQuant(TenantMixin, TimestampMixin):
    """
    The atomic unit of inventory: a specific quantity of an item at a location.

    Each StockQuant represents:
    - WHAT (item)
    - WHERE (location)
    - HOW MUCH (quantity)
    - WHICH LOT (optional lot tracking)
    """
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='quants',
        help_text="Item stored in this quant"
    )
    location = models.ForeignKey(
        WarehouseLocation,
        on_delete=models.PROTECT,
        related_name='quants',
        help_text="Location where this stock is stored"
    )
    lot = models.ForeignKey(
        Lot,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='quants',
        help_text="Lot/batch (optional)"
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        help_text="Quantity on hand at this location"
    )
    reserved_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        help_text="Quantity reserved for pending orders"
    )

    class Meta:
        unique_together = [('tenant', 'item', 'location', 'lot')]
        indexes = [
            models.Index(fields=['tenant', 'item', 'location']),
            models.Index(fields=['tenant', 'location']),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=0),
                name='quant_qty_non_negative'
            ),
            models.CheckConstraint(
                condition=models.Q(reserved_quantity__gte=0),
                name='quant_reserved_non_negative'
            ),
            models.CheckConstraint(
                condition=models.Q(reserved_quantity__lte=models.F('quantity')),
                name='quant_reserved_lte_qty'
            ),
        ]

    @property
    def available_quantity(self):
        """Unreserved stock available for new orders."""
        return self.quantity - self.reserved_quantity

    def __str__(self):
        return f"{self.item.sku} @ {self.location.name}: {self.quantity}"


class StockMoveLog(TenantMixin, TimestampMixin):
    """
    Audit trail for all stock movements between locations.

    Records every move for compliance, traceability, and debugging.
    """
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='stock_moves',
        help_text="Item that was moved"
    )
    source_location = models.ForeignKey(
        WarehouseLocation,
        on_delete=models.PROTECT,
        related_name='moves_out',
        help_text="Location stock was moved from"
    )
    destination_location = models.ForeignKey(
        WarehouseLocation,
        on_delete=models.PROTECT,
        related_name='moves_in',
        help_text="Location stock was moved to"
    )
    lot = models.ForeignKey(
        Lot,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='moves',
        help_text="Lot/batch (optional)"
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        help_text="Quantity moved"
    )
    moved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="User who executed the move"
    )
    reference = models.CharField(
        max_length=200,
        blank=True,
        help_text="Reference (e.g., 'PO-000123 putaway', 'SO-000456 pick')"
    )

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'item', 'created_at']),
        ]

    def __str__(self):
        return f"Move {self.item.sku}: {self.source_location.name} → {self.destination_location.name} x{self.quantity}"


class CycleCount(TenantMixin, TimestampMixin):
    """
    Inventory audit session for a specific zone or set of locations.

    Workflow:
    1. DRAFT: User creates a count session, selects locations.
    2. IN_PROGRESS: System snapshots expected quantities, user enters counted quantities.
    3. COMPLETED: On finalization, system generates adjustment moves for discrepancies.
    4. CANCELLED: Count was abandoned.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    count_number = models.CharField(
        max_length=50,
        help_text="Cycle count session ID (e.g., CC-2026-001)"
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='cycle_counts',
        help_text="Warehouse being counted"
    )
    zone = models.ForeignKey(
        WarehouseLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cycle_counts',
        help_text="Specific zone/location to count (blank = entire warehouse)"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
    )
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When counting began"
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When count was finalized"
    )
    counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cycle_counts',
        help_text="User performing the count"
    )
    notes = models.TextField(
        blank=True,
        help_text="Notes about this cycle count"
    )

    class Meta:
        unique_together = [('tenant', 'count_number')]
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'warehouse']),
        ]

    def __str__(self):
        return f"{self.count_number} - {self.warehouse.code} ({self.status})"


class CycleCountLine(TenantMixin, TimestampMixin):
    """
    Individual line in a cycle count: one item at one location.

    The expected_quantity is snapshotted when the count starts.
    The counted_quantity is entered by the warehouse worker.
    The variance is auto-calculated on save.
    """
    cycle_count = models.ForeignKey(
        CycleCount,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent cycle count session"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='cycle_count_lines',
        help_text="Item being counted"
    )
    location = models.ForeignKey(
        WarehouseLocation,
        on_delete=models.PROTECT,
        related_name='cycle_count_lines',
        help_text="Location being counted"
    )
    lot = models.ForeignKey(
        Lot,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='cycle_count_lines',
        help_text="Lot being counted (if lot-tracked)"
    )
    expected_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        help_text="System quantity at time of snapshot"
    )
    counted_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Actual quantity counted by user"
    )
    variance = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        help_text="counted - expected (positive = overage, negative = shortage)"
    )
    is_counted = models.BooleanField(
        default=False,
        help_text="Whether this line has been counted"
    )

    class Meta:
        indexes = [
            models.Index(fields=['cycle_count', 'is_counted']),
        ]

    def __str__(self):
        return f"{self.item.sku} @ {self.location.name}: expected={self.expected_quantity}, counted={self.counted_quantity}"

    def save(self, *args, **kwargs):
        if self.counted_quantity is not None:
            self.variance = self.counted_quantity - self.expected_quantity
            self.is_counted = True
        super().save(*args, **kwargs)
