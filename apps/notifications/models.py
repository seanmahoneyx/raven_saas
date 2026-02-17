from django.db import models
from django.conf import settings
from shared.models import TenantMixin, TimestampMixin


class Notification(TenantMixin, TimestampMixin):
    NOTIFICATION_TYPES = [
        ('INFO', 'Info'),
        ('SUCCESS', 'Success'),
        ('WARNING', 'Warning'),
        ('ERROR', 'Error'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    link = models.CharField(max_length=500, blank=True)
    notification_type = models.CharField(max_length=10, choices=NOTIFICATION_TYPES, default='INFO')
    read = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'recipient', '-created_at']),
            models.Index(fields=['tenant', 'recipient', 'read']),
        ]

    def __str__(self):
        return f"{self.title} -> {self.recipient.username}"
