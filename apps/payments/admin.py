# apps/payments/admin.py
from django.contrib import admin
from .models import CustomerPayment, PaymentApplication


class PaymentApplicationInline(admin.TabularInline):
    model = PaymentApplication
    extra = 0
    fields = ['invoice', 'amount_applied']
    readonly_fields = ['invoice']


@admin.register(CustomerPayment)
class CustomerPaymentAdmin(admin.ModelAdmin):
    list_display = ['payment_number', 'customer', 'amount', 'status', 'payment_date']
    list_filter = ['status', 'payment_method', 'payment_date']
    search_fields = ['payment_number', 'reference_number', 'customer__party__display_name']
    readonly_fields = ['payment_number', 'journal_entry', 'created_at', 'updated_at']
    inlines = [PaymentApplicationInline]
    fieldsets = (
        ('Payment Information', {
            'fields': ('payment_number', 'customer', 'payment_date', 'amount', 'payment_method', 'reference_number')
        }),
        ('Application', {
            'fields': ('status', 'unapplied_amount', 'deposit_account', 'journal_entry')
        }),
        ('Notes', {
            'fields': ('notes', 'recorded_by')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(PaymentApplication)
class PaymentApplicationAdmin(admin.ModelAdmin):
    list_display = ['payment', 'invoice', 'amount_applied']
    list_filter = ['payment__status']
    search_fields = ['payment__payment_number', 'invoice__invoice_number']
