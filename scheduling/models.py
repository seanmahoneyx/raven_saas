# scheduling/models.py
from django.db import models
from datetime import date

# Import models from other apps
from warehousing.models import Truck
from partners.models import Partner

# Import Simple History for the Audit Trail
from simple_history.models import HistoricalRecords

class BaseOrder(models.Model):
    """
    Abstract base class for all schedulable orders.
    Contains shared fields like order number and status.
    """
    ORDER_TYPES = [('PO', 'Purchase Order'), ('REL', 'Release')]
    
    order_type = models.CharField(max_length=3, choices=ORDER_TYPES)
    number = models.CharField(max_length=50, unique=True)
    num_pallets = models.SmallIntegerField(default=0)
    
    STATUS_CHOICES = [('open', 'Open'), ('ready', 'Ready'), ('complete', 'Complete')]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    
    class Meta:
        abstract = True
        
    def __str__(self): 
        return f"{self.order_type}-{self.number}"


class ReleaseOrder(BaseOrder):
    """
    Outgoing order (Release) affecting the shipping schedule.
    Linked to a Customer (Partner).
    """
    customer = models.ForeignKey(Partner, on_delete=models.PROTECT, related_name='releases')
    
    # === SCHEDULING FIELDS ===
    # Date determines the column
    scheduled_date = models.DateField(null=True, blank=True, default=None)
    # Truck determines the row (Resource)
    scheduled_truck = models.ForeignKey(Truck, on_delete=models.SET_NULL, null=True, blank=True, default=None)
    
    priority = models.PositiveSmallIntegerField(default=5)

    # Audit Trail (Defined as a field, NOT in Meta)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Release Order"
        verbose_name_plural = "Release Orders"

    @property
    def is_unscheduled(self):
        """Returns True if the order is not yet assigned to a date."""
        return self.scheduled_date is None


class PurchaseOrder(BaseOrder):
    """
    Incoming order (PO) affecting the receiving schedule.
    Linked to a Vendor (Partner).
    """
    vendor = models.ForeignKey(Partner, on_delete=models.PROTECT, related_name='purchase_orders')
    
    # === SCHEDULING FIELDS ===
    # POs only need a date (The resource is implicitly the 'Receiving Dock')
    scheduled_date = models.DateField(null=True, blank=True, default=None)
    
    # Audit Trail (Defined as a field, NOT in Meta)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Purchase Order"
        verbose_name_plural = "Purchase Orders"
        
    @property
    def is_unscheduled(self):
        """Returns True if the order is not yet assigned to a date."""
        return self.scheduled_date is None