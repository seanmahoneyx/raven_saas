# apps/items/admin.py
"""
Django admin configuration for Item models.
"""
from django.contrib import admin
from .models import UnitOfMeasure, Item, ItemUOM


@admin.register(UnitOfMeasure)
class UnitOfMeasureAdmin(admin.ModelAdmin):
    """Admin interface for UnitOfMeasure."""
    list_display = ['code', 'name', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['code', 'name']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['code', 'name', 'description']
        }),
        ('Status', {
            'fields': ['is_active']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)


class ItemUOMInline(admin.TabularInline):
    """Inline editor for ItemUOM conversions."""
    model = ItemUOM
    extra = 1
    fields = ['uom', 'multiplier_to_base']

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "uom" and hasattr(request, 'tenant'):
            kwargs["queryset"] = UnitOfMeasure.objects.filter(
                tenant=request.tenant, is_active=True
            )
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    """Admin interface for Item with UOM conversions inline."""
    list_display = ['sku', 'name', 'base_uom', 'is_inventory', 'is_active', 'created_at']
    list_filter = ['is_inventory', 'is_active', 'base_uom', 'created_at']
    search_fields = ['sku', 'name', 'description']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['base_uom']

    fieldsets = [
        (None, {
            'fields': ['sku', 'name', 'description']
        }),
        ('Configuration', {
            'fields': ['base_uom', 'is_inventory']
        }),
        ('Status', {
            'fields': ['is_active']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    inlines = [ItemUOMInline]

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


@admin.register(ItemUOM)
class ItemUOMAdmin(admin.ModelAdmin):
    """Direct admin interface for ItemUOM conversions."""
    list_display = ['item', 'uom', 'multiplier_to_base', 'conversion_display']
    list_filter = ['uom', 'created_at']
    search_fields = ['item__sku', 'item__name']
    raw_id_fields = ['item', 'uom']

    def conversion_display(self, obj):
        return f"1 {obj.uom.code} = {obj.multiplier_to_base} {obj.item.base_uom.code}"
    conversion_display.short_description = "Conversion"
