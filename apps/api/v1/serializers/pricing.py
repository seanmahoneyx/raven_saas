# apps/api/v1/serializers/pricing.py
"""
Serializers for Pricing models: PriceListHead, PriceListLine.
"""
from rest_framework import serializers
from apps.pricing.models import PriceListHead, PriceListLine
from .base import TenantModelSerializer


class PriceListLineSerializer(TenantModelSerializer):
    """Serializer for PriceListLine model."""

    class Meta:
        model = PriceListLine
        fields = ['id', 'price_list', 'min_quantity', 'unit_price']


class PriceListHeadListSerializer(TenantModelSerializer):
    """Lightweight serializer for PriceListHead list views."""
    customer_code = serializers.CharField(source='customer.party.code', read_only=True)
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = PriceListHead
        fields = [
            'id', 'customer', 'customer_code', 'customer_name',
            'item', 'item_sku', 'item_name',
            'begin_date', 'end_date', 'is_active',
        ]


class PriceListHeadSerializer(TenantModelSerializer):
    """Standard serializer for PriceListHead model."""
    customer_code = serializers.CharField(source='customer.party.code', read_only=True)
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = PriceListHead
        fields = [
            'id', 'customer', 'customer_code', 'customer_name',
            'item', 'item_sku', 'item_name',
            'begin_date', 'end_date', 'is_active', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PriceListHeadDetailSerializer(TenantModelSerializer):
    """Detailed serializer for PriceListHead with nested lines."""
    customer_code = serializers.CharField(source='customer.party.code', read_only=True)
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    lines = PriceListLineSerializer(many=True, read_only=True)

    class Meta:
        model = PriceListHead
        fields = [
            'id', 'customer', 'customer_code', 'customer_name',
            'item', 'item_sku', 'item_name',
            'begin_date', 'end_date', 'is_active', 'notes', 'lines',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PriceListHeadWriteSerializer(TenantModelSerializer):
    """Serializer for creating/updating PriceListHead with nested lines."""
    lines = PriceListLineSerializer(many=True, required=False)

    class Meta:
        model = PriceListHead
        fields = [
            'id', 'customer', 'item', 'begin_date', 'end_date',
            'is_active', 'notes', 'lines',
        ]

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        price_list = super().create(validated_data)

        for line_data in lines_data:
            PriceListLine.objects.create(
                price_list=price_list,
                tenant=price_list.tenant,
                **line_data
            )
        return price_list

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)

        if lines_data is not None:
            instance.lines.all().delete()
            for line_data in lines_data:
                PriceListLine.objects.create(
                    price_list=instance,
                    tenant=instance.tenant,
                    **line_data
                )
        return instance
