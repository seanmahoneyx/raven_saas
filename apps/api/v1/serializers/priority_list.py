# apps/api/v1/serializers/priority_list.py
"""
Serializers for Priority List feature.

Provides serializers for:
- PriorityLinePriority: Priority order for PO lines
- VendorKickAllotment: Default daily production limits
- DailyKickOverride: Per-day overrides
- Nested response structures for the grouped priority list view
"""
from rest_framework import serializers
from apps.scheduling.models import (
    PriorityLinePriority,
    VendorKickAllotment,
    DailyKickOverride,
    BOX_TYPE_CHOICES,
)
from .base import TenantModelSerializer


# =============================================================================
# MODEL SERIALIZERS
# =============================================================================

class PriorityLinePrioritySerializer(TenantModelSerializer):
    """Serializer for PriorityLinePriority model."""
    po_number = serializers.CharField(
        source='purchase_order_line.purchase_order.po_number',
        read_only=True
    )
    item_sku = serializers.CharField(
        source='purchase_order_line.item.sku',
        read_only=True
    )
    item_name = serializers.CharField(
        source='purchase_order_line.item.name',
        read_only=True
    )
    quantity_ordered = serializers.IntegerField(
        source='purchase_order_line.quantity_ordered',
        read_only=True
    )
    vendor_name = serializers.CharField(
        source='vendor.name',
        read_only=True
    )

    class Meta:
        model = PriorityLinePriority
        fields = [
            'id', 'purchase_order_line', 'vendor', 'vendor_name',
            'scheduled_date', 'box_type', 'sequence',
            'po_number', 'item_sku', 'item_name', 'quantity_ordered',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class VendorKickAllotmentSerializer(TenantModelSerializer):
    """Serializer for VendorKickAllotment model."""
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    box_type_display = serializers.CharField(
        source='get_box_type_display',
        read_only=True
    )

    class Meta:
        model = VendorKickAllotment
        fields = [
            'id', 'vendor', 'vendor_name', 'box_type', 'box_type_display',
            'daily_allotment', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class DailyKickOverrideSerializer(TenantModelSerializer):
    """Serializer for DailyKickOverride model."""
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    box_type_display = serializers.CharField(
        source='get_box_type_display',
        read_only=True
    )

    class Meta:
        model = DailyKickOverride
        fields = [
            'id', 'vendor', 'vendor_name', 'box_type', 'box_type_display',
            'date', 'allotment', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# NESTED RESPONSE SERIALIZERS (for grouped priority list view)
# =============================================================================

class PriorityLineSerializer(serializers.Serializer):
    """Serializer for a single priority line in the grouped view."""
    id = serializers.IntegerField()
    po_line_id = serializers.IntegerField()
    po_number = serializers.CharField()
    item_sku = serializers.CharField()
    item_name = serializers.CharField()
    quantity_ordered = serializers.IntegerField()
    sequence = serializers.IntegerField()
    customer_request_date = serializers.DateField(allow_null=True)


class BoxTypeBinSerializer(serializers.Serializer):
    """Serializer for a box type bin (lines grouped by box type)."""
    box_type = serializers.CharField()
    box_type_display = serializers.CharField()
    allotment = serializers.IntegerField()
    is_override = serializers.BooleanField()
    scheduled_qty = serializers.IntegerField()
    remaining_kicks = serializers.IntegerField()
    lines = PriorityLineSerializer(many=True)


class DateSectionSerializer(serializers.Serializer):
    """Serializer for a date section (box types grouped by date)."""
    date = serializers.DateField()
    box_types = BoxTypeBinSerializer(many=True)


class VendorGroupSerializer(serializers.Serializer):
    """Serializer for a vendor group (dates grouped by vendor)."""
    vendor_id = serializers.IntegerField()
    vendor_name = serializers.CharField()
    dates = DateSectionSerializer(many=True)


class PriorityListResponseSerializer(serializers.Serializer):
    """Top-level serializer for the priority list response."""
    vendors = VendorGroupSerializer(many=True)


# =============================================================================
# INPUT SERIALIZERS
# =============================================================================

class ReorderLinesSerializer(serializers.Serializer):
    """Serializer for reordering lines within a bin."""
    vendor_id = serializers.IntegerField()
    date = serializers.DateField()
    box_type = serializers.ChoiceField(choices=[c[0] for c in BOX_TYPE_CHOICES])
    line_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="Ordered list of PriorityLinePriority IDs (first = sequence 0)"
    )


class MoveLineSerializer(serializers.Serializer):
    """Serializer for moving a line to a different date."""
    line_id = serializers.IntegerField(
        help_text="PriorityLinePriority ID to move"
    )
    target_date = serializers.DateField(
        help_text="New scheduled date for the line"
    )
    insert_at_sequence = serializers.IntegerField(
        required=False,
        default=0,
        help_text="Sequence position to insert at (0 = top)"
    )


class VendorAllotmentCreateSerializer(serializers.Serializer):
    """Serializer for creating/updating vendor allotments."""
    vendor_id = serializers.IntegerField()
    box_type = serializers.ChoiceField(choices=[c[0] for c in BOX_TYPE_CHOICES])
    daily_allotment = serializers.IntegerField(min_value=0)


class DailyOverrideCreateSerializer(serializers.Serializer):
    """Serializer for creating daily overrides."""
    vendor_id = serializers.IntegerField()
    box_type = serializers.ChoiceField(choices=[c[0] for c in BOX_TYPE_CHOICES])
    date = serializers.DateField()
    allotment = serializers.IntegerField(min_value=0)


class ClearOverrideSerializer(serializers.Serializer):
    """Serializer for clearing a daily override."""
    vendor_id = serializers.IntegerField()
    box_type = serializers.ChoiceField(choices=[c[0] for c in BOX_TYPE_CHOICES])
    date = serializers.DateField()
