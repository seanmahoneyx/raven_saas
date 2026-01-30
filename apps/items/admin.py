# apps/items/admin.py
"""
Django admin configuration for Item models.
"""
from django.contrib import admin
from .models import (
    UnitOfMeasure, Item, ItemUOM, ItemVendor,
    CorrugatedFeature, CorrugatedItem, ItemFeature,
    DCItem, RSCItem, HSCItem, FOLItem, TeleItem
)


# =============================================================================
# UNIT OF MEASURE
# =============================================================================

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


# =============================================================================
# BASE ITEM
# =============================================================================

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


class ItemVendorInline(admin.TabularInline):
    """Inline editor for ItemVendor relationships."""
    model = ItemVendor
    extra = 1
    fields = ['vendor', 'mpn', 'lead_time_days', 'min_order_qty', 'is_preferred', 'is_active']
    raw_id_fields = ['vendor']


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    """Admin interface for base Item with UOM conversions and vendors inline."""
    list_display = ['sku', 'name', 'division', 'base_uom', 'customer', 'is_inventory', 'is_active']
    list_filter = ['division', 'is_inventory', 'is_active', 'base_uom', 'created_at']
    search_fields = ['sku', 'name', 'description', 'purch_desc', 'sell_desc']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['base_uom', 'customer']

    fieldsets = [
        ('Identification', {
            'fields': ['sku', 'name', 'division', 'revision']
        }),
        ('Descriptions', {
            'fields': ['description', 'purch_desc', 'sell_desc'],
            'classes': ['collapse']
        }),
        ('Configuration', {
            'fields': ['base_uom', 'customer', 'is_inventory']
        }),
        ('Unitizing / Pallet', {
            'fields': [
                ('units_per_layer', 'layers_per_pallet', 'units_per_pallet'),
                ('unit_height', 'pallet_height', 'pallet_footprint')
            ],
            'classes': ['collapse']
        }),
        ('Attachments', {
            'fields': ['attachment'],
            'classes': ['collapse']
        }),
        ('Status', {
            'fields': ['is_active']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    inlines = [ItemUOMInline, ItemVendorInline]

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


@admin.register(ItemVendor)
class ItemVendorAdmin(admin.ModelAdmin):
    """Admin interface for ItemVendor relationships."""
    list_display = ['item', 'vendor', 'mpn', 'lead_time_days', 'is_preferred', 'is_active']
    list_filter = ['is_preferred', 'is_active', 'created_at']
    search_fields = ['item__sku', 'item__name', 'vendor__display_name', 'mpn']
    raw_id_fields = ['item', 'vendor']

    fieldsets = [
        (None, {
            'fields': ['item', 'vendor']
        }),
        ('Vendor Details', {
            'fields': ['mpn', 'lead_time_days', 'min_order_qty']
        }),
        ('Status', {
            'fields': ['is_preferred', 'is_active']
        }),
    ]

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)


# =============================================================================
# CORRUGATED FEATURES
# =============================================================================

@admin.register(CorrugatedFeature)
class CorrugatedFeatureAdmin(admin.ModelAdmin):
    """Admin interface for CorrugatedFeature master list."""
    list_display = ['code', 'name', 'requires_details', 'is_active']
    list_filter = ['requires_details', 'is_active']
    search_fields = ['code', 'name']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['code', 'name']
        }),
        ('Configuration', {
            'fields': ['requires_details']
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


# =============================================================================
# CORRUGATED ITEMS
# =============================================================================

class ItemFeatureInline(admin.TabularInline):
    """Inline editor for ItemFeature M2M through table."""
    model = ItemFeature
    extra = 1
    fields = ['feature', 'details']
    raw_id_fields = ['feature']


class CorrugatedItemAdmin(admin.ModelAdmin):
    """Base admin for CorrugatedItem and subtypes."""
    list_display = ['sku', 'name', 'test', 'flute', 'paper', 'is_printed', 'is_active']
    list_filter = ['test', 'flute', 'paper', 'is_printed', 'is_active']
    search_fields = ['sku', 'name', 'description']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['base_uom', 'customer']

    corrugated_fieldsets = [
        ('Identification', {
            'fields': ['sku', 'name', 'revision']
        }),
        ('Board Specifications', {
            'fields': [('test', 'flute', 'paper')]
        }),
        ('Printing', {
            'fields': ['is_printed', ('panels_printed', 'colors_printed'), 'ink_list'],
            'classes': ['collapse']
        }),
        ('Descriptions', {
            'fields': ['description', 'purch_desc', 'sell_desc'],
            'classes': ['collapse']
        }),
        ('Configuration', {
            'fields': ['base_uom', 'customer', 'is_inventory']
        }),
        ('Unitizing / Pallet', {
            'fields': [
                ('units_per_layer', 'layers_per_pallet', 'units_per_pallet'),
                ('unit_height', 'pallet_height', 'pallet_footprint')
            ],
            'classes': ['collapse']
        }),
        ('Attachments', {
            'fields': ['attachment'],
            'classes': ['collapse']
        }),
        ('Status', {
            'fields': ['is_active']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    inlines = [ItemFeatureInline, ItemUOMInline, ItemVendorInline]

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


@admin.register(CorrugatedItem)
class CorrugatedItemAdminRegistered(CorrugatedItemAdmin):
    """Admin for generic CorrugatedItem."""
    fieldsets = CorrugatedItemAdmin.corrugated_fieldsets


@admin.register(DCItem)
class DCItemAdmin(CorrugatedItemAdmin):
    """Admin for Die Cut items."""
    list_display = ['sku', 'name', 'length', 'width', 'test', 'flute', 'is_printed', 'is_active']

    fieldsets = [
        ('Identification', {
            'fields': ['sku', 'name', 'revision']
        }),
        ('Dimensions', {
            'fields': [('length', 'width'), ('blank_length', 'blank_width'), 'out_per_rotary']
        }),
        ('Board Specifications', {
            'fields': [('test', 'flute', 'paper')]
        }),
        ('Printing', {
            'fields': ['is_printed', ('panels_printed', 'colors_printed'), 'ink_list'],
            'classes': ['collapse']
        }),
        ('Descriptions', {
            'fields': ['description', 'purch_desc', 'sell_desc'],
            'classes': ['collapse']
        }),
        ('Configuration', {
            'fields': ['base_uom', 'customer', 'is_inventory']
        }),
        ('Unitizing / Pallet', {
            'fields': [
                ('units_per_layer', 'layers_per_pallet', 'units_per_pallet'),
                ('unit_height', 'pallet_height', 'pallet_footprint')
            ],
            'classes': ['collapse']
        }),
        ('Attachments', {
            'fields': ['attachment'],
            'classes': ['collapse']
        }),
        ('Status', {
            'fields': ['is_active']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]


class LWHBoxAdmin(CorrugatedItemAdmin):
    """Base admin for L×W×H box types (RSC, HSC, FOL, Tele)."""
    list_display = ['sku', 'name', 'length', 'width', 'height', 'test', 'flute', 'is_printed', 'is_active']

    fieldsets = [
        ('Identification', {
            'fields': ['sku', 'name', 'revision']
        }),
        ('Dimensions', {
            'fields': [('length', 'width', 'height')]
        }),
        ('Board Specifications', {
            'fields': [('test', 'flute', 'paper')]
        }),
        ('Printing', {
            'fields': ['is_printed', ('panels_printed', 'colors_printed'), 'ink_list'],
            'classes': ['collapse']
        }),
        ('Descriptions', {
            'fields': ['description', 'purch_desc', 'sell_desc'],
            'classes': ['collapse']
        }),
        ('Configuration', {
            'fields': ['base_uom', 'customer', 'is_inventory']
        }),
        ('Unitizing / Pallet', {
            'fields': [
                ('units_per_layer', 'layers_per_pallet', 'units_per_pallet'),
                ('unit_height', 'pallet_height', 'pallet_footprint')
            ],
            'classes': ['collapse']
        }),
        ('Attachments', {
            'fields': ['attachment'],
            'classes': ['collapse']
        }),
        ('Status', {
            'fields': ['is_active']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]


@admin.register(RSCItem)
class RSCItemAdmin(LWHBoxAdmin):
    """Admin for RSC items."""
    pass


@admin.register(HSCItem)
class HSCItemAdmin(LWHBoxAdmin):
    """Admin for HSC items."""
    pass


@admin.register(FOLItem)
class FOLItemAdmin(LWHBoxAdmin):
    """Admin for FOL items."""
    pass


@admin.register(TeleItem)
class TeleItemAdmin(LWHBoxAdmin):
    """Admin for Telescoping items."""
    pass


@admin.register(ItemFeature)
class ItemFeatureAdmin(admin.ModelAdmin):
    """Direct admin for ItemFeature through table."""
    list_display = ['corrugated_item', 'feature', 'details']
    list_filter = ['feature']
    search_fields = ['corrugated_item__sku', 'corrugated_item__name', 'details']
    raw_id_fields = ['corrugated_item', 'feature']

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)
