from django.db import models
from django.conf import settings
from django.utils import timezone
from simple_history.models import HistoricalRecords

from shared.models import TenantMixin, TimestampMixin
from apps.items.models import TEST_TYPES, FLUTE_TYPES, PAPER_TYPES


class DesignRequest(TenantMixin, TimestampMixin, models.Model):
    """
    Design request for corrugated packaging.
    Tracks the workflow from initial request through approval and item creation.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('completed', 'Completed'),
    ]

    # Auto-generated file number: MS{YYYY}{####}
    file_number = models.CharField(
        max_length=20,
        blank=True,
        help_text="Auto-generated file number (e.g., MS20260001)"
    )

    # Relationships
    customer = models.ForeignKey(
        'parties.Party',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='design_requests',
        help_text="Customer requesting the design"
    )

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='design_requests_created',
        help_text="User who created the request"
    )

    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='design_requests_assigned',
        help_text="Designer assigned to this request"
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )

    # Spec fields (corrugated dimensions)
    ident = models.CharField(
        max_length=100,
        blank=True,
        help_text="Item identifier / name"
    )

    style = models.CharField(
        max_length=50,
        blank=True,
        help_text="Box style (RSC, DC, FOL, etc.)"
    )

    length = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Length dimension"
    )

    width = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Width dimension"
    )

    depth = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Depth dimension"
    )

    test = models.CharField(
        max_length=10,
        choices=TEST_TYPES,
        blank=True,
        help_text="Board test strength"
    )

    flute = models.CharField(
        max_length=5,
        choices=FLUTE_TYPES,
        blank=True,
        help_text="Flute type"
    )

    paper = models.CharField(
        max_length=5,
        choices=PAPER_TYPES,
        blank=True,
        help_text="Paper grade"
    )

    # Checklist booleans
    has_ard = models.BooleanField(
        default=False,
        help_text="Has ARD (Art Ready Document)"
    )

    has_pdf = models.BooleanField(
        default=False,
        help_text="Has PDF proof"
    )

    has_eps = models.BooleanField(
        default=False,
        help_text="Has EPS file"
    )

    has_dxf = models.BooleanField(
        default=False,
        help_text="Has DXF die drawing"
    )

    has_samples = models.BooleanField(
        default=False,
        help_text="Has physical samples"
    )

    pallet_configuration = models.BooleanField(
        default=False,
        help_text="Pallet configuration determined"
    )

    # Other fields
    sample_quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of samples to produce"
    )

    notes = models.TextField(
        blank=True,
        help_text="Additional notes and requirements"
    )

    generated_item = models.OneToOneField(
        'items.Item',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='design_request',
        help_text="Item created when design is promoted"
    )

    # History tracking
    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'file_number')]
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'customer']),
            models.Index(fields=['tenant', 'file_number']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.file_number} - {self.ident or 'Untitled'}"

    def save(self, *args, **kwargs):
        if not self.file_number:
            from django.db import connection, transaction

            with transaction.atomic():
                # Lock and get max file_number for this tenant + year
                year = timezone.now().year
                prefix = f'MS{year}'

                last = (DesignRequest.objects
                    .filter(tenant=self.tenant, file_number__startswith=prefix)
                    .select_for_update()
                    .order_by('-file_number')
                    .first())

                if last:
                    seq = int(last.file_number[6:]) + 1
                else:
                    seq = 1

                self.file_number = f'{prefix}{seq:04d}'

        super().save(*args, **kwargs)
