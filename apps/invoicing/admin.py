# apps/invoicing/admin.py
"""
Django admin configuration for Invoice models.
"""
from django.contrib import admin
from .models import Invoice, InvoiceLine, Payment


class InvoiceLineInline(admin.TabularInline):
    """Inline editor for invoice lines."""
    model = InvoiceLine
    extra = 0
    fields = ['line_number', 'item', 'description', 'quantity', 'uom', 'unit_price', 'discount_percent', 'line_total']
    readonly_fields = ['line_total']
    raw_id_fields = ['item', 'uom', 'sales_order_line']


class PaymentInline(admin.TabularInline):
    """Inline editor for payments."""
    model = Payment
    extra = 0
    fields = ['payment_date', 'amount', 'payment_method', 'reference_number']
    readonly_fields = ['created_at']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    """Admin interface for Invoice."""
    list_display = [
        'invoice_number', 'customer', 'invoice_date', 'due_date',
        'status', 'total_amount', 'amount_paid', 'balance_due_display'
    ]
    list_filter = ['status', 'payment_terms', 'invoice_date']
    search_fields = ['invoice_number', 'customer__party__display_name', 'customer_po']
    raw_id_fields = ['customer', 'sales_order', 'shipment']
    date_hierarchy = 'invoice_date'
    readonly_fields = ['created_at', 'updated_at', 'balance_due_display']

    fieldsets = [
        (None, {
            'fields': ['invoice_number', 'customer', 'status']
        }),
        ('Source', {
            'fields': ['sales_order', 'shipment', 'customer_po'],
            'classes': ['collapse']
        }),
        ('Dates & Terms', {
            'fields': ['invoice_date', 'due_date', 'payment_terms']
        }),
        ('Bill To', {
            'fields': ['bill_to_name', 'bill_to_address']
        }),
        ('Ship To', {
            'fields': ['ship_to_name', 'ship_to_address'],
            'classes': ['collapse']
        }),
        ('Totals', {
            'fields': [
                'subtotal', 'tax_rate', 'tax_amount',
                'freight_amount', 'discount_amount',
                'total_amount', 'amount_paid', 'balance_due_display'
            ]
        }),
        ('Notes', {
            'fields': ['notes', 'customer_notes'],
            'classes': ['collapse']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    inlines = [InvoiceLineInline, PaymentInline]

    def balance_due_display(self, obj):
        return f"${obj.balance_due:,.2f}"
    balance_due_display.short_description = 'Balance Due'

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for instance in instances:
            if hasattr(instance, 'tenant_id') and not instance.tenant_id:
                instance.tenant = form.instance.tenant
            if hasattr(instance, 'recorded_by') and not instance.recorded_by_id:
                instance.recorded_by = request.user
            instance.save()
        formset.save_m2m()


@admin.register(InvoiceLine)
class InvoiceLineAdmin(admin.ModelAdmin):
    """Admin interface for InvoiceLine."""
    list_display = [
        'invoice', 'line_number', 'item', 'description',
        'quantity', 'uom', 'unit_price', 'line_total'
    ]
    list_filter = ['invoice__status']
    search_fields = ['invoice__invoice_number', 'item__sku', 'description']
    raw_id_fields = ['invoice', 'item', 'uom', 'sales_order_line']


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """Admin interface for Payment."""
    list_display = [
        'invoice', 'payment_date', 'amount', 'payment_method',
        'reference_number', 'recorded_by'
    ]
    list_filter = ['payment_method', 'payment_date']
    search_fields = ['invoice__invoice_number', 'reference_number']
    raw_id_fields = ['invoice', 'recorded_by']
    date_hierarchy = 'payment_date'
    readonly_fields = ['created_at', 'updated_at']

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        if not obj.recorded_by_id:
            obj.recorded_by = request.user
        super().save_model(request, obj, form, change)
