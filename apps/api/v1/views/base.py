# apps/api/v1/views/base.py
"""
Base ViewSet classes for tenant-aware API views.
"""
from rest_framework import viewsets


class TenantModelViewSet(viewsets.ModelViewSet):
    """
    Base ViewSet that properly handles tenant-scoped querysets.

    The key issue is that class-level `queryset = Model.objects.all()` is evaluated
    at import time when no tenant is set, resulting in an empty queryset.

    This base class defers queryset evaluation to request time when the tenant
    middleware has already set the current tenant.

    Usage:
        class PartyViewSet(TenantModelViewSet):
            model = Party
            # ... rest of your viewset configuration
    """
    model = None  # Subclasses must set this

    def get_queryset(self):
        """
        Get queryset at request time (after tenant middleware runs).

        This ensures the TenantManager properly filters by the current tenant.
        """
        if self.model is None:
            raise NotImplementedError(
                f"{self.__class__.__name__} must define 'model' attribute"
            )

        # Get base queryset - tenant filtering happens automatically via TenantManager
        return self.model.objects.all()
