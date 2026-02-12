# apps/api/v1/serializers/accounting.py
"""
Serializers for Accounting models: Account, JournalEntry, JournalEntryLine.
"""
from rest_framework import serializers
from apps.accounting.models import Account, JournalEntry, JournalEntryLine
from apps.accounting.services import AccountingService, AccountingError
from .base import TenantModelSerializer


class AccountListSerializer(TenantModelSerializer):
    """Lightweight serializer for Account list views."""
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    children_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Account
        fields = [
            'id', 'code', 'name', 'description', 'account_type',
            'parent', 'parent_name', 'is_active', 'is_system',
            'children_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class AccountSerializer(TenantModelSerializer):
    """Standard serializer for Account model."""
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)

    class Meta:
        model = Account
        fields = [
            'id', 'code', 'name', 'description', 'account_type',
            'parent', 'parent_name', 'is_active', 'is_system',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class JournalEntryLineSerializer(TenantModelSerializer):
    """Serializer for JournalEntryLine model."""
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = JournalEntryLine
        fields = [
            'id', 'entry', 'line_number', 'account', 'account_code', 'account_name',
            'description', 'debit', 'credit',
        ]
        read_only_fields = ['account_code', 'account_name']


class JournalEntrySerializer(TenantModelSerializer):
    """Standard serializer for JournalEntry model."""
    total_debit = serializers.DecimalField(max_digits=20, decimal_places=2, read_only=True)
    total_credit = serializers.DecimalField(max_digits=20, decimal_places=2, read_only=True)
    is_balanced = serializers.BooleanField(read_only=True)

    class Meta:
        model = JournalEntry
        fields = [
            'id', 'entry_number', 'date', 'memo', 'reference_number',
            'entry_type', 'status', 'fiscal_period',
            'total_debit', 'total_credit', 'is_balanced',
            'posted_at', 'posted_by', 'created_by',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'entry_number', 'status', 'posted_at', 'posted_by',
            'created_at', 'updated_at', 'total_debit', 'total_credit', 'is_balanced',
        ]


class JournalEntryDetailSerializer(JournalEntrySerializer):
    """Detailed serializer for JournalEntry with nested lines."""
    lines = JournalEntryLineSerializer(many=True, read_only=True)

    class Meta(JournalEntrySerializer.Meta):
        fields = JournalEntrySerializer.Meta.fields + ['lines']


class JournalEntryCreateSerializer(TenantModelSerializer):
    """Serializer for creating journal entries via AccountingService."""
    lines = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        help_text="List of line items with account, description, debit, credit"
    )

    class Meta:
        model = JournalEntry
        fields = [
            'date', 'memo', 'reference_number', 'entry_type', 'lines',
        ]

    def create(self, validated_data):
        """Create entry using AccountingService."""
        lines_data = validated_data.pop('lines')
        request = self.context.get('request')
        tenant = request.tenant if request else None

        if not tenant:
            raise serializers.ValidationError("Tenant context is required")

        # Use AccountingService to create entry
        service = AccountingService(tenant)
        try:
            entry = service.create_entry(
                entry_date=validated_data['date'],
                memo=validated_data['memo'],
                lines=lines_data,
                reference_number=validated_data.get('reference_number', ''),
                entry_type=validated_data.get('entry_type', JournalEntry.EntryType.STANDARD),
                created_by=request.user if request else None,
                auto_post=False
            )
        except AccountingError as e:
            raise serializers.ValidationError(str(e))

        return entry
