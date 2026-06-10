# apps/api/v1/views/base.py
"""
Base ViewSet classes and helpers for tenant-aware API views.
"""
from django.http import HttpResponse
from rest_framework import viewsets


def pdf_response(pdf_bytes, filename, *, inline=True):
    """
    Build an HttpResponse that serves PDF bytes with a Content-Disposition header.

    Single source of truth for the ~30 hand-rolled PDF responses across the
    report/document views. `inline=True` renders in the browser; `inline=False`
    forces a download.
    """
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    disposition = 'inline' if inline else 'attachment'
    response['Content-Disposition'] = f'{disposition}; filename="{filename}"'
    return response


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
