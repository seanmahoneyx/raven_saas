# apps/api/v1/serializers/contracts.py
"""
Serializers for Contract models: Contract, ContractLine, ContractRelease.
"""
from rest_framework import serializers
from apps.contracts.models import Contract, ContractLine, ContractRelease
from .base import TenantModelSerializer


# ==================== Contract Release Serializers ====================

class ContractReleaseSerializer(TenantModelSerializer):
    """Serializer for ContractRelease model."""
    sales_order_number = serializers.CharField(
        source='sales_order_line.sales_order.order_number', read_only=True
    )
    sales_order_id = serializers.IntegerField(
        source='sales_order_line.sales_order.id', read_only=True
    )
    sales_order_status = serializers.CharField(
        source='sales_order_line.sales_order.status', read_only=True
    )

    class Meta:
        model = ContractRelease
        fields = [
            'id', 'contract_line', 'sales_order_line', 'sales_order_number',
            'sales_order_id', 'sales_order_status', 'quantity_ordered',
            'release_date', 'balance_before', 'balance_after', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['balance_before', 'balance_after', 'created_at', 'updated_at']


# ==================== Contract Line Serializers ====================

class ContractLineSerializer(TenantModelSerializer):
    """Serializer for ContractLine model."""
    contract = serializers.PrimaryKeyRelatedField(read_only=True)
    line_number = serializers.IntegerField(required=False, allow_null=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)
    released_qty = serializers.IntegerField(read_only=True)
    remaining_qty = serializers.IntegerField(read_only=True)
    is_fully_released = serializers.BooleanField(read_only=True)

    class Meta:
        model = ContractLine
        fields = [
            'id', 'contract', 'line_number', 'item', 'item_sku', 'item_name',
            'blanket_qty', 'uom', 'uom_code', 'unit_price', 'notes',
            'released_qty', 'remaining_qty', 'is_fully_released',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ContractLineDetailSerializer(ContractLineSerializer):
    """Contract line with nested releases."""
    releases = ContractReleaseSerializer(many=True, read_only=True)

    class Meta(ContractLineSerializer.Meta):
        fields = ContractLineSerializer.Meta.fields + ['releases']


class ContractLineWriteSerializer(TenantModelSerializer):
    """Serializer for writing ContractLine (used in nested writes)."""
    line_number = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = ContractLine
        fields = [
            'id', 'line_number', 'item', 'blanket_qty', 'uom', 'unit_price', 'notes',
        ]


# ==================== Contract Serializers ====================

class ContractListSerializer(TenantModelSerializer):
    """Lightweight serializer for Contract list views."""
    customer_code = serializers.CharField(source='customer.party.code', read_only=True)
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    num_lines = serializers.IntegerField(read_only=True)
    total_committed_qty = serializers.IntegerField(read_only=True)
    total_released_qty = serializers.IntegerField(read_only=True)
    completion_percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = Contract
        fields = [
            'id', 'contract_number', 'blanket_po', 'status',
            'customer', 'customer_code', 'customer_name',
            'issue_date', 'start_date', 'end_date',
            'num_lines', 'total_committed_qty', 'total_released_qty',
            'completion_percentage',
        ]


class ContractSerializer(TenantModelSerializer):
    """Standard serializer for Contract model."""
    customer_code = serializers.CharField(source='customer.party.code', read_only=True)
    customer_name = serializers.CharField(source='customer.party.display_name', read_only=True)
    ship_to_name = serializers.CharField(source='ship_to.name', read_only=True, allow_null=True)
    is_active = serializers.BooleanField(read_only=True)
    total_committed_qty = serializers.IntegerField(read_only=True)
    total_released_qty = serializers.IntegerField(read_only=True)
    total_remaining_qty = serializers.IntegerField(read_only=True)
    completion_percentage = serializers.FloatField(read_only=True)
    num_lines = serializers.IntegerField(read_only=True)

    class Meta:
        model = Contract
        fields = [
            'id', 'contract_number', 'blanket_po', 'status',
            'customer', 'customer_code', 'customer_name',
            'issue_date', 'start_date', 'end_date',
            'ship_to', 'ship_to_name', 'notes', 'is_active',
            'total_committed_qty', 'total_released_qty',
            'total_remaining_qty', 'completion_percentage', 'num_lines',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['contract_number', 'created_at', 'updated_at']


class ContractDetailSerializer(ContractSerializer):
    """Detailed serializer with nested lines."""
    lines = ContractLineDetailSerializer(many=True, read_only=True)

    class Meta(ContractSerializer.Meta):
        fields = ContractSerializer.Meta.fields + ['lines']


class ContractWriteSerializer(TenantModelSerializer):
    """Serializer for creating/updating Contract with nested lines."""
    lines = ContractLineWriteSerializer(many=True, required=False)

    class Meta:
        model = Contract
        fields = [
            'id', 'blanket_po', 'status', 'customer',
            'issue_date', 'start_date', 'end_date', 'ship_to', 'notes', 'lines',
        ]

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        contract = super().create(validated_data)

        for idx, line_data in enumerate(lines_data):
            if 'line_number' not in line_data or not line_data.get('line_number'):
                line_data['line_number'] = (idx + 1) * 10
            ContractLine.objects.create(
                contract=contract,
                tenant=contract.tenant,
                **line_data
            )
        return contract

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)

        if lines_data is not None:
            # Check if any lines have releases
            lines_with_releases = instance.lines.filter(releases__isnull=False).distinct()
            if lines_with_releases.exists():
                raise serializers.ValidationError({
                    'lines': 'Cannot replace lines when releases exist. Edit individual lines instead.'
                })

            # Replace all lines
            instance.lines.all().delete()
            for idx, line_data in enumerate(lines_data):
                if 'line_number' not in line_data or not line_data.get('line_number'):
                    line_data['line_number'] = (idx + 1) * 10
                ContractLine.objects.create(
                    contract=instance,
                    tenant=instance.tenant,
                    **line_data
                )
        return instance


# ==================== Release Creation Serializers ====================

class CreateReleaseSerializer(serializers.Serializer):
    """Serializer for creating a release from a contract line."""
    contract_line_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)
    ship_to_id = serializers.IntegerField(required=False, allow_null=True)
    scheduled_date = serializers.DateField(required=False, allow_null=True)
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=4, required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')
