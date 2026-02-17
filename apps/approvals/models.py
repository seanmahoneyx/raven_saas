# apps/approvals/models.py
"""
Approval workflow models.

ApprovalRequest: Generic approval tied to any model via GenericForeignKey.
Supports rule-based triggers (e.g., PO amount threshold, low margin,
credit limit exceeded) with email one-click approve/reject via UUID token.
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone

from shared.models import TenantMixin, TimestampMixin


class ApprovalRequest(TenantMixin, TimestampMixin):
    """
    A request for approval tied to any model instance.

    Created automatically by ApprovalService when a business rule is
    triggered (e.g., PO exceeds amount threshold, SO has low margin,
    order exceeds customer credit limit).

    The token field enables one-click approve/reject from email links
    without requiring login.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('expired', 'Expired'),
    ]

    # Generic relation to any model (SalesOrder, PurchaseOrder, etc.)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text="Type of the object requiring approval"
    )
    object_id = models.PositiveIntegerField(
        help_text="ID of the object requiring approval"
    )
    content_object = GenericForeignKey('content_type', 'object_id')

    # Rule that triggered this approval
    rule_code = models.CharField(
        max_length=50,
        help_text="Rule code (e.g., 'po_amount_threshold', 'so_low_margin', 'credit_limit_exceeded')"
    )
    rule_description = models.CharField(
        max_length=255,
        help_text="Human-readable reason for requiring approval"
    )

    # People
    requestor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='approval_requests_created',
        help_text="User who triggered the approval request"
    )
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approval_requests_assigned',
        help_text="User assigned to approve/reject"
    )

    # Status and workflow
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        help_text="Current approval status"
    )
    token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        help_text="One-click email approval/rejection token"
    )
    expires_at = models.DateTimeField(
        help_text="When this approval request expires (default 48h from creation)"
    )
    decided_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the approval/rejection decision was made"
    )
    decision_note = models.TextField(
        blank=True,
        help_text="Optional reason for the approval/rejection decision"
    )

    # Cached display data
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Cached order amount for display in approval list"
    )

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'approver', 'status']),
            models.Index(fields=['token']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"Approval #{self.id} - {self.rule_code} ({self.status})"

    @property
    def is_expired(self):
        """Check if this approval request has passed its expiration time."""
        return timezone.now() > self.expires_at

    def save(self, *args, **kwargs):
        # Set expiration to 48 hours from creation on first save
        if not self.pk:
            self.expires_at = timezone.now() + timedelta(hours=48)
        super().save(*args, **kwargs)
