# apps/documents/models.py
"""
Document and attachment models.

Models:
- Attachment: Generic file attachment that can be linked to any model
"""
from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from shared.models import TenantMixin, TimestampMixin


class Attachment(TenantMixin, TimestampMixin):
    """
    Generic file attachment that can be linked to any tenant-scoped model.

    Uses Django's ContentType framework (GenericForeignKey) so attachments
    can be associated with invoices, purchase orders, sales orders, etc.

    Example:
        # Attach a file to an invoice
        attachment = Attachment.objects.create(
            tenant=tenant,
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=invoice.pk,
            file=uploaded_file,
            filename='invoice_123.pdf',
            mime_type='application/pdf',
            uploaded_by=request.user,
        )

        # Query attachments for an object
        ct = ContentType.objects.get_for_model(invoice)
        attachments = Attachment.objects.filter(
            content_type=ct, object_id=invoice.pk
        )
    """
    # Generic relation to any model
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text="Type of the related object"
    )
    object_id = models.PositiveBigIntegerField(
        help_text="ID of the related object"
    )
    content_object = GenericForeignKey('content_type', 'object_id')

    # File data
    file = models.FileField(
        upload_to='attachments/%Y/%m/',
        help_text="Uploaded file"
    )
    filename = models.CharField(
        max_length=255,
        help_text="Original filename"
    )
    mime_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="MIME type (e.g., application/pdf, image/png)"
    )
    file_size = models.PositiveBigIntegerField(
        default=0,
        help_text="File size in bytes"
    )

    # Categorization
    CATEGORY_CHOICES = [
        ('document', 'Document'),
        ('generated_pdf', 'Generated PDF'),
        ('image', 'Image'),
        ('spreadsheet', 'Spreadsheet'),
        ('other', 'Other'),
    ]
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='document',
        help_text="Attachment category"
    )

    # Who uploaded
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_attachments',
        help_text="User who uploaded this file"
    )

    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional description"
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'content_type', 'object_id']),
            models.Index(fields=['tenant', 'category']),
        ]

    def __str__(self):
        return f"{self.filename} ({self.content_type}:{self.object_id})"

    def save(self, *args, **kwargs):
        if self.file and not self.file_size:
            self.file_size = self.file.size
        if self.file and not self.filename:
            self.filename = self.file.name
        super().save(*args, **kwargs)
