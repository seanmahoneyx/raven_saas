# apps/pricing/admin.py
"""
Django admin configuration for Pricing models.
"""
from django.contrib import admin
from .models import PriceListHead, PriceListLine


class PriceListLineInline(admin.TabularInline):
    """Inline editor for PriceListLine."""
    model = PriceListLine
    extra = 1
    fields = ['min_quantity', 'unit_price']


@admin.register(PriceListHead)
class PriceListHeadAdmin(admin.ModelAdmin):
    """Admin interface for PriceListHead."""
    list_display = [
        'customer', 'item', 'begin_date', 'end_date', 'is_active', 'num_lines_display'
    ]
    list_filter = ['is_active', 'begin_date', 'end_date']
    search_fields = [
        'customer__party__display_name', 'customer__party__code',
        'item__sku', 'item__name'
    ]
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['customer', 'item']
    date_hierarchy = 'begin_date'

    fieldsets = [
        (None, {
            'fields': ['customer', 'item']
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

    inlines = [PriceListLineInline]

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


@admin.register(PriceListLine)
class PriceListLineAdmin(admin.ModelAdmin):
    """Direct admin for PriceListLine."""
    list_display = ['price_list', 'min_quantity', 'unit_price']
    list_filter = ['price_list__is_active']
    search_fields = [
        'price_list__customer__party__display_name',
        'price_list__item__sku'
    ]
    raw_id_fields = ['price_list']
