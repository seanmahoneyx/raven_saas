"""
Serializers for Design module: DesignRequest.
"""
from rest_framework import serializers
from apps.design.models import DesignRequest
from .base import TenantModelSerializer


class DesignRequestListSerializer(TenantModelSerializer):
    """Lightweight serializer for list views."""
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = DesignRequest
        fields = [
            'id', 'file_number', 'ident', 'style', 'status',
            'customer', 'customer_name',
            'assigned_to', 'assigned_to_name',
            'has_ard', 'has_pdf', 'has_eps', 'has_dxf', 'has_samples',
            'pallet_configuration', 'created_at',
        ]

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.username
        return None


class DesignRequestSerializer(TenantModelSerializer):
    """Full serializer for detail/read views."""
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, allow_null=True)
    requested_by_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    generated_item_sku = serializers.CharField(source='generated_item.sku', read_only=True, allow_null=True)

    class Meta:
        model = DesignRequest
        fields = [
            'id', 'file_number', 'ident', 'style', 'status',
            'customer', 'customer_name',
            'requested_by', 'requested_by_name',
            'assigned_to', 'assigned_to_name',
            'length', 'width', 'depth', 'test', 'flute', 'paper',
            'has_ard', 'has_pdf', 'has_eps', 'has_dxf', 'has_samples',
            'pallet_configuration', 'sample_quantity', 'notes',
            'generated_item', 'generated_item_sku',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['file_number', 'generated_item', 'created_at', 'updated_at']

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.username
        return None

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.username
        return None


class DesignRequestWriteSerializer(TenantModelSerializer):
    """Serializer for create/update."""
    class Meta:
        model = DesignRequest
        fields = [
            'ident', 'style', 'status', 'customer',
            'requested_by', 'assigned_to',
            'length', 'width', 'depth', 'test', 'flute', 'paper',
            'has_ard', 'has_pdf', 'has_eps', 'has_dxf', 'has_samples',
            'pallet_configuration', 'sample_quantity', 'notes',
        ]


class PromoteDesignSerializer(serializers.Serializer):
    """Serializer for promote-to-item action."""
    sku = serializers.CharField(max_length=100)
    base_uom = serializers.IntegerField(help_text="UnitOfMeasure ID")
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
