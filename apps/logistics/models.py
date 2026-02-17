from decimal import Decimal
from django.db import models
from django.conf import settings
from simple_history.models import HistoricalRecords
from shared.models import TenantMixin, TimestampMixin


class LicensePlate(TenantMixin, TimestampMixin):
    """
    A palletized unit tracked by a scannable license plate (LPN).
    Groups items from a SalesOrder onto a physical pallet for tracking.
    """
    LPN_STATUS_CHOICES = [
        ('STAGED', 'Staged'),
        ('LOADED', 'Loaded'),
        ('DELIVERED', 'Delivered'),
    ]

    code = models.CharField(
        max_length=50,
        help_text="License plate code (e.g., 'LPN-10001')"
    )
    order = models.ForeignKey(
        'orders.SalesOrder',
        on_delete=models.PROTECT,
        related_name='license_plates',
        help_text="Sales order this pallet belongs to"
    )
    run = models.ForeignKey(
        'new_scheduling.DeliveryRun',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='license_plates',
        help_text="Delivery run this pallet is loaded on"
    )
    weight_lbs = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Pallet weight in pounds"
    )
    status = models.CharField(
        max_length=20,
        choices=LPN_STATUS_CHOICES,
        default='STAGED',
        help_text="Current pallet status"
    )
    notes = models.TextField(
        blank=True,
        help_text="Pallet notes"
    )

    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'code')]
        indexes = [
            models.Index(fields=['tenant', 'code']),
            models.Index(fields=['tenant', 'order']),
            models.Index(fields=['tenant', 'run']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return self.code


class DeliveryStop(TenantMixin, TimestampMixin):
    """
    A delivery stop within a DeliveryRun.

    Tracks a customer drop-off point with sequence, linked orders,
    and proof-of-delivery (POD) capture.
    """
    STOP_STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('ARRIVED', 'Arrived'),
        ('COMPLETED', 'Completed'),
        ('SKIPPED', 'Skipped'),
    ]

    run = models.ForeignKey(
        'new_scheduling.DeliveryRun',
        on_delete=models.CASCADE,
        related_name='stops',
        help_text="Delivery run this stop belongs to"
    )
    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.PROTECT,
        related_name='delivery_stops',
        help_text="Customer being delivered to"
    )
    ship_to = models.ForeignKey(
        'parties.Location',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='delivery_stops',
        help_text="Delivery address"
    )
    orders = models.ManyToManyField(
        'orders.SalesOrder',
        related_name='delivery_stops',
        blank=True,
        help_text="Sales orders being delivered at this stop"
    )
    sequence = models.PositiveIntegerField(
        default=1,
        help_text="Stop sequence (1=first stop, 2=second, etc.)"
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STOP_STATUS_CHOICES,
        default='PENDING',
        help_text="Current stop status"
    )

    # Proof of Delivery
    signature_image = models.ImageField(
        upload_to='logistics/signatures/',
        null=True,
        blank=True,
        help_text="Captured signature image"
    )
    signed_by = models.CharField(
        max_length=100,
        blank=True,
        help_text="Name of person who signed"
    )
    delivered_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When delivery was completed"
    )
    delivery_notes = models.TextField(
        blank=True,
        help_text="Driver notes at delivery"
    )
    photo_image = models.ImageField(
        upload_to='logistics/pod_photos/',
        null=True,
        blank=True,
        help_text="Photo proof of delivery (pallets on dock)"
    )
    arrived_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When driver arrived at this stop"
    )
    gps_lat = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        help_text="GPS latitude at delivery"
    )
    gps_lng = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        help_text="GPS longitude at delivery"
    )

    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'run', 'customer')]
        ordering = ['run', 'sequence']
        indexes = [
            models.Index(fields=['tenant', 'run', 'sequence']),
            models.Index(fields=['tenant', 'customer']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"Stop #{self.sequence}: {self.customer.party.display_name} ({self.status})"
