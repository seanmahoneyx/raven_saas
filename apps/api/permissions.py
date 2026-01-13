# apps/api/permissions.py
"""
Tenant-aware permissions for the REST API.

These permissions ensure users can only access data belonging to their tenant.
"""
from rest_framework import permissions


class IsTenantUser(permissions.BasePermission):
    """
    Permission that checks if the user belongs to the current tenant.

    This is applied globally and works with TenantMiddleware to ensure
    all API requests are properly scoped.
    """
    message = "You do not have permission to access this tenant's data."

    def has_permission(self, request, view):
        # Must be authenticated
        if not request.user or not request.user.is_authenticated:
            return False

        # Must have a tenant set (from TenantMiddleware)
        if not hasattr(request, 'tenant') or request.tenant is None:
            return False

        # User must belong to the request's tenant
        if hasattr(request.user, 'tenant'):
            return request.user.tenant == request.tenant

        # Superusers can access any tenant
        if request.user.is_superuser:
            return True

        return True  # Allow if no tenant field on user (backwards compat)

    def has_object_permission(self, request, view, obj):
        # Object must belong to the current tenant
        if hasattr(obj, 'tenant'):
            return obj.tenant == request.tenant
        return True


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allow read-only access to all authenticated users,
    but only allow write access to admin/staff users.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff
