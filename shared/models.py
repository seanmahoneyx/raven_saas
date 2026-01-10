# shared/models.py
"""
Abstract base models for the entire application.

TenantMixin: Adds automatic tenant scoping to any model
TimestampMixin: Adds created_at and updated_at timestamps
TenantContext: Context manager for setting tenant in tests/scripts
"""
from django.db import models
from .managers import TenantManager, set_current_tenant, get_current_tenant


class TenantContext:
    """
    Context manager for temporarily setting the current tenant.

    Useful for testing and management commands that need to operate
    within a specific tenant's context.

    Example:
        with TenantContext(tenant):
            # All queries here are scoped to this tenant
            customers = Customer.objects.all()
    """
    def __init__(self, tenant):
        self.tenant = tenant
        self.previous_tenant = None

    def __enter__(self):
        self.previous_tenant = get_current_tenant()
        set_current_tenant(self.tenant)
        return self.tenant

    def __exit__(self, exc_type, exc_val, exc_tb):
        set_current_tenant(self.previous_tenant)
        return False


class TenantMixin(models.Model):
    """
    Abstract base model for tenant-scoped models.

    CRITICAL: Uses TenantManager to automatically filter all queries by tenant.
    This prevents accidental data leaks between tenants.

    All models that store tenant-specific data should inherit from this.

    Example:
        class Customer(TenantMixin, TimestampMixin):
            name = models.CharField(max_length=255)

        # Queries automatically scoped:
        Customer.objects.all()  # Only current tenant's customers
    """
    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        related_name='%(class)s_set'
    )

    # Default manager with automatic tenant scoping
    objects = TenantManager()

    class Meta:
        abstract = True


class TimestampMixin(models.Model):
    """
    Abstract base model that adds timestamp tracking.

    Provides:
    - created_at: Set once when record is created
    - updated_at: Updated every time record is saved
    """
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
