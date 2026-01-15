# apps/orders/models.py
"""
Order models for purchasing and sales.

Models:
- BaseOrder: Abstract base for shared order fields
- PurchaseOrder: Inbound orders from vendors
- PurchaseOrderLine: Line items on purchase orders
- SalesOrder: Outbound orders to customers
- SalesOrderLine: Line items on sales orders
"""
from decimal import Decimal
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords
from shared.models import TenantMixin, TimestampMixin


class BaseOrder(TenantMixin, TimestampMixin):
    """
    Abstract base model for all order types.

    Provides common fields for scheduling and status tracking.
    Used by PurchaseOrder and SalesOrder.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('scheduled', 'Scheduled'),
        ('picking', 'Pick Ticket'),
        ('shipped', 'Shipped'),
        ('complete', 'Completed'),
        ('crossdock', 'Crossdock'),
        ('cancelled', 'Cancelled'),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="Current order status"
    )
    scheduled_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date scheduled on calendar"
    )
    scheduled_truck = models.ForeignKey(
        'parties.Truck',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='%(class)s_orders',
        help_text="Truck assigned for delivery/receiving"
    )
    delivery_run = models.ForeignKey(
        'new_scheduling.DeliveryRun',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='%(class)s_orders',
        help_text="Delivery run this order is assigned to"
    )
    notes = models.TextField(
        blank=True,
        help_text="Operational notes"
    )
    priority = models.PositiveSmallIntegerField(
        default=5,
        help_text="Priority 1 (high) to 10 (low)"
    )

    class Meta:
        abstract = True

    @property
    def is_unscheduled(self):
        """Returns True if order has no scheduled date."""
        return self.scheduled_date is None

    @property
    def is_editable(self):
        """Returns True if order can still be edited."""
        return self.status in ('draft', 'confirmed', 'scheduled')


class PurchaseOrder(BaseOrder):
    """
    Inbound orders from vendors.

    Represents goods being purchased from a vendor and
    received into the warehouse.
    """
    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.PROTECT,
        related_name='purchase_orders',
        help_text="Vendor supplying the goods"
    )
    po_number = models.CharField(
        max_length=50,
        help_text="Purchase order number (unique per tenant)"
    )
    order_date = models.DateField(
        default=timezone.now,
        help_text="Date PO was created"
    )
    expected_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expected delivery date (before scheduling)"
    )
    ship_to = models.ForeignKey(
        'parties.Location',
        on_delete=models.PROTECT,
        related_name='purchase_orders_ship_to',
        help_text="Our warehouse receiving the goods"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'po_number')]
        indexes = [
            models.Index(fields=['tenant', 'po_number']),
            models.Index(fields=['tenant', 'vendor', 'order_date']),
            models.Index(fields=['tenant', 'scheduled_date', 'scheduled_truck']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"PO-{self.po_number}"

    @property
    def subtotal(self):
        """Calculate order subtotal from lines."""
        return sum(line.line_total for line in self.lines.all())

    @property
    def num_lines(self):
        """Count of line items."""
        return self.lines.count()


class PurchaseOrderLine(TenantMixin, TimestampMixin):
    """
    Line items on a purchase order.

    Each line represents a quantity of an item being purchased.
    """
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent purchase order"
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='purchase_order_lines',
        help_text="Item being purchased"
    )
    quantity_ordered = models.PositiveIntegerField(
        help_text="Quantity ordered"
    )
    uom = models.ForeignKey(
        'items.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='purchase_order_lines',
        help_text="Unit of measure"
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Cost per unit"
    )
    notes = models.TextField(
        blank=True,
        help_text="Line-specific notes"
    )

    class Meta:
        unique_together = [('tenant', 'purchase_order', 'line_number')]
        indexes = [
            models.Index(fields=['tenant', 'purchase_order', 'line_number']),
            models.Index(fields=['tenant', 'item']),
        ]
        ordering = ['line_number']

    def __str__(self):
        return f"{self.purchase_order.po_number} Line {self.line_number}: {self.item.sku}"

    @property
    def line_total(self):
        """Calculate line total (quantity * unit_cost)."""
        return Decimal(self.quantity_ordered) * self.unit_cost

    @property
    def quantity_in_base_uom(self):
        """Convert quantity to base UOM (typically EACH)."""
        multiplier = self.item.get_uom_multiplier(self.uom)
        return self.quantity_ordered * multiplier


class SalesOrder(BaseOrder):
    """
    Outbound orders to customers.

    Represents goods being sold to a customer and
    shipped from the warehouse.
    """
    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.PROTECT,
        related_name='sales_orders',
        help_text="Customer receiving the goods"
    )
    order_number = models.CharField(
        max_length=50,
        help_text="Sales order number (unique per tenant)"
    )
    order_date = models.DateField(
        default=timezone.now,
        help_text="Date order was created"
    )
    ship_to = models.ForeignKey(
        'parties.Location',
        on_delete=models.PROTECT,
        related_name='sales_orders_ship_to',
        help_text="Customer's delivery location"
    )
    bill_to = models.ForeignKey(
        'parties.Location',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sales_orders_bill_to',
        help_text="Customer's billing address"
    )
    customer_po = models.CharField(
        max_length=50,
        blank=True,
        help_text="Customer's PO reference number"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'order_number')]
        indexes = [
            models.Index(fields=['tenant', 'order_number']),
            models.Index(fields=['tenant', 'customer', 'order_date']),
            models.Index(fields=['tenant', 'scheduled_date', 'scheduled_truck']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"SO-{self.order_number}"

    @property
    def subtotal(self):
        """Calculate order subtotal from lines."""
        return sum(line.line_total for line in self.lines.all())

    @property
    def num_lines(self):
        """Count of line items."""
        return self.lines.count()


class SalesOrderLine(TenantMixin, TimestampMixin):
    """
    Line items on a sales order.

    Each line represents a quantity of an item being sold.
    """
    sales_order = models.ForeignKey(
        SalesOrder,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent sales order"
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='sales_order_lines',
        help_text="Item being sold"
    )
    quantity_ordered = models.PositiveIntegerField(
        help_text="Quantity ordered"
    )
    uom = models.ForeignKey(
        'items.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='sales_order_lines',
        help_text="Unit of measure"
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Price per unit"
    )
    notes = models.TextField(
        blank=True,
        help_text="Line-specific notes"
    )

    class Meta:
        unique_together = [('tenant', 'sales_order', 'line_number')]
        indexes = [
            models.Index(fields=['tenant', 'sales_order', 'line_number']),
            models.Index(fields=['tenant', 'item']),
        ]
        ordering = ['line_number']

    def __str__(self):
        return f"{self.sales_order.order_number} Line {self.line_number}: {self.item.sku}"

    @property
    def line_total(self):
        """Calculate line total (quantity * unit_price)."""
        return Decimal(self.quantity_ordered) * self.unit_price

    @property
    def quantity_in_base_uom(self):
        """Convert quantity to base UOM (typically EACH)."""
        multiplier = self.item.get_uom_multiplier(self.uom)
        return self.quantity_ordered * multiplier
