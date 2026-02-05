# apps/tenants/models.py
"""
Tenant models for multi-tenant SaaS architecture.

Models:
- Tenant: Represents a single customer company
- TenantSettings: Configuration and preferences for each tenant
- TenantSequence: Auto-generate sequential numbers (orders, invoices, etc.)
"""
from django.db import models, transaction


class Tenant(models.Model):
    """
    Represents a single tenant (customer company) in the SaaS system.

    Each tenant has isolated data - no tenant can see another tenant's data.
    """
    name = models.CharField(max_length=255, help_text="Company name")
    subdomain = models.CharField(
        max_length=63,
        unique=True,
        help_text="Subdomain for accessing the system (e.g., 'acme' for acme.ravensaas.com)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive tenants cannot log in"
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Default tenant for development (only one should be default)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['subdomain']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return self.name


class TenantSettings(models.Model):
    """
    Configuration and preferences for each tenant.

    Created automatically when a Tenant is created (via signals).
    """
    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name='settings'
    )

    # Company Information
    company_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Full legal company name"
    )
    logo = models.ImageField(
        upload_to='tenant_logos/',
        null=True,
        blank=True,
        help_text="Company logo"
    )

    # Localization
    timezone = models.CharField(
        max_length=50,
        default='America/New_York',
        help_text="Default timezone for the tenant"
    )
    currency = models.CharField(
        max_length=3,
        default='USD',
        help_text="Currency code (ISO 4217)"
    )

    # Business Defaults
    default_payment_terms = models.CharField(
        max_length=50,
        default='NET30',
        help_text="Default payment terms for new customers"
    )

    # Address
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=50, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, default='USA')

    # Contact
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings for {self.tenant.name}"


class TenantSequence(models.Model):
    """
    Auto-generate sequential numbers for orders, invoices, etc. per tenant.

    Each tenant has independent sequences to avoid number conflicts.

    Usage:
        number = get_next_sequence_number(tenant, 'SO')  # Returns 'SO-000001'
    """
    SEQUENCE_TYPES = [
        ('SO', 'Sales Order'),
        ('PO', 'Purchase Order'),
        ('INV', 'Invoice'),
        ('BOL', 'Bill of Lading'),
        ('CONTRACT', 'Contract'),
        ('JE', 'Journal Entry'),
    ]

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='sequences'
    )
    sequence_type = models.CharField(
        max_length=20,
        choices=SEQUENCE_TYPES,
        help_text="Type of sequence (SO, PO, INV, etc.)"
    )
    prefix = models.CharField(
        max_length=10,
        help_text="Prefix for the number (e.g., 'SO-', 'PO-')"
    )
    next_value = models.PositiveIntegerField(
        default=1,
        help_text="Next number to use"
    )
    padding = models.PositiveIntegerField(
        default=6,
        help_text="Zero-pad to this width (e.g., 6 = '000001')"
    )

    class Meta:
        unique_together = [('tenant', 'sequence_type')]
        indexes = [
            models.Index(fields=['tenant', 'sequence_type']),
        ]

    def __str__(self):
        return f"{self.tenant.name} - {self.sequence_type}"


def get_next_sequence_number(tenant, sequence_type):
    """
    Get the next sequential number for a tenant and sequence type.

    Args:
        tenant: Tenant instance
        sequence_type: One of 'SO', 'PO', 'INV', 'BOL', 'CONTRACT'

    Returns:
        str: Formatted sequence number (e.g., 'SO-000001')

    Example:
        order_number = get_next_sequence_number(tenant, 'SO')
        # order_number = 'SO-000001'
    """
    with transaction.atomic():
        seq = TenantSequence.objects.select_for_update().get(
            tenant=tenant,
            sequence_type=sequence_type
        )
        number = f"{seq.prefix}{str(seq.next_value).zfill(seq.padding)}"
        seq.next_value += 1
        seq.save()
        return number
