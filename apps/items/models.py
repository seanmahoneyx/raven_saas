# apps/items/models.py
"""
Item models for product catalog management.

Models:
- UnitOfMeasure: Units for measuring items (EACH, CASE, PALLET, ROLL)
- Item: Base product catalog - items that can be bought/sold
- ItemUOM: UOM conversions for items (e.g., 1 CASE = 12 EACH)
- ItemVendor: Vendor-specific item info (MPN, lead time)
- CorrugatedItem: Corrugated-specific attributes (extends Item)
- CorrugatedFeature: Master list of corrugated features
- ItemFeature: Through table for item-feature M2M
- DCItem, RSCItem, HSCItem, FOLItem, TeleItem: Box type subtypes

GL Integration:
- Items can have optional GL account overrides for income, expense, and asset accounts
- If not set, the system uses defaults from AccountingSettings
"""
from django.db import models
from shared.models import TenantMixin, TimestampMixin
from simple_history.models import HistoricalRecords


# =============================================================================
# CHOICES
# =============================================================================

DIVISION_TYPES = [
    ('corrugated', 'Corrugated'),
    ('packaging', 'Packaging'),
    ('tooling', 'Tooling'),
    ('janitorial', 'Janitorial'),
    ('misc', 'Miscellaneous'),
]

TEST_TYPES = [
    ('ect29', 'ECT 29'),
    ('ect32', 'ECT 32'),
    ('ect40', 'ECT 40'),
    ('ect44', 'ECT 44'),
    ('ect48', 'ECT 48'),
    ('ect51', 'ECT 51'),
    ('ect55', 'ECT 55'),
    ('ect112', 'ECT 112'),
    ('200t', '200T'),
]

FLUTE_TYPES = [
    ('a', 'A'),
    ('b', 'B'),
    ('c', 'C'),
    ('e', 'E'),
    ('f', 'F'),
    ('bc', 'BC DW'),
    ('eb', 'EB DW'),
    ('tw', 'TW'),
]

PAPER_TYPES = [
    ('k', 'Kraft'),
    ('mw', 'Mottled White'),
]


# =============================================================================
# UNIT OF MEASURE
# =============================================================================

class UnitOfMeasure(TenantMixin, TimestampMixin):
    """
    Units for measuring items.

    Standard UOMs:
    - EACH (ea) - Base unit
    - CASE (cs) - Carton/case
    - PALLET (plt) - Full pallet
    - ROLL (rl) - Roll (for fabric/paper)

    IMPORTANT: code is unique per tenant only, not globally.
    Multiple tenants can have "ea" as a code.
    """
    code = models.CharField(
        max_length=10,
        help_text="Short code (e.g., 'ea', 'cs', 'plt')"
    )
    name = models.CharField(
        max_length=50,
        help_text="Full name (e.g., 'Each', 'Case', 'Pallet')"
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional description"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive UOMs are hidden from selections"
    )

    class Meta:
        verbose_name = "Unit of Measure"
        verbose_name_plural = "Units of Measure"
        unique_together = [('tenant', 'code')]
        indexes = [
            models.Index(fields=['tenant', 'code']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


# =============================================================================
# BASE ITEM MODEL
# =============================================================================

class Item(TenantMixin, TimestampMixin):
    """
    Base product catalog - items that can be bought/sold.

    This is the base model for all items. Corrugated items extend this
    via multi-table inheritance (CorrugatedItem -> DCItem, RSCItem, etc.).

    Each item has a base UOM (typically EACH) and can have
    multiple UOM conversions via ItemUOM.
    """
    # Core identification
    sku = models.CharField(
        max_length=100,
        help_text="Stock Keeping Unit (unique per tenant)"
    )
    name = models.CharField(
        max_length=255,
        help_text="Item name"
    )
    division = models.CharField(
        max_length=20,
        choices=DIVISION_TYPES,
        default='misc',
        help_text="Business division"
    )
    revision = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Version/revision number"
    )

    # Descriptions
    description = models.TextField(
        blank=True,
        help_text="General description"
    )
    purch_desc = models.TextField(
        blank=True,
        help_text="Purchase description (shown on POs)"
    )
    sell_desc = models.TextField(
        blank=True,
        help_text="Sales description (shown on invoices)"
    )

    # UOM
    base_uom = models.ForeignKey(
        UnitOfMeasure,
        on_delete=models.PROTECT,
        related_name='items',
        help_text="Base unit of measure (typically EACH)"
    )

    # Hierarchy
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent item for hierarchy"
    )

    # Relationships
    customer = models.ForeignKey(
        'parties.Party',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='items',
        help_text="Optional customer for customer-specific items"
    )

    # Unitizing / Pallet configuration
    units_per_layer = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Units per pallet layer"
    )
    layers_per_pallet = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Layers per pallet"
    )
    units_per_pallet = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Total units per pallet"
    )
    unit_height = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Height of one unit (inches)"
    )
    pallet_height = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Total pallet height (inches)"
    )
    pallet_footprint = models.CharField(
        max_length=20,
        blank=True,
        help_text="Pallet size (e.g., '48x40')"
    )

    # Flags
    is_inventory = models.BooleanField(
        default=True,
        help_text="Is this a stocked/inventoried item?"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive items are hidden from selections"
    )

    # Inventory reorder thresholds
    reorder_point = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="When on_hand falls to this level, trigger reorder alert"
    )
    min_stock = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Minimum acceptable stock level"
    )
    safety_stock = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Safety stock buffer above min_stock"
    )

    # Attachments
    attachment = models.FileField(
        upload_to='items/attachments/',
        null=True,
        blank=True,
        help_text="File attachment (spec sheet, drawing, etc.)"
    )

    # GL Account Overrides (optional - uses AccountingSettings defaults if not set)
    income_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='items_income',
        help_text="Override income account for sales (uses default if blank)"
    )
    expense_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='items_expense',
        help_text="Override COGS account for purchases (uses default if blank)"
    )
    asset_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='items_asset',
        help_text="Override inventory asset account (uses default if blank)"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        unique_together = [('tenant', 'sku')]
        indexes = [
            models.Index(fields=['tenant', 'sku']),
            models.Index(fields=['tenant', 'name']),
            models.Index(fields=['tenant', 'division']),
            models.Index(fields=['tenant', 'is_active']),
            models.Index(fields=['tenant', 'customer']),
        ]

    def __str__(self):
        return f"{self.sku} - {self.name}"

    def get_uom_multiplier(self, uom):
        """
        Get the multiplier to convert from given UOM to base UOM (EACH).

        Args:
            uom: UnitOfMeasure instance

        Returns:
            int: Multiplier (e.g., 12 for CASE if 1 case = 12 each)
            Returns 1 if UOM is the base UOM or no conversion found.
        """
        if uom == self.base_uom:
            return 1
        try:
            item_uom = self.uom_conversions.get(uom=uom)
            return item_uom.multiplier_to_base
        except ItemUOM.DoesNotExist:
            return 1


# =============================================================================
# ITEM UOM CONVERSIONS
# =============================================================================

class ItemUOM(TenantMixin, TimestampMixin):
    """
    UOM conversions for items.

    Defines how many base units are in each alternate UOM.

    Examples:
    - Item: "Widget ABC", UOM: CASE, Multiplier: 12 (1 case = 12 each)
    - Item: "Widget ABC", UOM: PALLET, Multiplier: 480 (1 pallet = 480 each)
    """
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='uom_conversions',
        help_text="The item this conversion applies to"
    )
    uom = models.ForeignKey(
        UnitOfMeasure,
        on_delete=models.PROTECT,
        related_name='item_conversions',
        help_text="The alternate UOM"
    )
    multiplier_to_base = models.PositiveIntegerField(
        help_text="How many base units in this UOM (e.g., 12 for CASE)"
    )

    class Meta:
        verbose_name = "Item UOM Conversion"
        verbose_name_plural = "Item UOM Conversions"
        unique_together = [('tenant', 'item', 'uom')]
        indexes = [
            models.Index(fields=['tenant', 'item', 'uom']),
        ]

    def __str__(self):
        return f"{self.item.sku}: 1 {self.uom.code} = {self.multiplier_to_base} {self.item.base_uom.code}"

    def convert_to_base(self, quantity):
        """Convert quantity in this UOM to base UOM."""
        return quantity * self.multiplier_to_base

    def convert_from_base(self, quantity):
        """Convert quantity from base UOM to this UOM."""
        return quantity / self.multiplier_to_base


# =============================================================================
# ITEM VENDOR (MPN & VENDOR-SPECIFIC ATTRIBUTES)
# =============================================================================

class ItemVendor(TenantMixin, TimestampMixin):
    """
    Vendor-specific item information.

    Links an item to a vendor with vendor-specific attributes like
    manufacturer part number, lead time, and minimum order quantity.

    Note: Pricing is handled separately via CostListHead/Line in apps/costing.
    """
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='vendors',
        help_text="The item"
    )
    vendor = models.ForeignKey(
        'parties.Party',
        on_delete=models.PROTECT,
        related_name='supplied_items',
        help_text="The vendor who supplies this item"
    )
    mpn = models.CharField(
        max_length=100,
        blank=True,
        help_text="Manufacturer/Vendor part number"
    )
    lead_time_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Lead time in days"
    )
    min_order_qty = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Minimum order quantity"
    )
    is_preferred = models.BooleanField(
        default=False,
        help_text="Preferred vendor for this item"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive vendor links are hidden from selections"
    )

    class Meta:
        verbose_name = "Item Vendor"
        verbose_name_plural = "Item Vendors"
        unique_together = [('tenant', 'item', 'vendor')]
        indexes = [
            models.Index(fields=['tenant', 'item']),
            models.Index(fields=['tenant', 'vendor']),
            models.Index(fields=['tenant', 'is_preferred']),
        ]

    def __str__(self):
        return f"{self.item.sku} - {self.vendor.display_name}"


# =============================================================================
# CORRUGATED FEATURE SYSTEM
# =============================================================================

class CorrugatedFeature(TenantMixin, TimestampMixin):
    """
    Master list of corrugated box features.

    Features like handholes, perforations, extra scores, etc.
    Some features require additional details (e.g., "extra score 1.5 inches from top").
    """
    code = models.CharField(
        max_length=20,
        help_text="Short code (e.g., 'handhole', 'perf')"
    )
    name = models.CharField(
        max_length=100,
        help_text="Display name"
    )
    requires_details = models.BooleanField(
        default=False,
        help_text="If True, ItemFeature.details should be filled"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive features are hidden from selections"
    )

    class Meta:
        verbose_name = "Corrugated Feature"
        verbose_name_plural = "Corrugated Features"
        unique_together = [('tenant', 'code')]
        indexes = [
            models.Index(fields=['tenant', 'code']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class ItemFeature(TenantMixin):
    """
    Through table linking corrugated items to features.

    Allows storing additional details for features that require them
    (e.g., "extra score 1+1/2 inches from top").
    """
    corrugated_item = models.ForeignKey(
        'CorrugatedItem',
        on_delete=models.CASCADE,
        related_name='item_features',
        help_text="The corrugated item"
    )
    feature = models.ForeignKey(
        CorrugatedFeature,
        on_delete=models.PROTECT,
        related_name='item_features',
        help_text="The feature"
    )
    details = models.TextField(
        blank=True,
        help_text="Additional details (e.g., 'extra score 1+1/2 inches from top')"
    )

    class Meta:
        verbose_name = "Item Feature"
        verbose_name_plural = "Item Features"
        unique_together = [('tenant', 'corrugated_item', 'feature')]
        indexes = [
            models.Index(fields=['tenant', 'corrugated_item']),
        ]

    def __str__(self):
        return f"{self.corrugated_item.sku} - {self.feature.name}"


# =============================================================================
# CORRUGATED ITEM (EXTENDS ITEM)
# =============================================================================

class CorrugatedItem(Item):
    """
    Corrugated-specific item attributes.

    Extends Item with corrugated board specifications (test, flute, paper)
    and printing information. This is the base for all corrugated box types.

    Uses Django multi-table inheritance - creates a separate table
    with a OneToOne link to Item.
    """
    # Board specifications
    test = models.CharField(
        max_length=10,
        choices=TEST_TYPES,
        blank=True,
        help_text="ECT rating"
    )
    flute = models.CharField(
        max_length=5,
        choices=FLUTE_TYPES,
        blank=True,
        help_text="Flute type"
    )
    paper = models.CharField(
        max_length=5,
        choices=PAPER_TYPES,
        blank=True,
        help_text="Paper type"
    )

    # Printing
    is_printed = models.BooleanField(
        default=False,
        help_text="Is this item printed?"
    )
    panels_printed = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Number of panels printed"
    )
    colors_printed = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Number of colors"
    )
    ink_list = models.TextField(
        blank=True,
        help_text="List of ink colors used"
    )

    # Features (M2M through ItemFeature)
    features = models.ManyToManyField(
        CorrugatedFeature,
        through=ItemFeature,
        related_name='corrugated_items',
        blank=True,
        help_text="Special features (handholes, perfs, etc.)"
    )

    class Meta:
        verbose_name = "Corrugated Item"
        verbose_name_plural = "Corrugated Items"

    def save(self, *args, **kwargs):
        """Ensure division is set to corrugated."""
        self.division = 'corrugated'
        super().save(*args, **kwargs)


# =============================================================================
# BOX TYPE SUBTYPES (EXTEND CORRUGATED ITEM)
# =============================================================================

class DCItem(CorrugatedItem):
    """
    Die Cut box - L x W dimensions with blank size info.

    Die cut boxes are flat when shipped and have specific blank dimensions
    and rotary die output information.
    """
    length = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Length dimension (inches)"
    )
    width = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Width dimension (inches)"
    )
    blank_length = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Blank length (inches)"
    )
    blank_width = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Blank width (inches)"
    )
    out_per_rotary = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Number out per rotary die"
    )

    class Meta:
        verbose_name = "Die Cut Item"
        verbose_name_plural = "Die Cut Items"


class RSCItem(CorrugatedItem):
    """
    Regular Slotted Container - L x W x H dimensions.

    The most common box style with four flaps on top and bottom.
    """
    length = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Length dimension (inches)"
    )
    width = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Width dimension (inches)"
    )
    height = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Height dimension (inches)"
    )

    class Meta:
        verbose_name = "RSC Item"
        verbose_name_plural = "RSC Items"


class HSCItem(CorrugatedItem):
    """
    Half Slotted Container - L x W x H dimensions.

    Like an RSC but with flaps on only one end.
    """
    length = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Length dimension (inches)"
    )
    width = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Width dimension (inches)"
    )
    height = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Height dimension (inches)"
    )

    class Meta:
        verbose_name = "HSC Item"
        verbose_name_plural = "HSC Items"


class FOLItem(CorrugatedItem):
    """
    Full Overlap box - L x W x H dimensions.

    Box with flaps that completely overlap for extra strength.
    """
    length = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Length dimension (inches)"
    )
    width = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Width dimension (inches)"
    )
    height = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Height dimension (inches)"
    )

    class Meta:
        verbose_name = "FOL Item"
        verbose_name_plural = "FOL Items"


class TeleItem(CorrugatedItem):
    """
    Telescoping box - L x W x H dimensions.

    Two-piece box with a separate lid that telescopes over the bottom.
    """
    length = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Length dimension (inches)"
    )
    width = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Width dimension (inches)"
    )
    height = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Height dimension (inches)"
    )

    class Meta:
        verbose_name = "Telescoping Item"
        verbose_name_plural = "Telescoping Items"
