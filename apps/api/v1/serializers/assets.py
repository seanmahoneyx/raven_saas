# apps/api/v1/serializers/assets.py
"""
Serializers for Fixed Asset Register models.
"""
from rest_framework import serializers
from apps.assets.models import AssetCategory, FixedAsset, DepreciationEntry, AssetTransaction
from .base import TenantModelSerializer


class AssetCategorySerializer(TenantModelSerializer):
    """Full serializer for AssetCategory."""
    asset_account_name = serializers.CharField(source='asset_account.name', read_only=True)
    depreciation_expense_account_name = serializers.CharField(
        source='depreciation_expense_account.name', read_only=True
    )
    accumulated_depreciation_account_name = serializers.CharField(
        source='accumulated_depreciation_account.name', read_only=True
    )

    class Meta:
        model = AssetCategory
        fields = [
            'id', 'code', 'name',
            'asset_account', 'asset_account_name',
            'depreciation_expense_account', 'depreciation_expense_account_name',
            'accumulated_depreciation_account', 'accumulated_depreciation_account_name',
            'default_useful_life_months', 'default_depreciation_method',
            'default_salvage_rate',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class DepreciationEntrySerializer(TenantModelSerializer):
    """Serializer for DepreciationEntry."""
    asset_number = serializers.CharField(source='asset.asset_number', read_only=True)

    class Meta:
        model = DepreciationEntry
        fields = [
            'id', 'asset', 'asset_number', 'period_date', 'amount',
            'accumulated_after', 'net_book_value_after', 'journal_entry',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class AssetTransactionSerializer(TenantModelSerializer):
    """Serializer for AssetTransaction."""
    asset_number = serializers.CharField(source='asset.asset_number', read_only=True)
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AssetTransaction
        fields = [
            'id', 'asset', 'asset_number', 'transaction_type', 'transaction_date',
            'amount', 'description', 'from_location', 'to_location',
            'journal_entry', 'performed_by', 'performed_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return obj.performed_by.get_full_name() or obj.performed_by.username
        return None


class FixedAssetListSerializer(TenantModelSerializer):
    """Lightweight serializer for FixedAsset list views."""
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = FixedAsset
        fields = [
            'id', 'asset_number', 'description',
            'category', 'category_name', 'status',
            'acquisition_date', 'acquisition_cost',
            'net_book_value', 'accumulated_depreciation',
            'location',
        ]
        read_only_fields = ['accumulated_depreciation']


class FixedAssetDetailSerializer(TenantModelSerializer):
    """Full serializer for FixedAsset detail views."""
    category_name = serializers.CharField(source='category.name', read_only=True)
    vendor_name = serializers.CharField(source='vendor.party.display_name', read_only=True, allow_null=True)
    custodian_name = serializers.SerializerMethodField()
    depreciation_entries = DepreciationEntrySerializer(many=True, read_only=True)
    transactions = AssetTransactionSerializer(many=True, read_only=True)

    # Computed properties
    net_book_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    depreciable_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_fully_depreciated = serializers.BooleanField(read_only=True)
    remaining_life_months = serializers.IntegerField(read_only=True)
    monthly_depreciation = serializers.SerializerMethodField()

    class Meta:
        model = FixedAsset
        fields = [
            'id', 'asset_number', 'description',
            'category', 'category_name', 'status',
            # Physical details
            'serial_number', 'location', 'custodian', 'custodian_name',
            # Acquisition
            'acquisition_date', 'acquisition_cost',
            'vendor', 'vendor_name', 'purchase_order', 'invoice_reference',
            # Depreciation settings
            'depreciation_method', 'useful_life_months', 'salvage_value',
            'depreciation_start_date',
            # GL account overrides
            'asset_account', 'depreciation_expense_account',
            'accumulated_depreciation_account',
            # Calculated
            'accumulated_depreciation', 'net_book_value',
            'depreciable_amount', 'is_fully_depreciated',
            'remaining_life_months', 'monthly_depreciation',
            # Disposal
            'disposal_date', 'disposal_amount', 'disposal_method', 'disposal_notes',
            # Other
            'notes',
            # Nested
            'depreciation_entries', 'transactions',
            # Timestamps
            'created_at', 'updated_at',
        ]
        read_only_fields = ['accumulated_depreciation', 'created_at', 'updated_at']

    def get_custodian_name(self, obj):
        if obj.custodian:
            return obj.custodian.get_full_name() or obj.custodian.username
        return None

    def get_monthly_depreciation(self, obj):
        return str(obj.calculate_monthly_depreciation())
