# apps/orders/admin.py
"""
Django admin configuration for Order models.
"""
from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin
from .models import PurchaseOrder, PurchaseOrderLine, SalesOrder, SalesOrderLine


class PurchaseOrderLineInline(admin.TabularInline):
    """Inline editor for PurchaseOrderLine."""
    model = PurchaseOrderLine
    extra = 1
    fields = ['line_number', 'item', 'quantity_ordered', 'uom', 'unit_cost', 'notes']
    raw_id_fields = ['item', 'uom']


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(SimpleHistoryAdmin):
    """Admin interface for PurchaseOrder with history tracking."""
    list_display = [
        'po_number', 'vendor', 'order_date', 'status',
        'scheduled_date', 'scheduled_truck', 'num_lines_display', 'subtotal_display'
    ]
    list_filter = ['status', 'scheduled_date', 'scheduled_truck', 'order_date']
    search_fields = ['po_number', 'vendor__party__display_name', 'vendor__party__code']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['vendor', 'ship_to', 'scheduled_truck']
    date_hierarchy = 'order_date'

    fieldsets = [
        (None, {
            'fields': ['po_number', 'vendor', 'order_date', 'expected_date']
        }),
        ('Shipping', {
            'fields': ['ship_to']
        }),
        ('Scheduling', {
            'fields': ['status', 'scheduled_date', 'scheduled_truck', 'priority']
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

    inlines = [PurchaseOrderLineInline]

    def num_lines_display(self, obj):
        return obj.num_lines
    num_lines_display.short_description = 'Lines'

    def subtotal_display(self, obj):
        return f"${obj.subtotal:,.2f}"
    subtotal_display.short_description = 'Subtotal'

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


class SalesOrderLineInline(admin.TabularInline):
    """Inline editor for SalesOrderLine."""
    model = SalesOrderLine
    extra = 1
    fields = ['line_number', 'item', 'quantity_ordered', 'uom', 'unit_price', 'notes']
    raw_id_fields = ['item', 'uom']


@admin.register(SalesOrder)
class SalesOrderAdmin(SimpleHistoryAdmin):
    """Admin interface for SalesOrder with history tracking."""
    list_display = [
        'order_number', 'customer', 'order_date', 'status',
        'scheduled_date', 'scheduled_truck', 'num_lines_display', 'subtotal_display'
    ]
    list_filter = ['status', 'scheduled_date', 'scheduled_truck', 'order_date']
    search_fields = ['order_number', 'customer__party__display_name', 'customer__party__code', 'customer_po']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['customer', 'ship_to', 'bill_to', 'scheduled_truck']
    date_hierarchy = 'order_date'

    fieldsets = [
        (None, {
            'fields': ['order_number', 'customer', 'order_date', 'customer_po']
        }),
        ('Shipping', {
            'fields': ['ship_to', 'bill_to']
        }),
        ('Scheduling', {
            'fields': ['status', 'scheduled_date', 'scheduled_truck', 'priority']
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

    inlines = [SalesOrderLineInline]

    def num_lines_display(self, obj):
        return obj.num_lines
    num_lines_display.short_description = 'Lines'

    def subtotal_display(self, obj):
        return f"${obj.subtotal:,.2f}"
    subtotal_display.short_description = 'Subtotal'

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


@admin.register(PurchaseOrderLine)
class PurchaseOrderLineAdmin(admin.ModelAdmin):
    """Direct admin for PurchaseOrderLine."""
    list_display = ['purchase_order', 'line_number', 'item', 'quantity_ordered', 'uom', 'unit_cost', 'line_total_display']
    list_filter = ['purchase_order__status', 'created_at']
    search_fields = ['purchase_order__po_number', 'item__sku', 'item__name']
    raw_id_fields = ['purchase_order', 'item', 'uom']

    def line_total_display(self, obj):
        return f"${obj.line_total:,.2f}"
    line_total_display.short_description = 'Line Total'


@admin.register(SalesOrderLine)
class SalesOrderLineAdmin(admin.ModelAdmin):
    """Direct admin for SalesOrderLine."""
    list_display = ['sales_order', 'line_number', 'item', 'quantity_ordered', 'uom', 'unit_price', 'line_total_display']
    list_filter = ['sales_order__status', 'created_at']
    search_fields = ['sales_order__order_number', 'item__sku', 'item__name']
    raw_id_fields = ['sales_order', 'item', 'uom']

    def line_total_display(self, obj):
        return f"${obj.line_total:,.2f}"
    line_total_display.short_description = 'Line Total'
