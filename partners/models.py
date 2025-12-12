from django.db import models

class Partner(models.Model):
    """Minimal model for Customer/Vendor (MVP stand-in for Party model)."""
    display_name = models.CharField(max_length=255)
    is_customer = models.BooleanField(default=True)
    is_vendor = models.BooleanField(default=True)
    
    def __str__(self): return self.display_name