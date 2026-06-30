# apps/documents/models.py
"""
Document and attachment models.

Models:
- Attachment: Generic file attachment that can be linked to any model
- DocumentLink: Generic lineage edge recording "document A produced document B"
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


class DocumentLink(TenantMixin, TimestampMixin):
    """
    Generic lineage edge recording that one document produced another.

    Mirrors the polymorphic Attachment pattern: both ends of the link are
    GenericForeignKeys (content_type FK + object_id) so any tenant-scoped
    document in the transaction pipeline can be linked to any other —
    Estimate → Contract → Sales Order → Pick Ticket → BOL → Invoice → Payment.

    Example:
        # Record that an estimate produced a sales order
        DocumentLink.record_link(
            source=estimate,
            target=sales_order,
            relation='estimate_to_sales_order',
            tenant=tenant,
            user=request.user,
        )

        # Read every link touching a sales order (as source OR target)
        ct = ContentType.objects.get_for_model(sales_order)
        DocumentLink.objects.filter(
            models.Q(source_content_type=ct, source_object_id=sales_order.pk) |
            models.Q(target_content_type=ct, target_object_id=sales_order.pk)
        )
    """
    # Relation kinds covering the transaction pipeline transitions.
    RELATION_CHOICES = [
        ('estimate_to_sales_order', 'Estimate → Sales Order'),
        ('estimate_to_contract', 'Estimate → Contract'),
        ('rfq_to_purchase_order', 'RFQ → Purchase Order'),
        ('contract_release', 'Contract → Sales Order (Release)'),
        ('sales_order_to_pick_ticket', 'Sales Order → Pick Ticket'),
        ('pick_ticket_to_shipment', 'Pick Ticket → Shipment'),
        ('bol_from_shipment', 'Shipment → Bill of Lading'),
        ('invoice_from_order', 'Sales Order → Invoice'),
        ('invoice_from_shipment', 'Shipment → Invoice'),
        ('invoice_from_picks', 'Pick Ticket → Invoice'),
        ('payment_for_invoice', 'Invoice → Payment'),
        ('po_to_item_receipt', 'Purchase Order → Item Receipt'),
        ('bill_from_receipt', 'Item Receipt → Vendor Bill'),
        ('other', 'Other'),
    ]

    # Source end (the document that produced the target)
    source_content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name='+',
        help_text="Type of the source (producing) document",
    )
    source_object_id = models.PositiveBigIntegerField(
        help_text="ID of the source (producing) document"
    )
    source = GenericForeignKey('source_content_type', 'source_object_id')

    # Target end (the document that was produced)
    target_content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name='+',
        help_text="Type of the target (produced) document",
    )
    target_object_id = models.PositiveBigIntegerField(
        help_text="ID of the target (produced) document"
    )
    target = GenericForeignKey('target_content_type', 'target_object_id')

    relation = models.CharField(
        max_length=40,
        choices=RELATION_CHOICES,
        help_text="The pipeline transition this link represents",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_document_links',
        help_text="User who triggered the conversion that created this link",
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'source_content_type', 'source_object_id']),
            models.Index(fields=['tenant', 'target_content_type', 'target_object_id']),
        ]
        unique_together = [
            (
                'tenant',
                'source_content_type', 'source_object_id',
                'target_content_type', 'target_object_id',
                'relation',
            ),
        ]

    def __str__(self):
        return (
            f"{self.source_content_type}:{self.source_object_id} "
            f"-[{self.relation}]-> "
            f"{self.target_content_type}:{self.target_object_id}"
        )

    @classmethod
    def record_link(cls, source, target, relation, tenant, user=None):
        """
        Idempotently record that ``source`` produced ``target``.

        Resolves both ends to (content_type, object_id) and get_or_creates the
        link so conversions can be re-run without creating duplicate edges.

        Args:
            source: The producing document instance (e.g. Estimate)
            target: The produced document instance (e.g. SalesOrder)
            relation: One of RELATION_CHOICES keys
            tenant: Tenant instance to scope the link
            user: Optional user performing the conversion

        Returns:
            DocumentLink: The existing or newly-created link
        """
        source_ct = ContentType.objects.get_for_model(type(source))
        target_ct = ContentType.objects.get_for_model(type(target))
        link, _created = cls.objects.get_or_create(
            tenant=tenant,
            source_content_type=source_ct,
            source_object_id=source.pk,
            target_content_type=target_ct,
            target_object_id=target.pk,
            relation=relation,
            defaults={'created_by': user},
        )
        return link


def record_link(source, target, relation, tenant, user=None):
    """Module-level convenience wrapper around ``DocumentLink.record_link``.

    Importable by services as ``from apps.documents.models import record_link``.
    """
    return DocumentLink.record_link(source, target, relation, tenant, user=user)
