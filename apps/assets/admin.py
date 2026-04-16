# apps/assets/admin.py
from django.contrib import admin
from .models import AssetCategory, FixedAsset, DepreciationEntry, AssetTransaction


class DepreciationEntryInline(admin.TabularInline):
    model = DepreciationEntry
    extra = 0
    readonly_fields = ['period_date', 'amount', 'accumulated_after', 'net_book_value_after', 'journal_entry']


class AssetTransactionInline(admin.TabularInline):
    model = AssetTransaction
    extra = 0
    fields = ['transaction_type', 'transaction_date', 'amount', 'description', 'performed_by']
    readonly_fields = ['created_at']


@admin.register(AssetCategory)
class AssetCategoryAdmin(admin.ModelAdmin):
    list_display = [
        'code', 'name', 'asset_account', 'depreciation_expense_account',
        'accumulated_depreciation_account', 'default_useful_life_months',
        'default_depreciation_method',
    ]
    list_filter = ['default_depreciation_method']
    search_fields = ['code', 'name']
    ordering = ['code']


@admin.register(FixedAsset)
class FixedAssetAdmin(admin.ModelAdmin):
    list_display = [
        'asset_number', 'description', 'category', 'status',
        'acquisition_date', 'acquisition_cost', 'accumulated_depreciation',
        'net_book_value', 'location',
    ]
    list_filter = ['status', 'category', 'depreciation_method']
    search_fields = ['asset_number', 'description', 'serial_number', 'location']
    readonly_fields = ['accumulated_depreciation', 'created_at', 'updated_at']
    inlines = [DepreciationEntryInline, AssetTransactionInline]
    fieldsets = (
        (None, {
            'fields': ('asset_number', 'description', 'category', 'status')
        }),
        ('Physical Details', {
            'fields': ('serial_number', 'location', 'custodian')
        }),
        ('Acquisition', {
            'fields': (
                'acquisition_date', 'acquisition_cost', 'vendor',
                'purchase_order', 'invoice_reference',
            )
        }),
        ('Depreciation', {
            'fields': (
                'depreciation_method', 'useful_life_months', 'salvage_value',
                'depreciation_start_date', 'accumulated_depreciation',
            )
        }),
        ('GL Account Overrides', {
            'fields': (
                'asset_account', 'depreciation_expense_account',
                'accumulated_depreciation_account',
            ),
            'classes': ('collapse',),
        }),
        ('Disposal', {
            'fields': (
                'disposal_date', 'disposal_amount', 'disposal_method',
                'disposal_notes',
            ),
            'classes': ('collapse',),
        }),
        ('Notes', {
            'fields': ('notes',),
        }),
    )


@admin.register(DepreciationEntry)
class DepreciationEntryAdmin(admin.ModelAdmin):
    list_display = [
        'asset', 'period_date', 'amount', 'accumulated_after',
        'net_book_value_after', 'journal_entry',
    ]
    list_filter = ['period_date']
    search_fields = ['asset__asset_number', 'asset__description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(AssetTransaction)
class AssetTransactionAdmin(admin.ModelAdmin):
    list_display = [
        'asset', 'transaction_type', 'transaction_date',
        'amount', 'performed_by',
    ]
    list_filter = ['transaction_type', 'transaction_date']
    search_fields = ['asset__asset_number', 'description']
    readonly_fields = ['created_at', 'updated_at']
