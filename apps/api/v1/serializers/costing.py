# apps/api/v1/serializers/costing.py
"""
Serializers for Costing models: CostListHead, CostListLine.
"""
from rest_framework import serializers
from apps.costing.models import CostListHead, CostListLine
from .base import TenantModelSerializer


class CostListLineSerializer(TenantModelSerializer):
    """Serializer for CostListLine model."""

    class Meta:
        model = CostListLine
        fields = ['id', 'cost_list', 'min_quantity', 'unit_cost']


class CostListHeadListSerializer(TenantModelSerializer):
    """Lightweight serializer for CostListHead list views."""
    vendor_code = serializers.CharField(source='vendor.party.code', read_only=True)
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = CostListHead
        fields = [
            'id', 'vendor', 'vendor_code', 'vendor_name',
            'item', 'item_sku', 'item_name',
            'begin_date', 'end_date', 'is_active',
        ]


class CostListHeadSerializer(TenantModelSerializer):
    """Standard serializer for CostListHead model."""
    vendor_code = serializers.CharField(source='vendor.party.code', read_only=True)
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = CostListHead
        fields = [
            'id', 'vendor', 'vendor_code', 'vendor_name',
            'item', 'item_sku', 'item_name',
            'begin_date', 'end_date', 'is_active', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class CostListHeadDetailSerializer(TenantModelSerializer):
    """Detailed serializer for CostListHead with nested lines."""
    vendor_code = serializers.CharField(source='vendor.party.code', read_only=True)
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    lines = CostListLineSerializer(many=True, read_only=True)

    class Meta:
        model = CostListHead
        fields = [
            'id', 'vendor', 'vendor_code', 'vendor_name',
            'item', 'item_sku', 'item_name',
            'begin_date', 'end_date', 'is_active', 'notes', 'lines',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class CostListHeadWriteSerializer(TenantModelSerializer):
    """Serializer for creating/updating CostListHead with nested lines."""
    lines = CostListLineSerializer(many=True, required=False)

    class Meta:
        model = CostListHead
        fields = [
            'id', 'vendor', 'item', 'begin_date', 'end_date',
            'is_active', 'notes', 'lines',
        ]

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        cost_list = super().create(validated_data)

        for line_data in lines_data:
            CostListLine.objects.create(
                cost_list=cost_list,
                tenant=cost_list.tenant,
                **line_data
            )
        return cost_list

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)

        if lines_data is not None:
            instance.lines.all().delete()
            for line_data in lines_data:
                CostListLine.objects.create(
                    cost_list=instance,
                    tenant=instance.tenant,
                    **line_data
                )
        return instance
