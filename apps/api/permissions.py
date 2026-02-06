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


# ============================================================================
# RBAC Permissions (Role-Based Access Control)
# ============================================================================

class IsInGroup(permissions.BasePermission):
    """Base class for group-based permissions."""
    group_name = None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Superusers and Admin group always have access
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(name=self.group_name).exists() or \
               request.user.groups.filter(name='Admin').exists()


class IsAdmin(IsInGroup):
    """User must be in Admin group or superuser."""
    group_name = 'Admin'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.is_superuser or \
               request.user.groups.filter(name='Admin').exists()


class IsSalesTeam(IsInGroup):
    """User must be in Sales or Admin group."""
    group_name = 'Sales'


class IsWarehouseTeam(IsInGroup):
    """User must be in Warehouse or Admin group."""
    group_name = 'Warehouse'


class IsDriver(IsInGroup):
    """User must be in Driver or Admin group."""
    group_name = 'Driver'


class IsPurchasingTeam(IsInGroup):
    """User must be in Purchasing or Admin group."""
    group_name = 'Purchasing'


class HasFinancialAccess(permissions.BasePermission):
    """
    User must be in Admin or Sales group (financial operations).
    Covers: invoicing, payments, reports.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name__in=['Admin', 'Sales']
        ).exists()


class ReadOnlyOrAdmin(permissions.BasePermission):
    """
    Read-only access for everyone, write access for Admin only.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_superuser or \
               request.user.groups.filter(name='Admin').exists()
