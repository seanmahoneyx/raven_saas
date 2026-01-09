# apps/costing/admin.py
"""
Django admin configuration for Costing models.
"""
from django.contrib import admin
from .models import CostListHead, CostListLine


class CostListLineInline(admin.TabularInline):
    """Inline editor for CostListLine."""
    model = CostListLine
    extra = 1
    fields = ['min_quantity', 'unit_cost']


@admin.register(CostListHead)
class CostListHeadAdmin(admin.ModelAdmin):
    """Admin interface for CostListHead."""
    list_display = [
        'vendor', 'item', 'begin_date', 'end_date', 'is_active', 'num_lines_display'
    ]
    list_filter = ['is_active', 'begin_date', 'end_date']
    search_fields = [
        'vendor__party__display_name', 'vendor__party__code',
        'item__sku', 'item__name'
    ]
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['vendor', 'item']
    date_hierarchy = 'begin_date'

    fieldsets = [
        (None, {
            'fields': ['vendor', 'item']
        }),
        ('Validity Period', {
            'fields': ['begin_date', 'end_date', 'is_active']
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

    inlines = [CostListLineInline]

    def num_lines_display(self, obj):
        return obj.lines.count()
    num_lines_display.short_description = 'Tiers'

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


@admin.register(CostListLine)
class CostListLineAdmin(admin.ModelAdmin):
    """Direct admin for CostListLine."""
    list_display = ['cost_list', 'min_quantity', 'unit_cost']
    list_filter = ['cost_list__is_active']
    search_fields = [
        'cost_list__vendor__party__display_name',
        'cost_list__item__sku'
    ]
    raw_id_fields = ['cost_list']
