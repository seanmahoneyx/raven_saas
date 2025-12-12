from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

class AuditLog(models.Model):
    """Tracks critical changes across the system using Generic Foreign Keys."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    ACTION_CHOICES = [
        ('CREATE', 'Created'), ('UPDATE', 'Updated'), 
        ('SCHEDULE', 'Scheduled'), ('UNSCHEDULE', 'Unscheduled'),
    ]
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    
    # Generic Foreign Key
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')
    
    details = models.JSONField(blank=True, null=True, help_text="Stores change details (Old/New values).")

    def __str__(self):
        return f"{self.action} by {self.user} on {self.content_object}"