# apps/tenants/admin.py
"""
Django admin configuration for tenant models.
"""
from django.contrib import admin
from .models import Tenant, TenantSettings, TenantSequence


class TenantSettingsInline(admin.StackedInline):
    """Inline editor for TenantSettings."""
    model = TenantSettings
    can_delete = False
    verbose_name_plural = 'Settings'
    fields = [
        'company_name',
        'logo',
        ('timezone', 'currency'),
        'default_payment_terms',
        ('address_line1', 'address_line2'),
        ('city', 'state', 'postal_code'),
        ('phone', 'email'),
    ]


class TenantSequenceInline(admin.TabularInline):
    """Inline editor for TenantSequence."""
    model = TenantSequence
    extra = 0
    fields = ['sequence_type', 'prefix', 'next_value', 'padding']
    readonly_fields = ['sequence_type']  # Don't allow changing sequence type


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    """Admin interface for Tenant model."""
    list_display = ['name', 'subdomain', 'is_active', 'is_default', 'created_at']
    list_filter = ['is_active', 'is_default', 'created_at']
    search_fields = ['name', 'subdomain']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['name', 'subdomain']
        }),
        ('Status', {
            'fields': ['is_active', 'is_default']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    inlines = [TenantSettingsInline, TenantSequenceInline]

    def save_model(self, request, obj, form, change):
        """Ensure only one tenant can be default."""
        if obj.is_default:
            # Remove default flag from all other tenants
            Tenant.objects.filter(is_default=True).exclude(pk=obj.pk).update(is_default=False)
        super().save_model(request, obj, form, change)


@admin.register(TenantSettings)
class TenantSettingsAdmin(admin.ModelAdmin):
    """Admin interface for TenantSettings (direct access)."""
    list_display = ['tenant', 'company_name', 'timezone', 'currency']
    list_filter = ['timezone', 'currency']
    search_fields = ['tenant__name', 'company_name']

    fieldsets = [
        ('Tenant', {
            'fields': ['tenant']
        }),
        ('Company Information', {
            'fields': ['company_name', 'logo']
        }),
        ('Localization', {
            'fields': ['timezone', 'currency', 'default_payment_terms']
        }),
        ('Address', {
            'fields': [
                'address_line1',
                'address_line2',
                ('city', 'state', 'postal_code'),
                'country'
            ]
        }),
        ('Contact', {
            'fields': ['phone', 'email']
        }),
    ]


@admin.register(TenantSequence)
class TenantSequenceAdmin(admin.ModelAdmin):
    """Admin interface for TenantSequence."""
    list_display = ['tenant', 'sequence_type', 'prefix', 'next_value', 'padding']
    list_filter = ['sequence_type', 'tenant']
    search_fields = ['tenant__name']

    fieldsets = [
        (None, {
            'fields': ['tenant', 'sequence_type']
        }),
        ('Configuration', {
            'fields': ['prefix', 'next_value', 'padding']
        }),
    ]

    def has_add_permission(self, request):
        """Prevent manual creation - should be auto-created by signals."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of sequence records."""
        return False
