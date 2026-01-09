# apps/tenants/signals.py
"""
Signals for automatic tenant setup.

When a Tenant is created:
1. Create TenantSettings (one-to-one)
2. Create TenantSequence records for all sequence types
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Tenant, TenantSettings, TenantSequence


@receiver(post_save, sender=Tenant)
def create_tenant_settings(sender, instance, created, **kwargs):
    """
    Automatically create TenantSettings when a Tenant is created.
    """
    if created:
        TenantSettings.objects.create(
            tenant=instance,
            company_name=instance.name  # Default to tenant name
        )


@receiver(post_save, sender=Tenant)
def create_tenant_sequences(sender, instance, created, **kwargs):
    """
    Automatically create sequence records for all sequence types when a Tenant is created.
    """
    if created:
        sequence_configs = [
            ('SO', 'SO-', 1, 6),        # Sales Orders: SO-000001
            ('PO', 'PO-', 1, 6),        # Purchase Orders: PO-000001
            ('INV', 'INV-', 1, 6),      # Invoices: INV-000001
            ('BOL', 'BOL-', 1, 6),      # Bills of Lading: BOL-000001
            ('CONTRACT', 'CTR-', 1, 6), # Contracts: CTR-000001
        ]

        for seq_type, prefix, next_val, padding in sequence_configs:
            TenantSequence.objects.create(
                tenant=instance,
                sequence_type=seq_type,
                prefix=prefix,
                next_value=next_val,
                padding=padding
            )
