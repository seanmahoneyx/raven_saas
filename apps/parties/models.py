# apps/parties/models.py
"""
Party models for managing business entities (customers, vendors).

Party Pattern Implementation:
- Party: Universal entity representing any business
- Customer: Customer-specific attributes (OneToOne with Party)
- Vendor: Vendor-specific attributes (OneToOne with Party)
- Location: Physical addresses for parties

A single Party can have BOTH Customer and Vendor records (e.g., a company
that you both buy from and sell to).

GL Integration:
- Customers can have override receivable accounts
- Vendors can have override payable accounts
- If not set, the system uses defaults from AccountingSettings
"""
from django.db import models
from django.conf import settings
from shared.models import TenantMixin, TimestampMixin


class Party(TenantMixin, TimestampMixin):
    """
    Universal party model - any business entity.

    A Party represents any company or organization that you do business with.
    The party_type field indicates the primary relationship, but a Party
    can have both Customer AND Vendor records attached via OneToOne.
    """
    PARTY_TYPES = [
        ('CUSTOMER', 'Customer'),
        ('VENDOR', 'Vendor'),
        ('BOTH', 'Customer & Vendor'),
        ('OTHER', 'Other'),
    ]

    party_type = models.CharField(
        max_length=10,
        choices=PARTY_TYPES,
        default='CUSTOMER',
        help_text="Primary relationship type"
    )
    code = models.CharField(
        max_length=50,
        help_text="Internal abbreviation/code (unique per tenant)"
    )
    display_name = models.CharField(
        max_length=255,
        help_text="Primary display name"
    )
    legal_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Official legal name"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive parties are hidden from selections"
    )
    notes = models.TextField(
        blank=True,
        help_text="General notes about this party"
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent party for hierarchy"
    )

    class Meta:
        verbose_name_plural = "parties"
        unique_together = [('tenant', 'code')]
        indexes = [
            models.Index(fields=['tenant', 'display_name']),
            models.Index(fields=['tenant', 'code']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.display_name}"

    @property
    def is_customer(self):
        """Returns True if this party has a Customer record."""
        return hasattr(self, 'customer')

    @property
    def is_vendor(self):
        """Returns True if this party has a Vendor record."""
        return hasattr(self, 'vendor')


class Customer(TenantMixin, TimestampMixin):
    """
    Customer-specific attributes (OneToOne with Party).

    Every Customer MUST have a Party record. The Party holds common
    fields (name, code), while Customer holds customer-specific data
    (payment terms, credit limit, sales rep).
    """
    party = models.OneToOneField(
        Party,
        on_delete=models.CASCADE,
        related_name='customer',
        help_text="The party this customer record belongs to"
    )
    payment_terms = models.CharField(
        max_length=50,
        default='NET30',
        help_text="Default payment terms (e.g., NET30, NET60, COD)"
    )
    default_ship_to = models.ForeignKey(
        'Location',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customers_ship_to',
        help_text="Default shipping address"
    )
    default_bill_to = models.ForeignKey(
        'Location',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customers_bill_to',
        help_text="Default billing address"
    )
    sales_rep = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customers',
        help_text="Account manager / sales representative"
    )

    # GL Account Override (optional - uses AccountingSettings default if not set)
    receivable_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customers_receivable',
        help_text="Override A/R account for this customer (uses default if blank)"
    )

    # Default Tax Zone (fallback when no zip-code match)
    default_tax_zone = models.ForeignKey(
        'invoicing.TaxZone',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customers',
        help_text="Default tax zone for this customer (used when ship-to zip has no rule)"
    )

    credit_limit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Credit limit for this customer (approval triggered when exceeded)"
    )

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'party']),
            models.Index(fields=['sales_rep']),
        ]

    def __str__(self):
        return f"Customer: {self.party.display_name}"


class Vendor(TenantMixin, TimestampMixin):
    """
    Vendor-specific attributes (OneToOne with Party).

    Every Vendor MUST have a Party record. The Party holds common
    fields, while Vendor holds vendor-specific data (payment terms,
    lead times, buyer assignment).
    """
    party = models.OneToOneField(
        Party,
        on_delete=models.CASCADE,
        related_name='vendor',
        help_text="The party this vendor record belongs to"
    )
    payment_terms = models.CharField(
        max_length=50,
        default='NET30',
        help_text="Payment terms for orders from this vendor"
    )
    default_ship_from = models.ForeignKey(
        'Location',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendors_ship_from',
        help_text="Vendor's primary shipping location"
    )
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_vendors',
        help_text="Purchasing agent / buyer responsible for this vendor"
    )

    # GL Account Override (optional - uses AccountingSettings default if not set)
    payable_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendors_payable',
        help_text="Override A/P account for this vendor (uses default if blank)"
    )

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'party']),
            models.Index(fields=['buyer']),
        ]

    def __str__(self):
        return f"Vendor: {self.party.display_name}"


class Location(TenantMixin, TimestampMixin):
    """
    Physical location for a Party.

    A Party can have multiple locations of different types:
    - SHIP_TO: Customer delivery addresses
    - BILL_TO: Billing addresses
    - WAREHOUSE: Vendor's warehouse locations
    - OFFICE: Office locations
    """
    LOCATION_TYPES = [
        ('SHIP_TO', 'Ship To'),
        ('BILL_TO', 'Bill To'),
        ('WAREHOUSE', 'Warehouse'),
        ('OFFICE', 'Office'),
    ]

    party = models.ForeignKey(
        Party,
        on_delete=models.CASCADE,
        related_name='locations',
        help_text="The party this location belongs to"
    )
    location_type = models.CharField(
        max_length=20,
        choices=LOCATION_TYPES,
        default='SHIP_TO',
        help_text="Type of location"
    )
    name = models.CharField(
        max_length=255,
        help_text="Location name (e.g., 'Main Warehouse', 'NY Office')"
    )
    code = models.CharField(
        max_length=50,
        blank=True,
        help_text="Optional location code"
    )
    address_line1 = models.CharField(
        max_length=255,
        help_text="Street address line 1"
    )
    address_line2 = models.CharField(
        max_length=255,
        blank=True,
        help_text="Street address line 2"
    )
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=50)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=100, default='USA')
    phone = models.CharField(
        max_length=20,
        blank=True,
        help_text="Location contact phone"
    )
    email = models.EmailField(
        blank=True,
        help_text="Location contact email"
    )
    loading_dock_hours = models.CharField(
        max_length=100,
        blank=True,
        help_text="e.g., 'M-F 8am-5pm'"
    )
    special_instructions = models.TextField(
        blank=True,
        help_text="Delivery instructions, dock info, etc."
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Default location for this party"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive locations are hidden from selections"
    )

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'party', 'is_active']),
            models.Index(fields=['location_type']),
        ]

    def __str__(self):
        return f"{self.party.code} - {self.name} ({self.get_location_type_display()})"

    @property
    def full_address(self):
        """Returns formatted full address."""
        parts = [self.address_line1]
        if self.address_line2:
            parts.append(self.address_line2)
        parts.append(f"{self.city}, {self.state} {self.postal_code}")
        if self.country != 'USA':
            parts.append(self.country)
        return '\n'.join(parts)


class Truck(TenantMixin, TimestampMixin):
    """
    Scheduling resource - truck/vehicle for deliveries and receiving.

    Used by the Schedulizer calendar to assign orders to trucks.
    Each order can be scheduled to a specific truck for a specific date.
    """
    name = models.CharField(
        max_length=100,
        help_text="Truck name (e.g., 'Truck 1', 'Semi-Trailer A')"
    )
    license_plate = models.CharField(
        max_length=20,
        blank=True,
        help_text="Vehicle license plate number"
    )
    capacity_pallets = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum pallet capacity"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive trucks are hidden from scheduling"
    )
    notes = models.TextField(
        blank=True,
        help_text="Notes about this truck"
    )

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'name']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return self.name
