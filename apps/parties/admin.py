# apps/parties/admin.py
"""
Django admin configuration for Party models.

Provides inline editing for Customer, Vendor, and Location records
directly from the Party admin page.
"""
from django.contrib import admin
from .models import Party, Customer, Vendor, Location, Truck


class CustomerInline(admin.StackedInline):
    """Inline editor for Customer record on Party page."""
    model = Customer
    can_delete = True
    verbose_name = "Customer Details"
    verbose_name_plural = "Customer Details"
    fields = [
        'payment_terms', 'customer_type',
        ('default_ship_to', 'default_bill_to'),
        ('sales_rep', 'csr'),
        ('credit_limit', 'charge_freight'),
        'invoice_delivery_method',
        ('tax_code', 'resale_number'),
    ]
    extra = 0


class VendorInline(admin.StackedInline):
    """Inline editor for Vendor record on Party page."""
    model = Vendor
    can_delete = True
    verbose_name = "Vendor Details"
    verbose_name_plural = "Vendor Details"
    fields = [
        'payment_terms', 'vendor_type',
        'default_ship_from',
        'buyer',
        ('credit_limit', 'charge_freight'),
        'invoice_delivery_method',
        ('tax_code', 'tax_id'),
    ]
    extra = 0


class LocationInline(admin.TabularInline):
    """Inline editor for Location records on Party page."""
    model = Location
    can_delete = True
    extra = 1
    fields = [
        'name',
        'location_type',
        'address_line1',
        'city',
        'state',
        'postal_code',
        'is_default',
        'is_active',
    ]
    show_change_link = True


@admin.register(Party)
class PartyAdmin(admin.ModelAdmin):
    """Admin interface for Party model with inline Customer/Vendor/Location."""
    list_display = ['code', 'display_name', 'party_type', 'is_active', 'has_customer', 'has_vendor', 'created_at']
    list_filter = ['party_type', 'is_active', 'created_at']
    search_fields = ['code', 'display_name', 'legal_name']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['code', 'display_name', 'party_type']
        }),
        ('Contact', {
            'fields': ['main_phone', 'main_email'],
        }),
        ('Additional Info', {
            'fields': ['legal_name', 'notes', 'is_active'],
            'classes': ['collapse']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    inlines = [CustomerInline, VendorInline, LocationInline]

    def has_customer(self, obj):
        """Show checkmark if party has customer record."""
        return obj.is_customer
    has_customer.boolean = True
    has_customer.short_description = 'Customer?'

    def has_vendor(self, obj):
        """Show checkmark if party has vendor record."""
        return obj.is_vendor
    has_vendor.boolean = True
    has_vendor.short_description = 'Vendor?'

    def save_formset(self, request, form, formset, change):
        """Ensure tenant is set on inline objects."""
        instances = formset.save(commit=False)
        for instance in instances:
            if hasattr(instance, 'tenant_id') and not instance.tenant_id:
                instance.tenant = form.instance.tenant
            instance.save()
        formset.save_m2m()

    def save_model(self, request, obj, form, change):
        """Set tenant from current request if not set."""
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    """Direct admin interface for Customer model."""
    list_display = ['party', 'customer_type', 'payment_terms', 'sales_rep', 'csr', 'charge_freight', 'created_at']
    list_filter = ['customer_type', 'payment_terms', 'charge_freight', 'sales_rep', 'created_at']
    search_fields = ['party__code', 'party__display_name']
    raw_id_fields = ['party', 'default_ship_to', 'default_bill_to', 'sales_rep', 'csr']

    fieldsets = [
        (None, {
            'fields': ['party', 'customer_type']
        }),
        ('Defaults', {
            'fields': ['payment_terms', 'default_ship_to', 'default_bill_to',
                        ('sales_rep', 'csr'), 'invoice_delivery_method']
        }),
        ('Financial', {
            'fields': [('credit_limit', 'charge_freight'), ('tax_code', 'resale_number')]
        }),
    ]


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    """Direct admin interface for Vendor model."""
    list_display = ['party', 'vendor_type', 'payment_terms', 'buyer', 'charge_freight', 'created_at']
    list_filter = ['vendor_type', 'payment_terms', 'charge_freight', 'buyer', 'created_at']
    search_fields = ['party__code', 'party__display_name']
    raw_id_fields = ['party', 'default_ship_from', 'buyer']

    fieldsets = [
        (None, {
            'fields': ['party', 'vendor_type']
        }),
        ('Defaults', {
            'fields': ['payment_terms', 'default_ship_from', 'buyer', 'invoice_delivery_method']
        }),
        ('Financial', {
            'fields': [('credit_limit', 'charge_freight'), ('tax_code', 'tax_id')]
        }),
    ]


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    """Direct admin interface for Location model."""
    list_display = ['party', 'name', 'location_type', 'city', 'state', 'is_default', 'is_active']
    list_filter = ['location_type', 'state', 'is_default', 'is_active']
    search_fields = ['party__code', 'party__display_name', 'name', 'city']
    raw_id_fields = ['party']

    fieldsets = [
        (None, {
            'fields': ['party', 'name', 'code', 'location_type']
        }),
        ('Address', {
            'fields': ['address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country']
        }),
        ('Contact', {
            'fields': ['phone', 'email']
        }),
        ('Operations', {
            'fields': ['loading_dock_hours', 'special_instructions'],
            'classes': ['collapse']
        }),
        ('Status', {
            'fields': ['is_default', 'is_active']
        }),
    ]


@admin.register(Truck)
class TruckAdmin(admin.ModelAdmin):
    """Admin interface for Truck model."""
    list_display = ['name', 'license_plate', 'capacity_pallets', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'license_plate']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['name', 'license_plate', 'capacity_pallets']
        }),
        ('Status', {
            'fields': ['is_active', 'notes']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    def save_model(self, request, obj, form, change):
        """Set tenant from current request if not set."""
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)
