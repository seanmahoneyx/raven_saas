# apps/shipping/models.py
"""
Shipping models for BOL and shipment tracking.

Models:
- Shipment: A delivery trip combining multiple sales orders
- ShipmentLine: Individual orders included in a shipment
- BillOfLading: BOL document for a shipment
- BOLLine: Line items on the BOL (aggregated from shipment lines)
"""
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from simple_history.models import HistoricalRecords
from shared.models import TenantMixin, TimestampMixin


class Shipment(TenantMixin, TimestampMixin):
    """
    A delivery trip combining multiple sales orders.

    A shipment represents a physical truck load being delivered.
    Multiple sales orders can be consolidated into one shipment.

    Example:
        Shipment: SHIP-2024-00123
        Date: 2024-01-15
        Truck: Truck A
        Orders: SO-001, SO-002, SO-003
    """
    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('loading', 'Loading'),
        ('in_transit', 'In Transit'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
    ]

    shipment_number = models.CharField(
        max_length=50,
        help_text="Shipment identifier (unique per tenant)"
    )
    ship_date = models.DateField(
        default=timezone.now,
        help_text="Scheduled ship date"
    )
    truck = models.ForeignKey(
        'parties.Truck',
        on_delete=models.PROTECT,
        related_name='shipments',
        help_text="Truck assigned for this shipment"
    )
    driver_name = models.CharField(
        max_length=100,
        blank=True,
        help_text="Driver name"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='planned',
        help_text="Shipment status"
    )
    departure_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Actual departure time"
    )
    arrival_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Actual arrival/delivery time"
    )
    notes = models.TextField(
        blank=True,
        help_text="Shipment notes"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Shipment"
        verbose_name_plural = "Shipments"
        unique_together = [('tenant', 'shipment_number')]
        indexes = [
            models.Index(fields=['tenant', 'shipment_number']),
            models.Index(fields=['tenant', 'ship_date']),
            models.Index(fields=['tenant', 'truck', 'ship_date']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"SHIP-{self.shipment_number}"

    @property
    def total_orders(self):
        """Count of orders in this shipment."""
        return self.lines.count()

    @property
    def total_value(self):
        """Total value of all orders in shipment."""
        return sum(line.sales_order.subtotal for line in self.lines.all())


class ShipmentLine(TenantMixin, TimestampMixin):
    """
    Links a sales order to a shipment.

    Represents the inclusion of a sales order in a shipment.
    """
    DELIVERY_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('loaded', 'Loaded'),
        ('delivered', 'Delivered'),
        ('refused', 'Refused'),
        ('partial', 'Partial Delivery'),
    ]

    shipment = models.ForeignKey(
        Shipment,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent shipment"
    )
    sales_order = models.ForeignKey(
        'orders.SalesOrder',
        on_delete=models.PROTECT,
        related_name='shipment_lines',
        help_text="Sales order included in this shipment"
    )
    delivery_sequence = models.PositiveIntegerField(
        default=0,
        help_text="Order of delivery (0=first stop)"
    )
    delivery_status = models.CharField(
        max_length=20,
        choices=DELIVERY_STATUS_CHOICES,
        default='pending',
        help_text="Delivery status for this order"
    )
    delivered_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this order was delivered"
    )
    signature_name = models.CharField(
        max_length=100,
        blank=True,
        help_text="Name of person who signed for delivery"
    )
    notes = models.TextField(
        blank=True,
        help_text="Delivery notes"
    )

    class Meta:
        verbose_name = "Shipment Line"
        verbose_name_plural = "Shipment Lines"
        unique_together = [('shipment', 'sales_order')]
        ordering = ['delivery_sequence']
        indexes = [
            models.Index(fields=['shipment', 'delivery_sequence']),
            models.Index(fields=['sales_order']),
        ]

    def __str__(self):
        return f"{self.shipment.shipment_number} - {self.sales_order.order_number}"


class BillOfLading(TenantMixin, TimestampMixin):
    """
    Bill of Lading document for a shipment.

    A BOL is a legal document issued by a carrier detailing
    the type, quantity, and destination of goods being carried.

    Example:
        BOL: BOL-2024-00123
        Shipment: SHIP-2024-00123
        Status: Signed
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('issued', 'Issued'),
        ('signed', 'Signed'),
        ('void', 'Void'),
    ]

    bol_number = models.CharField(
        max_length=50,
        help_text="BOL number (unique per tenant)"
    )
    shipment = models.OneToOneField(
        Shipment,
        on_delete=models.PROTECT,
        related_name='bol',
        help_text="Shipment this BOL is for"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="BOL status"
    )
    issue_date = models.DateField(
        default=timezone.now,
        help_text="Date BOL was issued"
    )

    # Carrier information
    carrier_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Carrier/trucking company name"
    )
    carrier_scac = models.CharField(
        max_length=10,
        blank=True,
        help_text="Standard Carrier Alpha Code"
    )
    trailer_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Trailer/container number"
    )
    seal_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Seal number"
    )

    # Shipper information (from tenant)
    shipper_name = models.CharField(
        max_length=200,
        help_text="Shipper company name"
    )
    shipper_address = models.TextField(
        blank=True,
        help_text="Shipper address"
    )

    # Signatures
    shipper_signature = models.CharField(
        max_length=100,
        blank=True,
        help_text="Shipper signature name"
    )
    shipper_signed_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When shipper signed"
    )
    carrier_signature = models.CharField(
        max_length=100,
        blank=True,
        help_text="Carrier/driver signature name"
    )
    carrier_signed_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When carrier signed"
    )
    consignee_signature = models.CharField(
        max_length=100,
        blank=True,
        help_text="Consignee signature name"
    )
    consignee_signed_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When consignee signed"
    )

    # Totals
    total_pieces = models.PositiveIntegerField(
        default=0,
        help_text="Total number of pieces/packages"
    )
    total_weight = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Total weight"
    )
    weight_uom = models.CharField(
        max_length=10,
        default='LBS',
        help_text="Weight unit of measure"
    )

    notes = models.TextField(
        blank=True,
        help_text="BOL notes/special instructions"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Bill of Lading"
        verbose_name_plural = "Bills of Lading"
        unique_together = [('tenant', 'bol_number')]
        indexes = [
            models.Index(fields=['tenant', 'bol_number']),
            models.Index(fields=['tenant', 'issue_date']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"BOL-{self.bol_number}"


class BOLLine(TenantMixin):
    """
    Line items on a Bill of Lading.

    BOL lines aggregate items from the sales orders in the shipment.
    These are what appear as line items on the printed BOL.
    """
    bol = models.ForeignKey(
        BillOfLading,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent BOL"
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='bol_lines',
        help_text="Item being shipped"
    )
    description = models.CharField(
        max_length=255,
        help_text="Item description for BOL"
    )
    quantity = models.PositiveIntegerField(
        help_text="Quantity shipped"
    )
    uom = models.ForeignKey(
        'items.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='bol_lines',
        help_text="Unit of measure"
    )
    num_packages = models.PositiveIntegerField(
        default=1,
        help_text="Number of packages/pallets"
    )
    weight = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Weight of this line"
    )
    freight_class = models.CharField(
        max_length=10,
        blank=True,
        help_text="Freight class (50, 55, 60, etc.)"
    )
    nmfc_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="National Motor Freight Classification code"
    )

    class Meta:
        verbose_name = "BOL Line"
        verbose_name_plural = "BOL Lines"
        unique_together = [('bol', 'line_number')]
        ordering = ['line_number']
        indexes = [
            models.Index(fields=['bol', 'line_number']),
        ]

    def __str__(self):
        return f"{self.bol.bol_number} Line {self.line_number}: {self.description}"
