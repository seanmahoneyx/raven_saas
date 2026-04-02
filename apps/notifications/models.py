from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from shared.models import TenantMixin, TimestampMixin


class Notification(TenantMixin, TimestampMixin):
    NOTIFICATION_TYPES = [
        ('INFO', 'Info'),
        ('SUCCESS', 'Success'),
        ('WARNING', 'Warning'),
        ('ERROR', 'Error'),
        ('MENTION', 'Mention'),
        ('TASK', 'Task'),
        ('COMMENT', 'Comment'),
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

    # Optional link to the source transaction (for contextual filtering)
    content_type = models.ForeignKey(
        ContentType,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Type of the related transaction (for contextual filtering)"
    )
    object_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="ID of the related transaction"
    )
    content_object = GenericForeignKey('content_type', 'object_id')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'recipient', '-created_at']),
            models.Index(fields=['tenant', 'recipient', 'read']),
            models.Index(fields=['tenant', 'content_type', 'object_id']),
        ]

    def __str__(self):
        return f"{self.title} -> {self.recipient.username}"
