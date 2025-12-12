from django.db import models

class Truck(models.Model):
    """The scheduling resource (resource row on the calendar)."""
    name = models.CharField(max_length=50, unique=True)
    is_active = models.BooleanField(default=True)
    
    def __str__(self): return self.name