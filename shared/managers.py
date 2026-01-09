# shared/managers.py
"""
Tenant-scoped manager with automatic query filtering.

CRITICAL: This prevents data leaks between tenants by automatically
filtering all queries to the current tenant from thread-local storage.
"""
from django.db import models
import threading

# Thread-local storage for current tenant
_thread_locals = threading.local()


def set_current_tenant(tenant):
    """Set the current tenant in thread-local storage."""
    _thread_locals.tenant = tenant


def get_current_tenant():
    """Get the current tenant from thread-local storage."""
    return getattr(_thread_locals, 'tenant', None)


class TenantManager(models.Manager):
    """
    Manager that automatically filters all queries by current tenant.

    CRITICAL: This prevents accidental data leaks between tenants.
    Every query will be scoped to the current tenant from thread-local storage.

    Usage:
        class MyModel(TenantMixin):
            # objects will automatically filter by tenant
            pass

        # All queries automatically scoped:
        MyModel.objects.all()  # Only returns current tenant's records
        MyModel.objects.filter(name='foo')  # Also scoped to tenant
    """

    def get_queryset(self):
        """Override to add automatic tenant filtering."""
        tenant = get_current_tenant()
        qs = super().get_queryset()

        if tenant:
            return qs.filter(tenant=tenant)

        # If no tenant set, return empty queryset (fail-safe)
        # This prevents data leaks if middleware fails
        return qs.none()

    def all_tenants(self):
        """
        Bypass tenant scoping - use with extreme caution.

        Only use this for:
        - Admin operations that need to see all tenants
        - System maintenance tasks
        - Data migrations

        Example:
            all_customers = Customer.objects.all_tenants()
        """
        return super().get_queryset()
