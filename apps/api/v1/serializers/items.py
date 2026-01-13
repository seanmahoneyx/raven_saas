# apps/api/v1/serializers/items.py
"""
Serializers for Item-related models: UnitOfMeasure, Item, ItemUOM.
"""
from rest_framework import serializers
from apps.items.models import UnitOfMeasure, Item, ItemUOM
from .base import TenantModelSerializer


class UnitOfMeasureSerializer(TenantModelSerializer):
    """Serializer for UnitOfMeasure model."""

    class Meta:
        model = UnitOfMeasure
        fields = [
            'id', 'code', 'name', 'description', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


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


class ItemListSerializer(TenantModelSerializer):
    """Lightweight serializer for Item list views."""
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'name', 'base_uom', 'base_uom_code',
            'is_inventory', 'is_active',
        ]


class ItemSerializer(TenantModelSerializer):
    """Standard serializer for Item model."""
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    base_uom_name = serializers.CharField(source='base_uom.name', read_only=True)

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'name', 'description',
            'base_uom', 'base_uom_code', 'base_uom_name',
            'is_inventory', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ItemDetailSerializer(TenantModelSerializer):
    """Detailed serializer for Item with nested UOM conversions."""
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    base_uom_name = serializers.CharField(source='base_uom.name', read_only=True)
    uom_conversions = ItemUOMSerializer(many=True, read_only=True)

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'name', 'description',
            'base_uom', 'base_uom_code', 'base_uom_name',
            'is_inventory', 'is_active', 'uom_conversions',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
