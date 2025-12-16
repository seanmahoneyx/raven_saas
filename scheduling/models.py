# scheduling/models.py
from django.db import models
from simple_history.models import HistoricalRecords
from partners.models import Partner
from warehousing.models import Truck

class BaseOrder(models.Model):
    """
    Abstract base for all schedulable orders.
    """
    ORDER_TYPES = [('PO', 'Purchase Order'), ('REL', 'Release')]
    
    order_type = models.CharField(max_length=3, choices=ORDER_TYPES)
    number = models.CharField(max_length=50, unique=True)
    num_pallets = models.IntegerField(default=0)
    
    # Updated Status Choices for Color Logic
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),    # White
        ('picking', 'Pick Ticket'),    # Yellow
        ('shipped', 'Shipped'),        # Green
        ('complete', 'Completed'),     # Blue
        ('crossdock', 'Crossdock'),    # Orange
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    
    # Notes for the side panel
    notes = models.TextField(blank=True, null=True)
    
    class Meta:
        abstract = True
        
    def __str__(self): 
        return f"{self.order_type}-{self.number}"


class ReleaseOrder(BaseOrder):
    """Outgoing order (Release) affecting the shipping schedule."""
    customer = models.ForeignKey(Partner, on_delete=models.PROTECT, related_name='releases')
    
    # Scheduling Fields
    scheduled_date = models.DateField(null=True, blank=True, default=None)
    scheduled_truck = models.ForeignKey(Truck, on_delete=models.SET_NULL, null=True, blank=True, default=None)
    
    priority = models.PositiveSmallIntegerField(default=5)
    
    # Audit Trail
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Release Order"

    @property
    def is_unscheduled(self):
        return self.scheduled_date is None


class PurchaseOrder(BaseOrder):
    """Incoming order (PO) affecting receiving schedule."""
    vendor = models.ForeignKey(Partner, on_delete=models.PROTECT, related_name='purchase_orders')
    
    # Scheduling Fields
    scheduled_date = models.DateField(null=True, blank=True, default=None)

    scheduled_truck = models.ForeignKey(Truck, on_delete=models.SET_NULL, null=True, blank=True, default=None)
    
    # Audit Trail
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Purchase Order"
        
    @property
    def is_unscheduled(self):
        return self.scheduled_date is None