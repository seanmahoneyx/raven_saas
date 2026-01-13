# apps/api/v1/serializers/warehousing.py
"""
Serializers for Warehousing models: Warehouse, Bin.
"""
from rest_framework import serializers
from apps.warehousing.models import Warehouse, Bin
from .base import TenantModelSerializer


class BinSerializer(TenantModelSerializer):
    """Serializer for Bin model."""
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    full_location = serializers.CharField(read_only=True)

    class Meta:
        model = Bin
        fields = [
            'id', 'warehouse', 'warehouse_code', 'code',
            'aisle', 'rack', 'level', 'bin_type',
            'is_active', 'full_location',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class WarehouseListSerializer(TenantModelSerializer):
    """Lightweight serializer for Warehouse list views."""
    bin_count = serializers.SerializerMethodField()

    class Meta:
        model = Warehouse
        fields = [
            'id', 'code', 'name', 'is_active', 'is_default', 'bin_count',
        ]

    def get_bin_count(self, obj):
        return obj.bins.count()


class WarehouseSerializer(TenantModelSerializer):
    """Standard serializer for Warehouse model."""
    location_name = serializers.CharField(source='location.name', read_only=True, allow_null=True)

    class Meta:
        model = Warehouse
        fields = [
            'id', 'code', 'name', 'location', 'location_name',
            'is_active', 'is_default', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class WarehouseDetailSerializer(TenantModelSerializer):
    """Detailed serializer for Warehouse with nested bins."""
    location_name = serializers.CharField(source='location.name', read_only=True, allow_null=True)
    bins = BinSerializer(many=True, read_only=True)

    class Meta:
        model = Warehouse
        fields = [
            'id', 'code', 'name', 'location', 'location_name',
            'is_active', 'is_default', 'notes', 'bins',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
