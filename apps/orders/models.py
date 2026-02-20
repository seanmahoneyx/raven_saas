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
        ('pending_approval', 'Pending Approval'),
        ('confirmed', 'Confirmed'),
        ('scheduled', 'Scheduled'),
        ('picking', 'Pick Ticket'),
        ('shipped', 'Shipped'),
        ('partially_received', 'Partially Received'),
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
    is_pickup = models.BooleanField(
        default=False,
        help_text="Whether this order is a customer pickup (shown in Pick Up row on scheduler)"
    )
    notes = models.TextField(
        blank=True,
        help_text="Operational notes"
    )
    priority = models.PositiveSmallIntegerField(
        default=5,
        help_text="Priority 1 (high) to 10 (low)"
    )
    scheduler_sequence = models.PositiveIntegerField(
        default=0,
        help_text="Display order within a scheduler cell (0 = auto/end)"
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

    # RFQ conversion link
    source_rfq = models.ForeignKey(
        'orders.RFQ',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='converted_purchase_orders',
        help_text="RFQ this purchase order was converted from"
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
    quantity_received = models.PositiveIntegerField(
        default=0,
        help_text="Quantity received so far (updated on each receive)"
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
    def is_fully_received(self):
        """Returns True if all ordered quantity has been received."""
        return self.quantity_received >= self.quantity_ordered

    @property
    def quantity_remaining(self):
        """Quantity still to be received."""
        return max(self.quantity_ordered - self.quantity_received, 0)

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

    ORDER_CLASS_CHOICES = [
        ('STANDARD', 'Standard'),
        ('RUSH', 'Rush'),
        ('BLANKET', 'Blanket'),
        ('SAMPLE', 'Sample'),
        ('INTERNAL', 'Internal'),
    ]
    order_class = models.CharField(
        max_length=20,
        choices=ORDER_CLASS_CHOICES,
        default='STANDARD',
        help_text="Order classification (e.g., Standard, Rush, Blanket)"
    )

    # Estimate conversion link
    source_estimate = models.ForeignKey(
        'orders.Estimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='converted_orders',
        help_text="Estimate this order was converted from"
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


class Estimate(TenantMixin, TimestampMixin):
    """
    Customer price proposal / quote.

    Estimates have no inventory impact. When accepted, they can be
    converted to a SalesOrder via convert_estimate_to_order().
    """
    ESTIMATE_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('converted', 'Converted'),
        ('expired', 'Expired'),
    ]

    estimate_number = models.CharField(
        max_length=50,
        help_text="Estimate number (unique per tenant)"
    )
    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.PROTECT,
        related_name='estimates',
        help_text="Customer this estimate is for"
    )
    date = models.DateField(
        default=timezone.now,
        help_text="Estimate date"
    )
    expiration_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date this estimate expires"
    )
    status = models.CharField(
        max_length=20,
        choices=ESTIMATE_STATUS_CHOICES,
        default='draft',
        help_text="Estimate status"
    )

    # Addresses (copied from customer defaults)
    ship_to = models.ForeignKey(
        'parties.Location',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='estimates_ship_to',
        help_text="Delivery location"
    )
    bill_to = models.ForeignKey(
        'parties.Location',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='estimates_bill_to',
        help_text="Billing address"
    )

    # Totals
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Sum of line amounts"
    )
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=0,
        help_text="Tax rate (e.g., 0.08 for 8%)"
    )
    tax_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Calculated tax amount"
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Total estimate amount"
    )

    # Optional links
    design_request = models.ForeignKey(
        'design.DesignRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='estimates',
        help_text="Design request this estimate is based on"
    )

    customer_po = models.CharField(
        max_length=50,
        blank=True,
        help_text="Customer's PO reference number"
    )
    notes = models.TextField(
        blank=True,
        help_text="Internal notes"
    )
    terms_and_conditions = models.TextField(
        blank=True,
        help_text="Terms & conditions to appear on the estimate"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'estimate_number')]
        ordering = ['-date']
        indexes = [
            models.Index(fields=['tenant', 'estimate_number']),
            models.Index(fields=['tenant', 'customer', 'date']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"EST-{self.estimate_number}"

    def calculate_totals(self):
        """Recalculate subtotal and total from lines."""
        self.subtotal = sum(line.amount for line in self.lines.all())
        self.tax_amount = self.subtotal * self.tax_rate
        self.total_amount = self.subtotal + self.tax_amount

    @property
    def is_editable(self):
        """Returns True if estimate can still be edited."""
        return self.status in ('draft',)

    @property
    def is_convertible(self):
        """Returns True if estimate can be converted to a sales order."""
        return self.status in ('sent', 'accepted')

    @property
    def is_expired(self):
        """Returns True if estimate has passed its expiration date."""
        if not self.expiration_date:
            return False
        return timezone.now().date() > self.expiration_date


class EstimateLine(TenantMixin, TimestampMixin):
    """
    Line items on an estimate.

    Each line represents a quantity of an item being quoted.
    Mirrors SalesOrderLine so conversion is seamless.
    """
    estimate = models.ForeignKey(
        Estimate,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent estimate"
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='estimate_lines',
        help_text="Item being quoted"
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="Line description (defaults to item name)"
    )
    quantity = models.PositiveIntegerField(
        help_text="Quantity quoted"
    )
    uom = models.ForeignKey(
        'items.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='estimate_lines',
        help_text="Unit of measure"
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Price per unit"
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Line amount (calculated: quantity * unit_price)"
    )
    notes = models.TextField(
        blank=True,
        help_text="Line-specific notes"
    )

    class Meta:
        unique_together = [('tenant', 'estimate', 'line_number')]
        ordering = ['line_number']
        indexes = [
            models.Index(fields=['tenant', 'estimate', 'line_number']),
            models.Index(fields=['tenant', 'item']),
        ]

    def __str__(self):
        return f"{self.estimate.estimate_number} Line {self.line_number}: {self.item.sku}"

    def save(self, *args, **kwargs):
        # Auto-calculate amount
        self.amount = Decimal(self.quantity) * self.unit_price
        # Default description from item
        if not self.description and self.item_id:
            self.description = getattr(self.item, 'name', self.item.sku)
        super().save(*args, **kwargs)


class RFQ(TenantMixin, TimestampMixin):
    """
    Request for Quotation sent to vendors.

    RFQs ask vendors for pricing/availability. When a vendor replies
    with acceptable pricing, the RFQ can be converted to a PurchaseOrder
    via convert_rfq_to_po().
    """
    RFQ_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('received', 'Received'),
        ('converted', 'Converted'),
        ('cancelled', 'Cancelled'),
    ]

    rfq_number = models.CharField(
        max_length=50,
        help_text="RFQ number (unique per tenant)"
    )
    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.PROTECT,
        related_name='rfqs',
        help_text="Vendor being asked for quotation"
    )
    date = models.DateField(
        default=timezone.now,
        help_text="RFQ date"
    )
    expected_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date we need the goods by"
    )
    status = models.CharField(
        max_length=20,
        choices=RFQ_STATUS_CHOICES,
        default='draft',
        help_text="RFQ status"
    )
    ship_to = models.ForeignKey(
        'parties.Location',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rfqs_ship_to',
        help_text="Delivery location for quoted goods"
    )
    notes = models.TextField(
        blank=True,
        help_text="Instructions to vendor"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'rfq_number')]
        ordering = ['-date']
        indexes = [
            models.Index(fields=['tenant', 'rfq_number']),
            models.Index(fields=['tenant', 'vendor', 'date']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"RFQ-{self.rfq_number}"

    @property
    def is_editable(self):
        """Returns True if RFQ can still be edited."""
        return self.status in ('draft',)

    @property
    def is_convertible(self):
        """Returns True if RFQ can be converted to a purchase order."""
        return self.status in ('sent', 'received')

    @property
    def has_all_quotes(self):
        """Returns True if all lines have quoted prices."""
        return not self.lines.filter(quoted_price__isnull=True).exists()


class RFQLine(TenantMixin, TimestampMixin):
    """
    Line items on a request for quotation.

    Each line represents a quantity of an item we're asking the vendor to quote.
    The vendor fills in quoted_price when they respond.
    """
    rfq = models.ForeignKey(
        RFQ,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent RFQ"
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='rfq_lines',
        help_text="Item being requested"
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="Line description (defaults to item name)"
    )
    quantity = models.PositiveIntegerField(
        help_text="Quantity requested"
    )
    uom = models.ForeignKey(
        'items.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='rfq_lines',
        help_text="Unit of measure"
    )
    target_price = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Our target price per unit (optional, internal)"
    )
    quoted_price = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Vendor's quoted price per unit (filled when vendor responds)"
    )
    notes = models.TextField(
        blank=True,
        help_text="Line-specific notes"
    )

    class Meta:
        unique_together = [('tenant', 'rfq', 'line_number')]
        ordering = ['line_number']
        indexes = [
            models.Index(fields=['tenant', 'rfq', 'line_number']),
            models.Index(fields=['tenant', 'item']),
        ]

    def __str__(self):
        return f"{self.rfq.rfq_number} Line {self.line_number}: {self.item.sku}"

    @property
    def line_total(self):
        """Calculate line total using quoted_price if available, else target_price."""
        price = self.quoted_price or self.target_price
        if price is None:
            return Decimal('0')
        return Decimal(self.quantity) * price

    def save(self, *args, **kwargs):
        if not self.description and self.item_id:
            self.description = getattr(self.item, 'name', self.item.sku)
        super().save(*args, **kwargs)
