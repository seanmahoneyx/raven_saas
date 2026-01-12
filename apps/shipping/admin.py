# apps/shipping/admin.py
"""
Django admin configuration for Shipping models.
"""
from django.contrib import admin
from .models import Shipment, ShipmentLine, BillOfLading, BOLLine


class ShipmentLineInline(admin.TabularInline):
    """Inline editor for shipment lines."""
    model = ShipmentLine
    extra = 0
    fields = ['sales_order', 'delivery_sequence', 'delivery_status', 'delivered_at', 'signature_name']
    raw_id_fields = ['sales_order']


class BOLLineInline(admin.TabularInline):
    """Inline editor for BOL lines."""
    model = BOLLine
    extra = 0
    fields = ['line_number', 'item', 'description', 'quantity', 'uom', 'num_packages', 'weight']
    raw_id_fields = ['item', 'uom']


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    """Admin interface for Shipment."""
    list_display = [
        'shipment_number', 'ship_date', 'truck', 'driver_name',
        'status', 'total_orders_display', 'created_at'
    ]
    list_filter = ['status', 'ship_date', 'truck']
    search_fields = ['shipment_number', 'driver_name']
    raw_id_fields = ['truck']
    date_hierarchy = 'ship_date'
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['shipment_number', 'ship_date', 'status']
        }),
        ('Truck & Driver', {
            'fields': ['truck', 'driver_name']
        }),
        ('Timing', {
            'fields': ['departure_time', 'arrival_time'],
            'classes': ['collapse']
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

    inlines = [ShipmentLineInline]

    def total_orders_display(self, obj):
        return obj.total_orders
    total_orders_display.short_description = 'Orders'

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


@admin.register(ShipmentLine)
class ShipmentLineAdmin(admin.ModelAdmin):
    """Admin interface for ShipmentLine."""
    list_display = [
        'shipment', 'sales_order', 'delivery_sequence',
        'delivery_status', 'delivered_at'
    ]
    list_filter = ['delivery_status', 'shipment__ship_date']
    search_fields = ['shipment__shipment_number', 'sales_order__order_number']
    raw_id_fields = ['shipment', 'sales_order']


@admin.register(BillOfLading)
class BillOfLadingAdmin(admin.ModelAdmin):
    """Admin interface for BillOfLading."""
    list_display = [
        'bol_number', 'shipment', 'status', 'issue_date',
        'total_pieces', 'total_weight', 'weight_uom'
    ]
    list_filter = ['status', 'issue_date']
    search_fields = ['bol_number', 'shipment__shipment_number', 'carrier_name']
    raw_id_fields = ['shipment']
    date_hierarchy = 'issue_date'
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['bol_number', 'shipment', 'status', 'issue_date']
        }),
        ('Carrier Information', {
            'fields': ['carrier_name', 'carrier_scac', 'trailer_number', 'seal_number']
        }),
        ('Shipper Information', {
            'fields': ['shipper_name', 'shipper_address']
        }),
        ('Signatures', {
            'fields': [
                'shipper_signature', 'shipper_signed_date',
                'carrier_signature', 'carrier_signed_date',
                'consignee_signature', 'consignee_signed_date'
            ],
            'classes': ['collapse']
        }),
        ('Totals', {
            'fields': ['total_pieces', 'total_weight', 'weight_uom']
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

    inlines = [BOLLineInline]

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


@admin.register(BOLLine)
class BOLLineAdmin(admin.ModelAdmin):
    """Admin interface for BOLLine."""
    list_display = [
        'bol', 'line_number', 'item', 'description',
        'quantity', 'uom', 'num_packages', 'weight'
    ]
    list_filter = ['bol__status']
    search_fields = ['bol__bol_number', 'item__sku', 'description']
    raw_id_fields = ['bol', 'item', 'uom']
