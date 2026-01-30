# apps/contracts/admin.py
from django.contrib import admin
from .models import Contract, ContractLine, ContractRelease


class ContractLineInline(admin.TabularInline):
    model = ContractLine
    extra = 0
    fields = ['line_number', 'item', 'blanket_qty', 'uom', 'unit_price', 'notes']
    readonly_fields = []


class ContractReleaseInline(admin.TabularInline):
    model = ContractRelease
    extra = 0
    fields = ['sales_order_line', 'quantity_ordered', 'release_date', 'balance_before', 'balance_after']
    readonly_fields = ['balance_before', 'balance_after']


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = [
        'contract_number',
        'customer',
        'blanket_po',
        'status',
        'issue_date',
        'total_committed_qty',
        'total_released_qty',
        'completion_percentage',
    ]
    list_filter = ['status', 'issue_date']
    search_fields = ['contract_number', 'blanket_po', 'customer__party__display_name']
    readonly_fields = ['contract_number', 'created_at', 'updated_at']
    inlines = [ContractLineInline]
    fieldsets = (
        (None, {
            'fields': ('contract_number', 'customer', 'blanket_po', 'status')
        }),
        ('Dates', {
            'fields': ('issue_date', 'start_date', 'end_date')
        }),
        ('Shipping', {
            'fields': ('ship_to',)
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ContractLine)
class ContractLineAdmin(admin.ModelAdmin):
    list_display = [
        'contract',
        'line_number',
        'item',
        'blanket_qty',
        'released_qty',
        'remaining_qty',
        'is_fully_released',
    ]
    list_filter = ['contract__status']
    search_fields = ['contract__contract_number', 'item__sku', 'item__name']
    inlines = [ContractReleaseInline]


@admin.register(ContractRelease)
class ContractReleaseAdmin(admin.ModelAdmin):
    list_display = [
        'contract_line',
        'sales_order_line',
        'quantity_ordered',
        'release_date',
        'balance_before',
        'balance_after',
    ]
    list_filter = ['release_date']
    search_fields = [
        'contract_line__contract__contract_number',
        'sales_order_line__sales_order__order_number',
    ]
    readonly_fields = ['balance_before', 'balance_after']
