# apps/inventory/admin.py
"""
Django admin configuration for Inventory models.
"""
from django.contrib import admin
from .models import InventoryLot, InventoryPallet, InventoryBalance, InventoryTransaction


class InventoryPalletInline(admin.TabularInline):
    """Inline editor for pallets within a lot."""
    model = InventoryPallet
    extra = 0
    fields = ['pallet_number', 'license_plate', 'quantity_received', 'quantity_on_hand', 'bin', 'status']
    readonly_fields = ['license_plate']


@admin.register(InventoryLot)
class InventoryLotAdmin(admin.ModelAdmin):
    """Admin interface for InventoryLot."""
    list_display = [
        'lot_number', 'item', 'warehouse', 'vendor',
        'received_date', 'total_quantity', 'unit_cost', 'total_value_display'
    ]
    list_filter = ['warehouse', 'received_date', 'vendor']
    search_fields = ['lot_number', 'item__sku', 'item__name', 'vendor__party__display_name']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['item', 'warehouse', 'vendor', 'purchase_order']
    date_hierarchy = 'received_date'

    fieldsets = [
        (None, {
            'fields': ['lot_number', 'item', 'warehouse']
        }),
        ('Source', {
            'fields': ['vendor', 'purchase_order', 'received_date']
        }),
        ('Quantity & Cost', {
            'fields': ['total_quantity', 'unit_cost']
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

    inlines = [InventoryPalletInline]

    def total_value_display(self, obj):
        return f"${obj.total_value:,.2f}"
    total_value_display.short_description = 'Total Value'

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


@admin.register(InventoryPallet)
class InventoryPalletAdmin(admin.ModelAdmin):
    """Admin interface for InventoryPallet."""
    list_display = [
        'license_plate', 'lot', 'pallet_number',
        'quantity_on_hand', 'quantity_received', 'bin', 'status'
    ]
    list_filter = ['status', 'lot__warehouse', 'bin']
    search_fields = ['license_plate', 'lot__lot_number', 'lot__item__sku']
    raw_id_fields = ['lot', 'bin']

    fieldsets = [
        (None, {
            'fields': ['lot', 'pallet_number', 'license_plate']
        }),
        ('Quantity', {
            'fields': ['quantity_received', 'quantity_on_hand']
        }),
        ('Location & Status', {
            'fields': ['bin', 'status']
        }),
    ]


@admin.register(InventoryBalance)
class InventoryBalanceAdmin(admin.ModelAdmin):
    """Admin interface for InventoryBalance."""
    list_display = [
        'item', 'warehouse', 'on_hand', 'allocated',
        'available_display', 'on_order', 'projected_display', 'last_updated'
    ]
    list_filter = ['warehouse']
    search_fields = ['item__sku', 'item__name', 'warehouse__name']
    raw_id_fields = ['item', 'warehouse']
    readonly_fields = ['last_updated']

    def available_display(self, obj):
        return obj.available
    available_display.short_description = 'Available'

    def projected_display(self, obj):
        return obj.projected
    projected_display.short_description = 'Projected'


@admin.register(InventoryTransaction)
class InventoryTransactionAdmin(admin.ModelAdmin):
    """Admin interface for InventoryTransaction (read-only audit log)."""
    list_display = [
        'transaction_date', 'transaction_type', 'item', 'warehouse',
        'quantity_display', 'reference_number', 'user'
    ]
    list_filter = ['transaction_type', 'warehouse', 'transaction_date']
    search_fields = [
        'item__sku', 'item__name', 'reference_number',
        'lot__lot_number', 'pallet__license_plate'
    ]
    raw_id_fields = ['item', 'warehouse', 'lot', 'pallet', 'user']
    date_hierarchy = 'transaction_date'
    readonly_fields = [
        'tenant', 'transaction_type', 'item', 'warehouse', 'lot', 'pallet',
        'quantity', 'transaction_date', 'reference_type', 'reference_id',
        'reference_number', 'user', 'notes', 'balance_on_hand', 'balance_allocated'
    ]

    def quantity_display(self, obj):
        sign = '+' if obj.quantity > 0 else ''
        return f"{sign}{obj.quantity}"
    quantity_display.short_description = 'Qty'

    def has_add_permission(self, request):
        return False  # Transactions created via service only

    def has_delete_permission(self, request, obj=None):
        return False  # Audit trail - no deletion
