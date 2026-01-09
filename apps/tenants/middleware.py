# apps/tenants/middleware.py
"""
TenantMiddleware - Resolves the current tenant from the request.

CRITICAL: This middleware MUST be positioned correctly in settings.MIDDLEWARE
to ensure tenant is set before any database queries are made.

Resolution order:
1. HTTP_X_TENANT_ID header (for API requests, mobile app)
2. Subdomain (e.g., acme.ravensaas.com -> acme)
3. Default tenant (for development)
"""
from django.http import HttpResponseForbidden
from shared.managers import set_current_tenant, get_current_tenant
from .models import Tenant


class TenantMiddleware:
    """
    Middleware to resolve tenant from request and set in thread-local storage.

    This enables automatic query scoping via TenantManager.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Resolve tenant from request
        tenant = self.get_tenant_from_request(request)

        if not tenant:
            # No tenant found and not an admin/static request
            if not request.path.startswith(('/admin/', '/static/', '/media/')):
                return HttpResponseForbidden(
                    "No tenant found. Please access via subdomain or contact support."
                )

        # Store tenant on request object (for views to access)
        request.tenant = tenant

        # Store tenant in thread-local storage (for TenantManager automatic scoping)
        set_current_tenant(tenant)

        try:
            response = self.get_response(request)
        finally:
            # Always clear tenant after request completes (important for thread pools)
            set_current_tenant(None)

        return response

    def get_tenant_from_request(self, request):
        """
        Resolve tenant from request using multiple strategies.

        Returns:
            Tenant instance or None
        """
        # Strategy 1: Try header first (for API/mobile app)
        tenant_id = request.META.get('HTTP_X_TENANT_ID')
        if tenant_id:
            try:
                return Tenant.objects.filter(id=tenant_id, is_active=True).first()
            except (Tenant.DoesNotExist, ValueError):
                pass

        # Strategy 2: Try subdomain (e.g., acme.ravensaas.com)
        host = request.get_host().split(':')[0]  # Remove port if present
        parts = host.split('.')

        if len(parts) >= 2:
            subdomain = parts[0]

            # Skip common non-tenant subdomains
            if subdomain not in ['www', 'api', 'admin', 'localhost', '127']:
                try:
                    return Tenant.objects.filter(
                        subdomain=subdomain,
                        is_active=True
                    ).first()
                except Tenant.DoesNotExist:
                    pass

        # Strategy 3: Fallback to default tenant (for development)
        # This allows local development at http://localhost:8000
        return Tenant.objects.filter(is_default=True, is_active=True).first()
