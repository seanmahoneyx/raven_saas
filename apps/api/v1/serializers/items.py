# apps/api/v1/serializers/items.py
"""
Serializers for Item-related models.

Models:
- UnitOfMeasure
- Item (base)
- ItemUOM (UOM conversions)
- ItemVendor (vendor links with MPN)
- CorrugatedFeature (feature master list)
- ItemFeature (item-feature M2M through)
- CorrugatedItem, DCItem, RSCItem, HSCItem, FOLItem, TeleItem
"""
from rest_framework import serializers
from apps.items.models import (
    UnitOfMeasure, Item, ItemUOM, ItemVendor,
    CorrugatedFeature, CorrugatedItem, ItemFeature,
    DCItem, RSCItem, HSCItem, FOLItem, TeleItem,
    PackagingItem,
    DIVISION_TYPES, TEST_TYPES, FLUTE_TYPES, PAPER_TYPES, ITEM_TYPE_CHOICES,
    PACKAGING_SUB_TYPES, THICKNESS_UNIT_CHOICES, BUBBLE_SIZE_CHOICES,
    LIP_STYLE_CHOICES, ADHESIVE_TYPE_CHOICES, TAPE_TYPE_CHOICES, LABEL_TYPE_CHOICES,
    LIFECYCLE_STATUS_CHOICES,
)
from .base import TenantModelSerializer


# =============================================================================
# UNIT OF MEASURE
# =============================================================================

class UnitOfMeasureSerializer(TenantModelSerializer):
    """Serializer for UnitOfMeasure model."""

    class Meta:
        model = UnitOfMeasure
        fields = [
            'id', 'code', 'name', 'description', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


# =============================================================================
# ITEM UOM CONVERSIONS
# =============================================================================

class ItemUOMSerializer(TenantModelSerializer):
    """Serializer for ItemUOM (UOM conversions)."""
    uom_code = serializers.CharField(source='uom.code', read_only=True)
    uom_name = serializers.CharField(source='uom.name', read_only=True)

    class Meta:
        model = ItemUOM
        fields = [
            'id', 'item', 'uom', 'uom_code', 'uom_name',
            'multiplier_to_base', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


# =============================================================================
# ITEM VENDOR
# =============================================================================

class ItemVendorSerializer(TenantModelSerializer):
    """Serializer for ItemVendor relationships."""
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    vendor_name = serializers.CharField(source='vendor.display_name', read_only=True)

    class Meta:
        model = ItemVendor
        fields = [
            'id', 'item', 'vendor', 'vendor_code', 'vendor_name',
            'mpn', 'lead_time_days', 'min_order_qty',
            'is_preferred', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ItemVendorCreateSerializer(TenantModelSerializer):
    """Serializer for creating ItemVendor (without requiring item in body)."""
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    vendor_name = serializers.CharField(source='vendor.display_name', read_only=True)

    class Meta:
        model = ItemVendor
        fields = [
            'id', 'vendor', 'vendor_code', 'vendor_name',
            'mpn', 'lead_time_days', 'min_order_qty',
            'is_preferred', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


# =============================================================================
# CORRUGATED FEATURES
# =============================================================================

class CorrugatedFeatureSerializer(TenantModelSerializer):
    """Serializer for CorrugatedFeature master list."""

    class Meta:
        model = CorrugatedFeature
        fields = [
            'id', 'code', 'name', 'requires_details', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ItemFeatureSerializer(TenantModelSerializer):
    """Serializer for ItemFeature through table."""
    feature_code = serializers.CharField(source='feature.code', read_only=True)
    feature_name = serializers.CharField(source='feature.name', read_only=True)
    requires_details = serializers.BooleanField(source='feature.requires_details', read_only=True)

    class Meta:
        model = ItemFeature
        fields = [
            'id', 'corrugated_item', 'feature',
            'feature_code', 'feature_name', 'requires_details',
            'details',
        ]


class ItemFeatureWriteSerializer(TenantModelSerializer):
    """Serializer for writing ItemFeature (nested in corrugated item)."""

    class Meta:
        model = ItemFeature
        fields = ['feature', 'details']


# =============================================================================
# BASE ITEM
# =============================================================================

class ItemListSerializer(TenantModelSerializer):
    """Lightweight serializer for Item list views."""
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    customer_code = serializers.CharField(source='customer.code', read_only=True, allow_null=True)
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)
    parent_sku = serializers.CharField(source='parent.sku', read_only=True, allow_null=True)
    box_type = serializers.SerializerMethodField()

    # Annotated fields from queryset
    qty_on_hand = serializers.IntegerField(read_only=True, default=0)
    qty_on_open_po = serializers.IntegerField(read_only=True, default=0)
    qty_on_open_so = serializers.IntegerField(read_only=True, default=0)
    preferred_vendor_name = serializers.CharField(read_only=True, default=None, allow_null=True)
    income_account_name = serializers.CharField(source='income_account.name', read_only=True, allow_null=True)
    expense_account_name = serializers.CharField(source='expense_account.name', read_only=True, allow_null=True)
    asset_account_name = serializers.CharField(source='asset_account.name', read_only=True, allow_null=True)
    attachment_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'name', 'division', 'description',
            'base_uom', 'base_uom_code',
            'customer', 'customer_code', 'customer_name',
            'parent', 'parent_sku',
            'item_type', 'is_active',
            'lifecycle_status', 'revision',
            'box_type',
            'qty_on_hand', 'qty_on_open_po', 'qty_on_open_so',
            'preferred_vendor_name',
            'income_account_name', 'expense_account_name', 'asset_account_name',
            'attachment_count',
        ]

    def get_box_type(self, obj):
        """Return the specific box type (dc, rsc, hsc, fol, tele, corrugated, packaging, base)."""
        # Box types are children of CorrugatedItem, not Item directly
        # Check if this is a corrugated item first
        if hasattr(obj, 'corrugateditem'):
            corrugated = obj.corrugateditem
            # Check for most specific box types
            if hasattr(corrugated, 'dcitem'):
                return 'dc'
            if hasattr(corrugated, 'rscitem'):
                return 'rsc'
            if hasattr(corrugated, 'hscitem'):
                return 'hsc'
            if hasattr(corrugated, 'folitem'):
                return 'fol'
            if hasattr(corrugated, 'teleitem'):
                return 'tele'
            return 'corrugated'
        if hasattr(obj, 'packagingitem'):
            return 'packaging'
        return 'base'


class ItemSerializer(TenantModelSerializer):
    """Standard serializer for Item model."""
    sku = serializers.CharField(required=False, allow_blank=True)
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    base_uom_name = serializers.CharField(source='base_uom.name', read_only=True)
    customer_code = serializers.CharField(source='customer.code', read_only=True, allow_null=True)
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)
    parent_sku = serializers.CharField(source='parent.sku', read_only=True, allow_null=True)
    revision_changed_by_name = serializers.CharField(
        source='revision_changed_by.get_full_name', read_only=True, allow_null=True
    )

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'name', 'division', 'revision',
            'description', 'purch_desc', 'sell_desc',
            'base_uom', 'base_uom_code', 'base_uom_name',
            'customer', 'customer_code', 'customer_name',
            'parent', 'parent_sku',
            'units_per_layer', 'layers_per_pallet', 'units_per_pallet',
            'unit_height', 'pallet_height', 'pallet_footprint',
            'item_type', 'is_active', 'attachment',
            'lifecycle_status', 'revision_reason', 'revision_date',
            'revision_changed_by', 'revision_changed_by_name',
            'product_card_notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'revision_date', 'revision_changed_by', 'revision_changed_by_name']


class ItemDetailSerializer(TenantModelSerializer):
    """Detailed serializer for Item with nested UOM conversions and vendors."""
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    base_uom_name = serializers.CharField(source='base_uom.name', read_only=True)
    customer_code = serializers.CharField(source='customer.code', read_only=True, allow_null=True)
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)
    parent_sku = serializers.CharField(source='parent.sku', read_only=True, allow_null=True)
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)
    vendors = ItemVendorSerializer(many=True, read_only=True)
    box_type = serializers.SerializerMethodField()
    revision_changed_by_name = serializers.CharField(
        source='revision_changed_by.get_full_name', read_only=True, allow_null=True
    )

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'name', 'division', 'revision',
            'description', 'purch_desc', 'sell_desc',
            'base_uom', 'base_uom_code', 'base_uom_name',
            'customer', 'customer_code', 'customer_name',
            'parent', 'parent_sku',
            'units_per_layer', 'layers_per_pallet', 'units_per_pallet',
            'unit_height', 'pallet_height', 'pallet_footprint',
            'item_type', 'is_active', 'attachment',
            'lifecycle_status', 'revision_reason', 'revision_date',
            'revision_changed_by', 'revision_changed_by_name',
            'product_card_notes',
            'uom_conversions', 'vendors',
            'box_type',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_box_type(self, obj):
        """Return the specific box type (dc, rsc, hsc, fol, tele, corrugated, packaging, base)."""
        if hasattr(obj, 'corrugateditem'):
            corrugated = obj.corrugateditem
            if hasattr(corrugated, 'dcitem'):
                return 'dc'
            if hasattr(corrugated, 'rscitem'):
                return 'rsc'
            if hasattr(corrugated, 'hscitem'):
                return 'hsc'
            if hasattr(corrugated, 'folitem'):
                return 'fol'
            if hasattr(corrugated, 'teleitem'):
                return 'tele'
            return 'corrugated'
        if hasattr(obj, 'packagingitem'):
            return 'packaging'
        return 'base'


# =============================================================================
# CORRUGATED ITEM
# =============================================================================

class CorrugatedItemListSerializer(TenantModelSerializer):
    """Lightweight serializer for CorrugatedItem list views."""
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    customer_code = serializers.CharField(source='customer.code', read_only=True, allow_null=True)
    box_type = serializers.SerializerMethodField()

    class Meta:
        model = CorrugatedItem
        fields = [
            'id', 'sku', 'name', 'division',
            'test', 'flute', 'paper', 'is_printed',
            'base_uom', 'base_uom_code',
            'customer', 'customer_code',
            'item_type', 'is_active',
            'box_type',
        ]

    def get_box_type(self, obj):
        """Return the specific corrugated box type."""
        if hasattr(obj, 'dcitem'):
            return 'dc'
        if hasattr(obj, 'rscitem'):
            return 'rsc'
        if hasattr(obj, 'hscitem'):
            return 'hsc'
        if hasattr(obj, 'folitem'):
            return 'fol'
        if hasattr(obj, 'teleitem'):
            return 'tele'
        return 'corrugated'


class CorrugatedItemSerializer(TenantModelSerializer):
    """Standard serializer for CorrugatedItem."""
    sku = serializers.CharField(required=False, allow_blank=True)
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    base_uom_name = serializers.CharField(source='base_uom.name', read_only=True)
    customer_code = serializers.CharField(source='customer.code', read_only=True, allow_null=True)
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)
    item_features = ItemFeatureSerializer(many=True, read_only=True)

    class Meta:
        model = CorrugatedItem
        fields = [
            'id', 'sku', 'name', 'division', 'revision',
            'description', 'purch_desc', 'sell_desc',
            'base_uom', 'base_uom_code', 'base_uom_name',
            'customer', 'customer_code', 'customer_name',
            # Corrugated-specific
            'test', 'flute', 'paper',
            'is_printed', 'panels_printed', 'colors_printed', 'ink_list',
            'item_features',
            # Unitizing
            'units_per_layer', 'layers_per_pallet', 'units_per_pallet',
            'unit_height', 'pallet_height', 'pallet_footprint',
            'item_type', 'is_active', 'attachment',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'division']


class CorrugatedItemDetailSerializer(CorrugatedItemSerializer):
    """Detailed serializer for CorrugatedItem with nested relationships."""
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)
    vendors = ItemVendorSerializer(many=True, read_only=True)

    class Meta(CorrugatedItemSerializer.Meta):
        fields = CorrugatedItemSerializer.Meta.fields + ['uom_conversions', 'vendors']


# =============================================================================
# BOX TYPE SERIALIZERS
# =============================================================================

class DCItemSerializer(TenantModelSerializer):
    """Serializer for Die Cut items."""
    sku = serializers.CharField(required=False, allow_blank=True)
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    base_uom_name = serializers.CharField(source='base_uom.name', read_only=True)
    customer_code = serializers.CharField(source='customer.code', read_only=True, allow_null=True)
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)
    item_features = ItemFeatureSerializer(many=True, read_only=True)

    class Meta:
        model = DCItem
        fields = [
            'id', 'sku', 'name', 'division', 'revision',
            'description', 'purch_desc', 'sell_desc',
            'base_uom', 'base_uom_code', 'base_uom_name',
            'customer', 'customer_code', 'customer_name',
            # Corrugated-specific
            'test', 'flute', 'paper',
            'is_printed', 'panels_printed', 'colors_printed', 'ink_list',
            'item_features',
            # DC-specific dimensions
            'length', 'width', 'blank_length', 'blank_width', 'out_per_rotary',
            # Unitizing
            'units_per_layer', 'layers_per_pallet', 'units_per_pallet',
            'unit_height', 'pallet_height', 'pallet_footprint',
            'item_type', 'is_active', 'attachment',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'division']


class DCItemDetailSerializer(DCItemSerializer):
    """Detailed serializer for DC items with nested relationships."""
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)
    vendors = ItemVendorSerializer(many=True, read_only=True)

    class Meta(DCItemSerializer.Meta):
        fields = DCItemSerializer.Meta.fields + ['uom_conversions', 'vendors']


class LWHBoxSerializer(TenantModelSerializer):
    """Base serializer for L×W×H box types (RSC, HSC, FOL, Tele)."""
    sku = serializers.CharField(required=False, allow_blank=True)
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    base_uom_name = serializers.CharField(source='base_uom.name', read_only=True)
    customer_code = serializers.CharField(source='customer.code', read_only=True, allow_null=True)
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)
    item_features = ItemFeatureSerializer(many=True, read_only=True)

    base_fields = [
        'id', 'sku', 'name', 'division', 'revision',
        'description', 'purch_desc', 'sell_desc',
        'base_uom', 'base_uom_code', 'base_uom_name',
        'customer', 'customer_code', 'customer_name',
        # Corrugated-specific
        'test', 'flute', 'paper',
        'is_printed', 'panels_printed', 'colors_printed', 'ink_list',
        'item_features',
        # L×W×H dimensions
        'length', 'width', 'height',
        # Unitizing
        'units_per_layer', 'layers_per_pallet', 'units_per_pallet',
        'unit_height', 'pallet_height', 'pallet_footprint',
        'item_type', 'is_active', 'attachment',
        'created_at', 'updated_at',
    ]


class RSCItemSerializer(LWHBoxSerializer):
    """Serializer for RSC items."""

    class Meta:
        model = RSCItem
        fields = LWHBoxSerializer.base_fields
        read_only_fields = ['created_at', 'updated_at', 'division']


class RSCItemDetailSerializer(RSCItemSerializer):
    """Detailed serializer for RSC items."""
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)
    vendors = ItemVendorSerializer(many=True, read_only=True)

    class Meta(RSCItemSerializer.Meta):
        fields = RSCItemSerializer.Meta.fields + ['uom_conversions', 'vendors']


class HSCItemSerializer(LWHBoxSerializer):
    """Serializer for HSC items."""

    class Meta:
        model = HSCItem
        fields = LWHBoxSerializer.base_fields
        read_only_fields = ['created_at', 'updated_at', 'division']


class HSCItemDetailSerializer(HSCItemSerializer):
    """Detailed serializer for HSC items."""
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)
    vendors = ItemVendorSerializer(many=True, read_only=True)

    class Meta(HSCItemSerializer.Meta):
        fields = HSCItemSerializer.Meta.fields + ['uom_conversions', 'vendors']


class FOLItemSerializer(LWHBoxSerializer):
    """Serializer for FOL items."""

    class Meta:
        model = FOLItem
        fields = LWHBoxSerializer.base_fields
        read_only_fields = ['created_at', 'updated_at', 'division']


class FOLItemDetailSerializer(FOLItemSerializer):
    """Detailed serializer for FOL items."""
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)
    vendors = ItemVendorSerializer(many=True, read_only=True)

    class Meta(FOLItemSerializer.Meta):
        fields = FOLItemSerializer.Meta.fields + ['uom_conversions', 'vendors']


class TeleItemSerializer(LWHBoxSerializer):
    """Serializer for Telescoping items."""

    class Meta:
        model = TeleItem
        fields = LWHBoxSerializer.base_fields
        read_only_fields = ['created_at', 'updated_at', 'division']


class TeleItemDetailSerializer(TeleItemSerializer):
    """Detailed serializer for Tele items."""
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)
    vendors = ItemVendorSerializer(many=True, read_only=True)

    class Meta(TeleItemSerializer.Meta):
        fields = TeleItemSerializer.Meta.fields + ['uom_conversions', 'vendors']


# =============================================================================
# PACKAGING ITEM
# =============================================================================

class PackagingItemSerializer(TenantModelSerializer):
    """Serializer for PackagingItem."""
    sku = serializers.CharField(required=False, allow_blank=True)
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    base_uom_name = serializers.CharField(source='base_uom.name', read_only=True)
    customer_code = serializers.CharField(source='customer.code', read_only=True, allow_null=True)
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)

    class Meta:
        model = PackagingItem
        fields = [
            'id', 'sku', 'name', 'division', 'revision',
            'description', 'purch_desc', 'sell_desc',
            'base_uom', 'base_uom_code', 'base_uom_name',
            'customer', 'customer_code', 'customer_name',
            # Packaging-specific
            'sub_type',
            # Shared fields
            'material_type', 'color',
            'thickness', 'thickness_unit',
            'length', 'width', 'height', 'diameter',
            'pieces_per_case', 'weight_capacity_lbs',
            # Roll fields
            'roll_length', 'roll_width', 'rolls_per_case', 'core_diameter',
            # Sheet fields
            'sheets_per_bundle',
            # Sub-type specific
            'bubble_size', 'perforated', 'perforation_interval',
            'lip_style', 'density', 'cells_x', 'cells_y',
            'adhesive_type', 'tape_type', 'break_strength_lbs',
            'stretch_pct', 'inner_diameter', 'lid_included',
            'label_type', 'labels_per_roll',
            # Unitizing
            'units_per_layer', 'layers_per_pallet', 'units_per_pallet',
            'unit_height', 'pallet_height', 'pallet_footprint',
            'item_type', 'is_active', 'attachment',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'division']


class PackagingItemDetailSerializer(PackagingItemSerializer):
    """Detailed serializer for PackagingItem with nested relationships."""
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)
    vendors = ItemVendorSerializer(many=True, read_only=True)

    class Meta(PackagingItemSerializer.Meta):
        fields = PackagingItemSerializer.Meta.fields + ['uom_conversions', 'vendors']
