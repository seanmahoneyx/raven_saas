from django.db import models
from shared.models import TenantMixin, TimestampMixin


class Contact(TenantMixin, TimestampMixin):
    """Contact person for a Party (customer or vendor)."""
    party = models.ForeignKey(
        'parties.Party',
        on_delete=models.CASCADE,
        related_name='contacts',
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    title = models.CharField(max_length=100, blank=True, help_text="Job title, e.g. Sales Manager")
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    mobile = models.CharField(max_length=50, blank=True)
    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-is_primary', 'last_name', 'first_name']
        indexes = [
            models.Index(fields=['tenant', 'party']),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"
