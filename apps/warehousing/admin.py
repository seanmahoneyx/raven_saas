# apps/warehousing/admin.py
"""
Django admin configuration for Warehousing models.
"""
from django.contrib import admin
from .models import Warehouse, Bin


class BinInline(admin.TabularInline):
    """Inline editor for Bins within a Warehouse."""
    model = Bin
    extra = 3
    fields = ['code', 'aisle', 'rack', 'level', 'bin_type', 'is_active']


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    """Admin interface for Warehouse."""
    list_display = ['code', 'name', 'is_active', 'is_default', 'bin_count']
    list_filter = ['is_active', 'is_default']
    search_fields = ['name', 'code']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['location']

    fieldsets = [
        (None, {
            'fields': ['name', 'code', 'location']
        }),
        ('Settings', {
            'fields': ['is_active', 'is_default']
        }),
        ('Notes', {
            'fields': ['notes'],
            'classes': ['collapse']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    inlines = [BinInline]

    def bin_count(self, obj):
        return obj.bins.count()
    bin_count.short_description = 'Bins'

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for instance in instances:
            if hasattr(instance, 'tenant_id') and not instance.tenant_id:
                instance.tenant = form.instance.tenant
            instance.save()
        formset.save_m2m()


@admin.register(Bin)
class BinAdmin(admin.ModelAdmin):
    """Admin interface for Bin."""
    list_display = ['code', 'warehouse', 'aisle', 'rack', 'level', 'bin_type', 'is_active']
    list_filter = ['warehouse', 'bin_type', 'is_active']
    search_fields = ['code', 'warehouse__name', 'warehouse__code']
    raw_id_fields = ['warehouse']

    fieldsets = [
        (None, {
            'fields': ['warehouse', 'code']
        }),
        ('Location', {
            'fields': ['aisle', 'rack', 'level']
        }),
        ('Settings', {
            'fields': ['bin_type', 'is_active']
        }),
    ]
