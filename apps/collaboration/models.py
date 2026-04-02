# apps/collaboration/models.py
"""
Collaboration models for comments, @mentions, and task assignment on transactions.

Uses GenericForeignKey to attach to any transaction model (SalesOrder, PurchaseOrder,
Estimate, RFQ, Contract, DesignRequest, Invoice).
"""
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models

from shared.models import TenantMixin, TimestampMixin


class Comment(TenantMixin, TimestampMixin):
    """
    A comment attached to any transaction via GenericForeignKey.

    Supports single-level threading (parent FK to self) and @mention markup
    in the body text (e.g., @[user:5] or @[group:Design]).
    """
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text="Type of the object this comment is on"
    )
    object_id = models.PositiveIntegerField(
        help_text="ID of the object this comment is on"
    )
    content_object = GenericForeignKey('content_type', 'object_id')

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='comments',
    )
    body = models.TextField(
        help_text="Comment text. May contain @mention markup like @[user:5] or @[group:Design]"
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='replies',
        help_text="Parent comment for single-level threading"
    )
    is_deleted = models.BooleanField(
        default=False,
        help_text="Soft-deleted comments show as '[deleted]'"
    )

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['tenant', 'content_type', 'object_id', 'created_at']),
        ]

    def __str__(self):
        return f"Comment #{self.id} by {self.author.username} on {self.content_type.model}:{self.object_id}"


class Mention(TenantMixin, TimestampMixin):
    """
    Links a comment to mentioned users or groups.

    Enables efficient queries like "all mentions of me" or "all mentions of @Design".
    Exactly one of mentioned_user or mentioned_group should be set.
    """
    comment = models.ForeignKey(
        Comment,
        on_delete=models.CASCADE,
        related_name='mentions',
    )
    mentioned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='mentions_received',
    )
    mentioned_group = models.ForeignKey(
        'auth.Group',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='mentions_received',
    )

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'mentioned_user']),
            models.Index(fields=['tenant', 'mentioned_group']),
        ]

    def __str__(self):
        target = self.mentioned_user.username if self.mentioned_user else f"@{self.mentioned_group.name}"
        return f"Mention of {target} in Comment #{self.comment_id}"


class Task(TenantMixin, TimestampMixin):
    """
    A task attached to any transaction via GenericForeignKey.

    Supports assignment, priority, due dates, and status workflow:
    open -> in_progress -> complete
    open -> blocked -> in_progress -> complete
    any -> cancelled
    """
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('blocked', 'Blocked'),
        ('complete', 'Complete'),
        ('cancelled', 'Cancelled'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text="Type of the object this task is on"
    )
    object_id = models.PositiveIntegerField(
        help_text="ID of the object this task is on"
    )
    content_object = GenericForeignKey('content_type', 'object_id')

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal')
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_tasks',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_tasks',
    )
    due_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'content_type', 'object_id']),
            models.Index(fields=['tenant', 'assigned_to', 'status']),
        ]

    def __str__(self):
        return f"Task #{self.id}: {self.title} ({self.status})"


class DirectMessage(TenantMixin, TimestampMixin):
    """
    A direct message between two users.

    Conversations are identified by the pair (sender, recipient) regardless of order.
    Messages are displayed in a chat-style UI sorted by created_at.
    """
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_messages',
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='received_messages',
    )
    body = models.TextField()
    read = models.BooleanField(default=False)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['tenant', 'sender', 'recipient', 'created_at']),
            models.Index(fields=['tenant', 'recipient', 'read']),
        ]

    def __str__(self):
        return f"DM #{self.id}: {self.sender.username} -> {self.recipient.username}"
